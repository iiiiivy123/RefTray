const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Options=require('../../source/extension/capture-options.js');
const pageReader=require('../../source/extension/page-reader.js').create({});

test('tab completion between initial read and listener setup does not time out',{timeout:1500},async()=>{
 const text=fs.readFileSync('source/extension/background.js','utf8');let reads=0,listener,cleared=false;
 const ctx=vm.createContext({setTimeout:()=>1,clearTimeout:()=>{cleared=true;},
  chrome:{tabs:{get:async()=>({status:++reads===1?'loading':'complete'}),onUpdated:{addListener:f=>listener=f,removeListener:f=>{assert.equal(f,listener);listener=null;}}}}});
 vm.runInContext(text.slice(text.indexOf('async function waitForTab('),text.indexOf('async function pageProblem(')),ctx);
 await ctx.waitForTab(7);assert.equal(reads,2);assert.equal(listener,null);assert.equal(cleared,true);
});

test('MCP Huaban opening accepts verified readable DOM while tab stays loading',{timeout:1500},async()=>{
 const text=fs.readFileSync('source/extension/background.js','utf8');let listener,probes=0;
 const ctx=vm.createContext({setTimeout,clearTimeout,pageReader:{tabReady:async tab=>{probes++;return tab.url==='https://huaban.com/boards/102999899';}},
  chrome:{tabs:{get:async()=>({id:7,status:'loading',url:'https://huaban.com/boards/102999899'}),onUpdated:{addListener:f=>listener=f,removeListener:()=>listener=null}}}});
 vm.runInContext(text.slice(text.indexOf('async function waitForTab('),text.indexOf('async function pageProblem(')),ctx);
 await ctx.waitForTab(7,{documentReady:true});assert.equal(probes,1);assert.equal(listener,null);
});
test('MCP shares normalization while retaining explicit comments, replies, subtitles and destination',()=>{
 const options={include_comments:true,comment_limit:6,include_replies:true,replies_per_comment:2,video_action:'frames',subtitle_mode:'with_video',destination:'F:/chosen',skip_gifs:false,ocr_enabled:true};
 const r=Options.browser({mode:'text',scope:'author',options});
 assert.equal(r.include_comments,true);assert.equal(r.replies_per_comment,2);assert.equal(r.capture_scope,'batch');assert.equal(r.extract_frames,true);assert.equal(r.destination,'F:/chosen');
 const plain=Options.browser({mode:'plain',scope:'single',options});assert.equal(plain.include_images,false);assert.equal(plain.ocr_enabled,false);assert.equal(plain.md_only,true);
 const audio=Options.browser({mode:'video',scope:'author',options:{...options,output_format:'audio'}});
 assert.equal(audio.video_only,true);assert.equal(audio.include_comments,false);assert.equal(audio.subtitle_mode,'none');assert.equal(audio.extract_frames,false);
 assert.equal(options.video_action,'frames');
});
test('Worker claims and completes a task with no popup, opens target and forwards options',async()=>{
 const store={},calls=[],events={};let taskId='mcp-id',heartbeat;
 const item={id:taskId,request:{url:'https://x.com/example/status/123',scope:'single',mode:'text',operation:'capture',options:{include_comments:true,comment_limit:5,video_action:'skip'}}};
 const context=vm.createContext({URL,crypto:{randomUUID:()=> 'client'},AbortSignal,console,
 setInterval:fn=>{heartbeat=fn;return 1;},clearInterval:()=>{},Date,CaptureOptions:Options,pageReader,taskContext:{options:{}},taskRunning:false,scanInProgress:false,
 chrome:{runtime:{getManifest:()=>({version:'test'})},storage:{local:{get:async keys=>typeof keys==='string'?{[keys]:store[keys]}:Object.fromEntries(keys.map(k=>[k,store[k]])),set:async value=>Object.assign(store,value),remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete store[k];}}},
 tabs:{query:async()=>[],create:async value=>{calls.push(['tab',value]);return {id:7,url:value.url};},get:async()=>({id:7,url:item.request.url,status:'complete'})}},
 reftrayHealth:async()=>({json:async()=>({settings_token:'token'})}),waitForTab:async()=>{},controlPoint:async()=>{},
 fetch:async(url,opts)=>{calls.push([url,JSON.parse(opts.body||'{}')]);return {ok:true,json:async()=>url.endsWith('/claim')?{item}:url.includes('/progress/')?{action:'running'}:{ok:true}};},
 TaskProgress:{resultStatus:()=> 'completed'},reportProgress:async()=>{},TaskStore:{save:async()=>{}},
 collect:async(mode,port,options,target)=>{
  calls.push(['collect',{mode,port,options,target}]);context.taskContext={bridgeId:taskId,id:'new-child',options};
  store.liblibProgress={context:{id:'old-child'},message:'old task'};
  store.collectorBackendPending={taskId:'old-child',kind:'video',jobId:'old-job'};
  await heartbeat();
  const progress=calls.filter(c=>c[0].includes('/progress/')).at(-1)[1];
  assert.equal(progress.backend_job,null);assert.notEqual(progress.progress.message,'old task');
  store.collectorBackendPending={taskId:'new-child',kind:'resolve',jobId:'new-job'};
  await heartbeat();assert.equal(calls.filter(c=>c[0].includes('/progress/')).at(-1)[1].backend_job.jobId,'new-job');
  return {directory:'F:/result',new_images:2};
 }
 });
 vm.runInContext(fs.readFileSync('source/extension/browser-runner.js','utf8'),context);
 await vm.runInContext('BrowserRunner.receive()',context);
 assert.equal(calls.find(c=>c[0]==='tab')[1].active,false);
 const collect=calls.find(c=>c[0]==='collect')[1];assert.equal(collect.options.include_comments,true);assert.equal(collect.options.comment_limit,5);assert.equal(collect.target.bridgeId,taskId);
 const result=calls.find(c=>c[0].includes('/browser/result/'))[1];assert.equal(result.status,'completed');assert.equal(result.result.directory,'F:/result');
 assert.equal(store.collectorBrowserResult,undefined);
 assert.ok(calls.some(c=>c[0].includes('/browser/result/')&&c[1].result?.new_images===2));
 assert.equal(vm.runInContext('taskRunning',context),false);
});
test('Worker handles canonical redirects, validates post identity and downloads all selected media in order',async()=>{
 const seen=[];const ctx=vm.createContext({URL,chrome:{},module:{exports:{}},taskContext:{},
 loadedPageMedia:async()=>({postId:'123',media:[{kind:'video',url:'one'},{kind:'photo',url:'photo'},{kind:'video',url:'two'}]}),
 controlPoint:async()=>{},reportProgress:async()=>{},
 downloadVideo:async(tab,port,options)=>{seen.push(options.source.url);return {new_videos:1,directory:'result'};},
 matureMedia:async()=>{throw Error('unexpected public fallback');}});
 const background=(fs.readFileSync('source/extension/page-reader.js','utf8')+'\n'+fs.readFileSync('source/extension/background.js','utf8'));
 vm.runInContext(background.slice(background.indexOf('async function videoSource('),background.indexOf('async function browserYouTubeCaptions(')),ctx);
 vm.runInContext(fs.readFileSync('source/extension/browser-runner.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync('source/extension/video-sequence.js','utf8'),ctx);
 const runner=ctx.module.exports;
 assert.equal(runner.identity('https://youtu.be/abcdefghijk'),runner.identity('https://www.youtube.com/watch?v=abcdefghijk'));
 assert.equal(runner.identity('https://twitter.com/a/status/123/video/1'),runner.identity('https://x.com/b/status/123'));
 assert.notEqual(runner.identity('https://x.com/a/status/123'),runner.identity('https://x.com/a/status/124'));
 assert.equal(runner.identity('https://huaban.com/boards/102999899'),runner.identity('https://huaban.com/discovery/boards/102999899'));
 assert.notEqual(runner.identity('https://huaban.com/boards/102999899'),runner.identity('https://huaban.com/discovery/boards/9'));
 const result=await ctx.downloadVideoSequence({id:1,url:'https://x.com/a/status/123'},8766,{}, {},false);
 assert.deepEqual(seen,['one','two']);assert.equal(result.new_videos,2);assert.equal(result.status,'completed');
 seen.length=0;await ctx.downloadVideoSequence({id:1,url:'https://x.com/a/status/123'},8766,{media_index:2},{},false);
 assert.deepEqual(seen,['two']);
 await assert.rejects(()=>ctx.downloadVideoSequence({id:1,url:'https://x.com/a/status/124'},8766,{}, {},false),/unexpected public fallback/);
});
test('MCP X batch starts in its own visible tab; other platforms and X singles retain their behavior',async()=>{
 const created=[],existing={id:5,url:'https://x.com/kissmeow6',status:'complete',active:true};let latest;
 const ctx=vm.createContext({URL,module:{exports:{}},waitForTab:async()=>{},chrome:{tabs:{
  query:async()=>[existing],create:async value=>{created.push(value);latest={id:6,...value};return latest;},get:async id=>id===5?existing:latest
 }}});
 vm.runInContext(fs.readFileSync('source/extension/browser-runner.js','utf8'),ctx);
 const runner=ctx.module.exports;
 assert.equal((await runner.target(existing.url,'author')).id,6);assert.equal(created.at(-1).active,true);
 await runner.target('https://x.com/kissmeow6/status/123','single');assert.equal(created.at(-1).active,false);
 await runner.target('https://www.instagram.com/example/','author');assert.equal(created.at(-1).active,false);
 assert.equal(existing.url,'https://x.com/kissmeow6');
});

test('Worker preserves an undelivered result and sends it before accepting another task',async()=>{
 const store={},calls=[];let deliveryFails=true,claimed=false,collectCount=0;
 const item={id:'one',request:{url:'https://example.org/post',scope:'single',mode:'images',operation:'capture',options:{video_action:'skip'}}};
 const ctx=vm.createContext({URL,crypto:{randomUUID:()=> 'client'},AbortSignal,console,Date,
 setInterval:()=>1,clearInterval:()=>{},CaptureOptions:Options,pageReader,taskContext:{options:{}},taskRunning:false,scanInProgress:false,
 chrome:{runtime:{getManifest:()=>({version:'test'})},storage:{local:{
 get:async keys=>typeof keys==='string'?{[keys]:store[keys]}:Object.fromEntries(keys.map(k=>[k,store[k]])),
 set:async value=>Object.assign(store,value),remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete store[k];}}},
 tabs:{query:async()=>[{id:1,url:item.request.url}],get:async()=>({id:1,url:item.request.url})}},
 reftrayHealth:async()=>({json:async()=>({settings_token:'token'})}),waitForTab:async()=>{},controlPoint:async()=>{},
 fetch:async(url,opts)=>{calls.push(url);if(url.includes('/result/')&&deliveryFails)throw Error('offline');return {ok:true,json:async()=>{
 if(url.endsWith('/claim')){const next=claimed?null:item;claimed=true;return {item:next};}
 return url.includes('/progress/')?{action:'running'}:{ok:true};}};},
 TaskProgress:{resultStatus:()=> 'completed'},reportProgress:async()=>{},
 collect:async()=>{collectCount++;return {directory:'F:/kept',new_images:1};}
 });
 vm.runInContext(fs.readFileSync('source/extension/browser-runner.js','utf8'),ctx);
 await vm.runInContext('BrowserRunner.receive()',ctx);
 assert.equal(store.collectorBrowserResult.payload.result.directory,'F:/kept');
 deliveryFails=false;calls.length=0;await vm.runInContext('BrowserRunner.receive()',ctx);
 assert.ok(calls[0].includes('/result/one'));assert.ok(calls[1].endsWith('/claim'));
 assert.equal(collectCount,1);assert.equal(store.collectorBrowserResult,undefined);
});

test('Bilibili tracking redirects keep the same post while P and video changes remain rejected',async()=>{
 const original='https://www.bilibili.com/video/BV1wWJa61EYv/';
 let current=original+'?vd_source=browser-added&spm_id_from=333.337.search-card.all.click';
 const ctx=vm.createContext({URL,module:{exports:{}},waitForTab:async()=>{},chrome:{tabs:{
  query:async()=>[],create:async value=>({id:12,url:value.url}),get:async()=>({id:12,url:current})
 }}});
 vm.runInContext(fs.readFileSync('source/extension/browser-runner.js','utf8'),ctx);
 const runner=ctx.module.exports;
 assert.equal((await runner.target(original,'author')).id,12);
 current=original+'?p=3&vd_source=browser-added';
 assert.equal((await runner.target(original+'?p=3','single')).id,12);
 await assert.rejects(()=>runner.target(original+'?p=2','single'),/网页跳转/);
 current='https://www.bilibili.com/video/BV1ySaf69EAp/?vd_source=browser-added';
 await assert.rejects(()=>runner.target(original,'author'),/网页跳转/);
 current='https://passport.bilibili.com/login';
 await assert.rejects(()=>runner.target(original,'author'),/网页跳转/);
});
test('Worker does not claim or reset controls when manual capture starts during its health check',async()=>{
 let claimed=false;const store={liblibControl:'paused'};
 const ctx=vm.createContext({URL,crypto:{randomUUID:()=> 'client'},AbortSignal,Date,
 setInterval:()=>1,clearInterval:()=>{},taskContext:{options:{}},taskRunning:false,scanInProgress:false,
 chrome:{runtime:{getManifest:()=>({version:'test'})},storage:{local:{
 get:async keys=>Object.fromEntries(keys.map(k=>[k,store[k]])),set:async v=>Object.assign(store,v),remove:async()=>{throw Error('manual state removed');}}}},
 reftrayHealth:async()=>{ctx.taskRunning=true;return {json:async()=>({settings_token:'token'})};},
 fetch:async()=>{claimed=true;throw Error('must not claim');}
 });
 vm.runInContext(fs.readFileSync('source/extension/browser-runner.js','utf8'),ctx);
 await vm.runInContext('BrowserRunner.receive()',ctx);
 assert.equal(claimed,false);assert.equal(store.liblibControl,'paused');assert.equal(ctx.taskRunning,true);
});

test('Huaban MCP reuses the matching loaded board while other lists still get their own tab',async()=>{
 let created=0;const url='https://huaban.com/boards/102999899';
 const loaded={id:8,url:'https://huaban.com/discovery/boards/102999899',status:'complete'};
 const ctx=vm.createContext({URL,module:{exports:{}},waitForTab:async()=>{},chrome:{tabs:{
  query:async()=>[{id:7,url,status:'loading'},loaded],create:async value=>{created++;return {id:9,url:value.url};},
  get:async id=>id===8?loaded:{id:9,url:'https://www.pinterest.com/ivy/board/'}
 }}});
 vm.runInContext(fs.readFileSync('source/extension/browser-runner.js','utf8'),ctx);
 assert.equal((await ctx.module.exports.target(url,'board')).id,8);assert.equal(created,0);
 assert.equal((await ctx.module.exports.target('https://www.pinterest.com/ivy/board/','board')).id,9);assert.equal(created,1);
});

test('MCP prefers a usable matching page over an older loading or frozen duplicate',async()=>{
 const url='https://huaban.com/pins/7319587312';
 const tabs=[{id:1,url,status:'loading'},{id:2,url,status:'complete',frozen:true,active:true},{id:3,url,status:'complete',lastAccessed:20},{id:4,url,status:'complete',lastAccessed:10,active:true}];
 const ctx=vm.createContext({URL,module:{exports:{}},waitForTab:async()=>{},chrome:{tabs:{query:async()=>tabs,get:async id=>tabs.find(t=>t.id===id),create:async()=>{throw Error('must reuse');}}}});
 vm.runInContext(fs.readFileSync('source/extension/browser-runner.js','utf8'),ctx);
 assert.equal((await ctx.module.exports.target(url,'single')).id,4);
 tabs[3].active=false;assert.equal((await ctx.module.exports.target(url,'single')).id,3);
});
