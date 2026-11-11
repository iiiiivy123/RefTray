const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const extension=process.env.REFTRAY_EXTENSION||path.resolve(__dirname,'../../source/extension');
const background=(fs.readFileSync('source/extension/page-reader.js','utf8')+'\n'+fs.readFileSync(path.join(extension,'background.js'),'utf8'));
function functionSource(name,next){const start=background.indexOf('async function '+name+'(');const end=background.indexOf('async function '+next+'(',start+1);assert.ok(start>=0&&end>start);return background.slice(start,end);}

function pageMedia(){
  let resolves=0;
  const context=vm.createContext({URL,Map,Error,controlPoint:async()=>{},chrome:{storage:{local:{set:async()=>{},remove:async()=>{}}},tabs:{get:async()=>({url:'https://x.com/user/status/123'})},scripting:{executeScript:async()=>[{result:{media:[]}}]}},
    service:async path=>{if(path.endsWith('/start')){resolves++;if(resolves===1)throw new Error('resolver failure');return {job_id:'resolution'};}return {status:'completed',result:{media:[{kind:'video',url:'https://example.org/video'}]}};}});
  vm.runInContext('let taskContext={options:{}};let healthCache={};let resolvedMedia=new Map();async function setMediaQuality(){};'+functionSource('matureMedia','reportProgress')+functionSource('loadedPageMedia','includeProtectedImages'),context);
  return {context,calls:()=>resolves};
}
test('X1 image-only page read never invokes the mature video resolver',async()=>{
  const {context,calls}=pageMedia();await vm.runInContext('loadedPageMedia(1,false,taskContext.options)',context);assert.equal(calls(),0);
});
test('X1 resolver failures remain errors and rejected promises are evicted for retry',async()=>{
  const {context,calls}=pageMedia();
  await assert.rejects(vm.runInContext('loadedPageMedia(1,true)',context),/resolver failure/);
  const second=await vm.runInContext('loadedPageMedia(1,true)',context);
  assert.equal(calls(),2);assert.equal(second.media[0].kind,'video');
});
test('X1 rejected mature resolver promise is not cached',async()=>{
  const {context,calls}=pageMedia();
  await assert.rejects(vm.runInContext("matureMedia('https://x.com/user/status/123')",context),/resolver failure/);
  const second=await vm.runInContext("matureMedia('https://x.com/user/status/123')",context);
  assert.equal(calls(),2);assert.equal(second.media[0].kind,'video');
});
test('D4 partial frame extraction reaches final collectVideo result',async()=>{
  const context=vm.createContext({URL,crypto:require('node:crypto').webcrypto,chrome:{runtime:{getURL:x=>'chrome-extension://test/'+x,sendMessage:async()=>({ok:true,result:{saved:2,skipped:0,partial:true,omitted:3}})}}});
  vm.runInContext('let videoSession;'+functionSource('collectVideo','videoMessage'),context);
  const result=await vm.runInContext("collectVideo({id:1,url:'chrome-extension://test/video.html'},8766,{})",context);
  assert.equal(result.partial,true);assert.equal(result.omitted_images,3);assert.doesNotMatch(result.message,/抽帧完成/);
});
test('T1 media 5→80 percent never changes overall batch 3/5, streaming batch uses requested target',()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(extension,'task-progress.js'),'utf8'),context);
  const job={limit:5,queue:['a','b','c','d','e'],queue_complete:true,records:{a:{status:'saved'},b:{status:'saved'},c:{status:'failed'}}};
  const first=context.TaskProgress.reduce({}, {percent:5},job),second=context.TaskProgress.reduce(first,{percent:80},job);
  assert.equal(first.percent,60);assert.equal(second.percent,60);assert.equal(second.batch.processed,3);assert.equal(second.current.percent,80);
  const unknown=context.TaskProgress.reduce(second,{percent:80},{...job,queue_complete:false});assert.equal(unknown.percent,60);assert.equal(unknown.batch.total,5);
});

test('Pinterest ring distinguishes scanning, fixed queue, complete, partial, paused and stopped',()=>{
 const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(extension,'task-progress.js'),'utf8'),c);
 const progress=c.TaskProgress;
 assert.equal(progress.ring({status:'running',batch:{processed:0,total:null}},true).indeterminate,true);
 const running=progress.ring({status:'running',batch:{processed:1,total:2},current:{percent:80}},true);
 assert.equal(running.text,'50%');assert.equal(running.indeterminate,false);
 const done=progress.ring({status:'completed',batch:{processed:10,total:null}},false);
 assert.equal(done.text,'✓');assert.equal(done.percent,100);assert.equal(done.label,'本轮完成');
 for(const status of ['partial','failed','stopped','paused']){
  const state=progress.ring({status,batch:{processed:1,total:2}},status==='paused');
  assert.equal(state.indeterminate,false);assert.notEqual(state.text,'✓');assert.equal(state.percent,50);
 }
});

test('video phases never fabricate 0 percent; batch video target and current file stay separate',()=>{
 const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(extension,'task-progress.js'),'utf8'),c);
 const t=c.TaskProgress,unknown=t.reduce({}, {stage:'downloading',percent:null,message:'已接收 2 MB · 总大小未知'});
 assert.equal(t.ring(unknown,true).text,'…');assert.equal(t.ring(unknown,true).indeterminate,true);
 assert.doesNotMatch(t.labels(unknown,true).current,/0%/);assert.equal(t.labels(unknown,true).phase,1);
 const job={limit:5,options:{video_only:true},queue:[],records:{a:{status:'saved',video_count:2,videos:1,existingVideos:1},b:{status:'skipped',video_count:0}}};
 const batch=t.reduce({}, {stage:'downloading',percent:80,message:'下载当前视频'},job);
 assert.equal(batch.percent,40);assert.equal(batch.current.percent,80);
 assert.match(t.labels(batch,true).aggregate,/已检查 2 帖.*已处理视频 2 \/ 本轮目标 5 个/);
 assert.match(t.labels(batch,true).counts,/新保存 1 个.*已有 1 个.*跳过 1 帖/);
 assert.equal(t.ring(batch,true).label,'本轮视频');
 const processing=t.reduce(batch,{stage:'processing',percent:null,message:'正在转换 GIF'},job);
 assert.equal(processing.current.percent,null);assert.equal(t.labels(processing,true).phase,2);
 assert.doesNotMatch(t.labels(processing,true).current,/80%/);
});

test('X image mode accepts exact-post GIF-only media without requiring the video mode',async()=>{
 const url='https://x.com/example/status/123';
 const c=vm.createContext({URL,Error,chrome:{tabs:{sendMessage:async()=>({error:'未能确认正文媒体'})}},
  inject:async()=>{},loadedPageMedia:async()=>({postId:'123',has_gif:true,media:[{kind:'gif',url:'https://video.twimg.com/tweet_video/cat.mp4'}]})});
 vm.runInContext('let taskContext={options:{collection_mode:"images"}};'+functionSource('readPagePayload','loadedMedia'),c);
 const result=await vm.runInContext(`readPagePayload(1,{collection_mode:'images',skip_gifs:false},{url:'${url}',title:'Cat GIF'})`,c);
 assert.equal(result.error,null);assert.equal(result._media[0].kind,'gif');assert.equal(result.images.length,0);
 assert.equal(result.has_video,true);assert.equal(result.canonical_url,url);
});

test('a DOM-marked blob GIF may resolve in image mode; skipping GIF never invokes the resolver',async()=>{
 let calls=0;
 const c=vm.createContext({URL,Error,chrome:{tabs:{get:async()=>({url:'https://x.com/example/status/123'})},scripting:{executeScript:async()=>[{result:{postId:'123',has_gif:true,media:[]}}]}},
  matureMedia:async()=>{calls++;return {media:[{kind:'gif',url:'https://video.twimg.com/tweet_video/cat.mp4'},{kind:'video',url:'https://example.org/unrelated.mp4'}]};}});
 vm.runInContext('let taskContext={options:{skip_gifs:false}};let healthCache={};async function setMediaQuality(){};'+functionSource('loadedPageMedia','includeProtectedImages'),c);
 const r=await vm.runInContext('loadedPageMedia(1,false,taskContext.options)',c);
 assert.equal(calls,1);assert.equal(r.media.length,1);assert.equal(r.media[0].kind,'gif');
 vm.runInContext('taskContext.options.skip_gifs=true',c);await vm.runInContext('loadedPageMedia(1,false,taskContext.options)',c);assert.equal(calls,1);
});

test('X guest singleton cannot replace a different selected page video',async()=>{
 const selected={kind:'video',url:'https://video.twimg.com/ext_tw_video/123/vid/main.mp4'};
 const guest={kind:'video',url:'https://video.twimg.com/ext_tw_video/456/vid/other.mp4'};
 const c=vm.createContext({URL,matureMedia:async()=>({media:[guest]})});
 vm.runInContext(functionSource('videoSource','browserYouTubeCaptions'),c);
 const result=await c.videoSource({url:'https://x.com/example/status/789'},{source:selected});
 assert.equal(result.url,selected.url);
});

test('X batch keeps its verified post title while the work tab is still opening',async()=>{
 const selected={kind:'video',url:'https://video.twimg.com/ext_tw_video/123/vid/main.mp4',page_title:'A kitten at home'};
 const c=vm.createContext({URL});vm.runInContext(functionSource('videoSource','browserYouTubeCaptions'),c);
 const result=await c.videoSource({url:'https://x.com/example/status/789',title:'x.com/example/status/789'},{source:selected});
 assert.equal(result.page_title,selected.page_title);assert.equal(result.canonical_url,'https://x.com/example/status/789');assert.equal(result.url,selected.url);
});

test('X image collection with video enabled accepts a video-only exact-post page record',async()=>{
 const url='https://x.com/example/status/123';
 const selected={kind:'video',url:'https://video.twimg.com/ext_tw_video/777/vid/main.mp4'};
 const c=vm.createContext({URL,chrome:{tabs:{sendMessage:async()=>({error:'正文图片缺失'})}},
  inject:async()=>{},loadedPageMedia:async()=>({postId:'123',media:[selected]})});
 vm.runInContext('let taskContext={options:{}};'+functionSource('readPagePayload','loadedMedia'),c);
 const result=await c.readPagePayload(1,{include_videos:true},{url,title:'Video'});
 assert.equal(result._media[0].url,selected.url);
 assert.equal(result.has_video,true);
 await assert.rejects(c.readPagePayload(1,{include_videos:false},{url,title:'Video'}),/正文图片缺失/);
 await assert.rejects(c.readPagePayload(1,{include_videos:true},{url:url+'4',title:'Other'}),/正文图片缺失/);
});

test('release checks separate offline, ignored, deferred, busy, old and newer releases',async()=>{
 const store={}, panelNodes=new Map();let calls=0,shown=0,online=true;
 const panel={show(){shown++;},close(){},querySelector(s){if(!panelNodes.has(s))panelNodes.set(s,{dataset:{}});return panelNodes.get(s);}};
 const context=vm.createContext({AbortSignal,UI:{t:x=>x},document:{querySelector:s=>s==='dialog[open]'?null:panel},
  chrome:{storage:{local:{get:async()=>store,set:async x=>Object.assign(store,x)}}},
  fetch:async()=>{calls++;if(!online)throw Error('offline');return {ok:true,json:async()=>({tag_name:'v0.5.39',body:'release notes'})};}});
 const updates=vm.runInContext(fs.readFileSync(path.join(extension,'release-check.js'),'utf8')+';RefTrayUpdates',context);
 assert.equal(updates.newer('v0.10.0','0.9.99'),true);
 assert.equal(updates.newer('v0.6.0-rc.1','0.5.38'),false);
 await updates.notify('0.5.40',()=>false);await updates.notify('0.5.39',()=>false);
 await updates.notify('0.5.38',()=>true);assert.equal(shown,0);
 await updates.notify('0.5.38',()=>false);assert.equal(shown,1);assert.equal(calls,1);
 assert.equal(panelNodes.get('p').textContent,'release notes');
 assert.equal(panelNodes.get('[data-update]').dataset.version,'v0.5.39');
 await panelNodes.get('[data-later]').onclick();await updates.notify('0.5.38',()=>false);assert.equal(shown,1);
 store.releaseLater.until=0;await updates.notify('0.5.38',()=>false);assert.equal(shown,2);
 await panelNodes.get('[data-ignore]').onclick();await updates.notify('0.5.38',()=>false);assert.equal(shown,2);
 delete store.releaseCheck;online=false;assert.equal(await updates.check('0.5.38'),null);
 assert.match(store.releaseCheck.error,/offline/);assert.ok(store.releaseCheck.nextCheck>Date.now());
});

test('rate-limited release lookup respects the server deadline and preserves cached releases',async()=>{
 const now=Date.now(),reset=Math.ceil(now/1000)+7200;
 const store={releaseCheck:{latest:{version:'v1.0.0',notes:'cached'}}};
 let calls=0;
 const context=vm.createContext({AbortSignal,chrome:{storage:{local:{get:async()=>store,set:async x=>Object.assign(store,x)}}},
  fetch:async()=>{calls++;return {ok:false,status:403,headers:new Headers({'x-ratelimit-reset':String(reset),'retry-after':'60'})};}});
 const updates=vm.runInContext(fs.readFileSync(path.join(extension,'release-check.js'),'utf8')+';RefTrayUpdates',context);
 assert.equal((await updates.check('0.5.40')).version,'v1.0.0');
 assert.equal(store.releaseCheck.nextCheck,reset*1000);
 await updates.check('0.5.40');assert.equal(calls,1);
});

test('ArtStation share image must be declared by the same artwork',()=>{
 const {extract}=require('../../source/extension/artstation.js');
 const url='https://www.artstation.com/artwork/abc';
 const doc={querySelectorAll:()=>[],querySelector:q=>q.includes('og:url')?{content:'https://example.org/artwork/abc'}:q.includes('og:image')?{content:'https://cdn.artstation.com/p/assets/images/images/sample.jpg'}:null};
 assert.throws(()=>extract(url,doc),/ArtStation/);
});
