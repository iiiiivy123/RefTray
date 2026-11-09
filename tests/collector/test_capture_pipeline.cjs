const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const background=fs.readFileSync('source/extension/background.js','utf8');
const start=background.indexOf('async function inspectPage(');
const end=background.indexOf('chrome.runtime.onMessage.addListener',start);
const previewCode=background.slice(start,end);
const previewStorage=()=>({local:{get:async()=>({}),set:async()=>{},remove:async()=>{}}});

test('preview owns the scan slot until extraction finishes and releases it on errors',async()=>{
 let release;const gate=new Promise(r=>release=r),url='https://example.org/article';
 const prior={options:{output_format:'audio',skip_gifs:true}};
 const ctx=vm.createContext({taskRunning:false,scanInProgress:false,taskContext:prior,healthCache:null,
  chrome:{tabs:{get:async()=>({url})},storage:previewStorage()},ensureBackendIdle:async()=>{},reftrayHealth:async()=>({json:async()=>({})}),
  pagePayload:async(id,options)=>{assert.equal(options.output_format,'original');assert.equal(ctx.taskContext.options.output_format,'original');await gate;throw Error('page unavailable');}});
 vm.runInContext(previewCode,ctx);
 const running=ctx.previewCollection(7,url);
 try{
  assert.equal(ctx.scanInProgress,true);
  await assert.rejects(ctx.previewCollection(7,url),/正在运行/);
 }finally{release();await assert.rejects(running,/page unavailable/);}
 assert.equal(ctx.scanInProgress,false);
 assert.equal(ctx.taskContext,prior);
});

test('inspection cannot replace an unfinished backend job, and ignores controls from an old task',async()=>{
 const old={options:{}},store={liblibControl:'stopped',collectorBackendPending:{kind:'video',jobId:'previous'}};
 let blocking=true,reads=0;
 const ctx=vm.createContext({taskContext:old,taskRunning:false,scanInProgress:false,
  chrome:{storage:{local:{get:async()=>store,set:async v=>Object.assign(store,v),remove:async k=>delete store[k]}}},
  ensureBackendIdle:async()=>{if(blocking)throw Error('后台仍在收尾');}});
 vm.runInContext(previewCode,ctx);
 await assert.rejects(ctx.inspectPage(false,async()=>reads++),/后台仍在收尾/);
 assert.equal(reads,0);assert.equal(store.collectorBackendPending.jobId,'previous');assert.equal(ctx.scanInProgress,false);
 blocking=false;
 await ctx.inspectPage(false,async()=>{reads++;assert.notEqual(store.liblibControl,'stopped');});
 assert.equal(reads,1);assert.equal(ctx.taskContext,old);assert.equal(store.liblibControl,undefined);
});

test('media discovery cache distinguishes audio, video quality and captions',async()=>{
 const calls=[];
 const ctx=vm.createContext({taskContext:{options:{output_format:'audio'}},resolvedMedia:new Map(),
  resolveMediaInWorker:async value=>{calls.push(value);return value;}});
 const from=background.indexOf('async function matureMedia('),to=background.indexOf('async function resolveMediaInWorker(');
 vm.runInContext(background.slice(from,to),ctx);
 const url='https://www.youtube.com/watch?v=abcdefghijk';
 await ctx.matureMedia(url);
 await ctx.matureMedia(url,{output_format:'original',video_quality:'720',subtitle_mode:'none'});
 await ctx.matureMedia(url,{output_format:'original',video_quality:'720',subtitle_mode:'none'});
 assert.equal(calls.length,2);
 assert.equal(calls[1].output_format,'original');assert.equal(calls[1].quality,'720');assert.equal(calls[1].captions,false);
});

test('manual and MCP resolution cancel the backend and retain a stopping job marker',async()=>{
 const from=background.indexOf('async function resolveMediaInWorker('),to=background.indexOf('const wait =',from);
 for(const bridgeId of [undefined,'mcp']){
  const store={},calls=[];
  const ctx=vm.createContext({taskContext:{id:'child',bridgeId},
   chrome:{storage:{local:{set:async v=>Object.assign(store,v),remove:async k=>delete store[k]}}},
   controlPoint:async()=>{throw Error('USER_STOPPED');},
   service:async(path,options)=>{calls.push(path);if(path.endsWith('/start'))return {job_id:'resolution'};if(path.includes('/stop/'))return {status:'stopping'};throw Error('unexpected request');}});
  vm.runInContext(background.slice(from,to),ctx);
  await assert.rejects(ctx.resolveMediaInWorker({url:'https://example.org/video'}),/USER_STOPPED/);
  assert.deepEqual(calls,['/media/resolve/start','/media/resolve/stop/resolution']);
  assert.equal(store.collectorBackendPending.kind,'resolve');assert.equal(store.collectorBackendPending.jobId,'resolution');
 }
});

test('completed resolution releases its marker; a failed delivery also attempts cancellation',async()=>{
 const from=background.indexOf('async function resolveMediaInWorker('),to=background.indexOf('const wait =',from);
 for(const disconnect of [false,true]){
  const store={},calls=[];
  const ctx=vm.createContext({taskContext:{id:'child'},controlPoint:async()=>{},
   chrome:{storage:{local:{set:async v=>Object.assign(store,v),remove:async k=>delete store[k]}}},
   service:async path=>{calls.push(path);if(path.endsWith('/start'))return {job_id:'one'};if(disconnect)throw Error('offline');return {status:'completed',result:{media:['one']}};}});
  vm.runInContext(background.slice(from,to),ctx);
  const pending=ctx.resolveMediaInWorker({url:'https://example.org/video'});
  if(disconnect){await assert.rejects(pending,/offline/);assert.equal(store.collectorBackendPending.jobId,'one');assert.ok(calls.includes('/media/resolve/stop/one'));}
  else{assert.deepEqual((await pending).media,['one']);assert.equal(store.collectorBackendPending,undefined);}
 }
});
test('preview counts the same collected payload without counting comment images or duplicate media',async()=>{
 const calls=[],url='https://x.com/example/status/123';
 const context=vm.createContext({taskRunning:false,scanInProgress:false,taskContext:{options:{}},healthCache:null,chrome:{tabs:{get:async()=>({url})},storage:previewStorage()},ensureBackendIdle:async()=>{},
   reftrayHealth:async()=>({json:async()=>({release:'0.5.41'})}),
   pagePayload:async(id,options)=>{calls.push({id,options});return {images:[{url:'a.jpg'},{url:'a.jpg'},{url:'reply.jpg',role:'comment'}],_media:[{url:'gif.mp4',kind:'gif'},{url:'video.mp4',kind:'video'},{url:'video.mp4',kind:'video'}],has_video:true};}});
 const result=await vm.runInContext(previewCode+';previewCollection(7,'+JSON.stringify(url)+')',context);
 assert.equal(calls.length,1);assert.equal(calls[0].options.include_comments,false);
 assert.deepEqual([result.images,result.gifs,result.videos],[1,1,1]);
});
test('preview fails if navigation changes during extraction',async()=>{
 let reads=0;const url='https://example.org/article';
 const context=vm.createContext({taskRunning:false,scanInProgress:false,taskContext:{options:{}},healthCache:null,chrome:{tabs:{get:async()=>({url:reads++?url+'/other':url})},storage:previewStorage()},ensureBackendIdle:async()=>{},
  reftrayHealth:async()=>({json:async()=>({})}),pagePayload:async()=>({images:[]})});
 await assert.rejects(vm.runInContext(previewCode+';previewCollection(7,'+JSON.stringify(url)+')',context),/页面已切换/);
});
test('ArtStation reads videos only inside the artwork and admits supported embedded players',()=>{
 const {extract}=require('../../source/extension/artstation.js');
 const root={querySelectorAll:selector=>selector==='video'?[{src:'https://cdn.artstation.com/p/assets/videos/sample.mp4',querySelectorAll:()=>[]}]:selector==='iframe[src]'?[{src:'https://www.youtube.com/embed/abcdefghijk'},{src:'https://youtube.com.evil.invalid/embed/abcdefghijk'}]:[]};
 const doc={title:'Work',querySelector:()=>null,querySelectorAll:selector=>selector.startsWith('.project-assets')?[root]:[]};
 const result=extract('https://www.artstation.com/artwork/abc',doc);
 assert.equal(result.has_video,true);assert.equal(result._media.length,2);
 assert.equal(result._media[1].embedded_url,'https://www.youtube.com/watch?v=abcdefghijk');
});

test('generic pages without an article container fail before reading the whole body',()=>{
 const code=fs.readFileSync('source/extension/platforms.js','utf8');
 const context=vm.createContext({URL,location:new URL('https://example.org/article'),
   document:{body:{textContent:'Navigation and unrelated recommendations'},querySelector:()=>null,querySelectorAll:()=>[]}});
 vm.runInContext(code,context);
 assert.throws(()=>vm.runInContext('InspirationPlatforms.extract({collection_mode:"text"})',context),/未找到明确的文章正文/);
});
