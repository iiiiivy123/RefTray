const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const CaptureOptions=require('../../source/extension/capture-options.js');
const CollectorSite=require('../../source/extension/site-panel.js');
function worker({busy=false,shotFailure=false,site={single:true},defaults={},preview,previewError,previewWait,onCollect}={}){
 let listener;const calls=[],progress=[];
 const chrome={tabs:{create:async value=>calls.push(value),get:async id=>({id,url:'https://example.com/page',title:'Page'})},runtime:{id:'extension',getURL:p=>'chrome-extension://extension/'+p,getManifest:()=>({version:'1.0.3'}),onMessage:{addListener:f=>listener=f}},storage:{local:{set:async v=>progress.push(v),remove:async k=>calls.push(['clear',k])}}};
 const context={chrome,URL,taskRunning:busy,scanInProgress:false,taskContext:{},CaptureOptions,ensureBackendIdle:async()=>calls.push(['idle']),
  reftrayHealth:async()=>({ok:true,json:async()=>({release:'1.0.3',settings_token:'test',busy:false,inbox:'F:/TestLibrary'})}),
  downloadApi:async(...args)=>{calls.push(args);return {collection_mode:'text',layout:'organized_flat',include_images:true,video_action:'skip',ocr_enabled:false,...defaults};},
  CollectorSite:{context:()=>site},collect:async(...args)=>{calls.push(args);context.taskContext={quickRequestId:args[3].quickRequestId};if(onCollect)return onCollect(...args);return {message:'saved',new_images:1};},
  previewCollection:async(...args)=>{calls.push(['preview',...args]);if(previewWait)await previewWait;if(previewError)throw Error(previewError);return {url:args[1],state:'ready',images:2,gifs:0,videos:0,has_video:false,has_text:true,kind:'images',...preview};},
  FullPageCapture:{capture:async(tab,{progress})=>{calls.push(['snapshot',tab]);await progress('tile 1/2');if(shotFailure)throw Error('capture failed');return {directory:'F:/TestLibrary/图片/shot',message:'saved PNG'};}},
  reportProgress:async()=>{},TaskProgress:{resultStatus:()=> 'completed'}};
 vm.runInNewContext(fs.readFileSync('source/extension/web-actions-worker.js','utf8'),context);
 return {calls,progress,run:(message,sender)=>new Promise(resolve=>listener(message,sender,resolve))};
}
const sender={id:'extension',frameId:0,tab:{id:42,url:'https://example.com/work'}};
test('hover reads context without saving; opening library ignores a supplied path',async()=>{
 const w=worker({busy:true});const r=await w.run({type:'REFTRAY_FLOATING_CONTEXT'},sender);assert.equal(r.context.mode,'自动识别 · 图文笔记');assert.equal(r.context.directory,'F:/TestLibrary');
 assert.ok(!w.calls.some(c=>c[0]==='current'));
 await w.run({type:'REFTRAY_OPEN_LIBRARY',directory:'F:/untrusted'},sender);assert.equal(w.calls.at(-1)[2],'/settings/open');assert.equal(w.calls.at(-1)[3].directory,'F:/TestLibrary');
 assert.equal((await w.run({type:'REFTRAY_FLOATING_CONTEXT'},{...sender,frameId:1})).ok,false);
});
test('screenshot progress carries tab identity and terminal success or failure',async()=>{
 for(const shotFailure of [false,true]){
  const w=worker({shotFailure});const r=await w.run({type:'REFTRAY_FULL_PAGE',tabId:42},{id:'extension',url:'chrome-extension://extension/popup.html'});
  assert.equal(r.ok,!shotFailure);assert.equal(w.progress[0].reftraySnapshotProgress.status,'running');assert.equal(w.progress.at(-1).reftraySnapshotProgress.status,shotFailure?'failed':'completed');assert.equal(w.progress.at(-1).reftraySnapshotProgress.tabId,42);
 }
});
test('floating navigation opens only fixed internal sections, even while capture is busy',async()=>{
 const w=worker({busy:true});assert.equal((await w.run({type:'REFTRAY_OPEN_MANAGE',section:'history',url:'https://untrusted.example'},sender)).ok,true);
 assert.equal(w.calls[0].url,'chrome-extension://extension/manage.html#history');
 for(const [section,s] of [['https://untrusted.example',sender],['defaults',{...sender,frameId:1}],['history',{...sender,id:'other'}]])assert.equal((await w.run({type:'REFTRAY_OPEN_MANAGE',section},s)).ok,false);
 assert.equal(w.calls.length,1);
});
test('one click uses defaults and the sender tab, never a supplied destination',async()=>{
 const w=worker(),r=await w.run({type:'REFTRAY_QUICK_SAVE',tabId:999,options:{destination:'wrong'}},sender);
 assert.equal(r.ok,true);const call=w.calls.find(c=>c[0]==='current');
 assert.equal(call[2].collection_mode,'text');assert.equal(call[2].layout,'organized_flat');assert.equal(call[2].destination,null);
 assert.equal(call[3].id,42);assert.equal(call[3].url,sender.tab.url);
});

const xhsSender={...sender,tab:{id:42,url:'https://www.xiaohongshu.com/explore/6ae9f8a7000000000e027ca1'}};
test('XHS video quick-save preflights and saves the primary video despite text/skip attachment defaults',async()=>{
 const w=worker({site:{single:true,site:'小红书'},defaults:{include_comments:true,max_video_mb:256},preview:{images:0,videos:1,has_video:true,kind:'video'}});
 const r=await w.run({type:'REFTRAY_QUICK_SAVE'},xhsSender);
 assert.equal(r.ok,true);
 const scan=w.calls.find(c=>c[0]==='preview');assert.ok(scan);assert.deepEqual(scan.slice(1),[42,xhsSender.tab.url,true]);
 const saved=w.calls.find(c=>c[0]==='download');assert.ok(saved);
 assert.ok(w.calls.indexOf(scan)<w.calls.indexOf(saved));
 assert.equal(saved[2].capture_kind,'video');assert.equal(saved[2].collection_mode,'images');assert.equal(saved[2].video_action,'save');
 assert.equal(saved[2].include_images,false);assert.equal(saved[2].include_comments,false);assert.equal(saved[2].max_video_mb,256);
 assert.equal(saved[2].layout,'organized_flat');assert.equal(saved[2].destination,null);
 assert.equal(w.calls.filter(c=>c[0]==='current').length,0);
 assert.ok(!w.calls.some(c=>c[2]==='/settings/defaults'&&c[3]!==undefined));
});
test('XHS image and Live Photo posts retain configured text/GIF behavior',async()=>{
 for(const preview of [{images:3,gifs:0,videos:0,has_video:false,kind:'images'}, {images:0,gifs:2,videos:0,has_video:true,kind:'images'}]){
  const w=worker({site:{single:true,site:'小红书'},preview,defaults:{skip_gifs:false}});
  assert.equal((await w.run({type:'REFTRAY_QUICK_SAVE'},xhsSender)).ok,true);
  assert.ok(w.calls.some(c=>c[0]==='preview'));
  const saved=w.calls.find(c=>c[0]==='current');assert.ok(saved);assert.equal(saved[2].collection_mode,'text');assert.equal(saved[2].skip_gifs,false);
 }
});
test('XHS frames and explicit plain-text preferences are retained',async()=>{
 const frames=worker({site:{single:true,site:'小红书'},defaults:{video_action:'frames'},preview:{images:0,videos:1,has_video:true,kind:'video'}});
 assert.equal((await frames.run({type:'REFTRAY_QUICK_SAVE'},xhsSender)).ok,true);
 assert.ok(frames.calls.some(c=>c[0]==='download-frames'&&c[2].extract_frames));
 const plain=worker({site:{single:true,site:'小红书'},defaults:{md_only:true}});
 assert.equal((await plain.run({type:'REFTRAY_QUICK_SAVE'},xhsSender)).ok,true);
 assert.ok(plain.calls.some(c=>c[0]==='current'&&c[2].md_only));assert.ok(plain.calls.some(c=>c[0]==='preview'));
});
test('XHS failed, loading, empty or stale identification never falls back to saving Markdown',async()=>{
 for(const failure of [{previewError:'页面已切换'}, {preview:{state:'loading'}}, {preview:{warning:'媒体读取失败'}}, {preview:{url:'https://www.xiaohongshu.com/explore/another'}}, {preview:{images:0,gifs:0,videos:0,has_video:false,has_text:false,kind:'plain'}}]){
  const w=worker({site:{single:true,site:'小红书'},...failure});
  const r=await w.run({type:'REFTRAY_QUICK_SAVE'},xhsSender);assert.equal(r.ok,false);assert.ok(r.error);
  assert.ok(!w.calls.some(c=>['current','download','download-frames'].includes(c[0])));
 }
});
test('XHS hover explains automatic selection without starting a scan',async()=>{
 const w=worker({site:{single:true,site:'小红书'}}),r=await w.run({type:'REFTRAY_FLOATING_CONTEXT'},xhsSender);
 assert.match(r.context.mode,/自动识别/);assert.ok(!w.calls.some(c=>c[0]==='preview'));
});

test('all supported single-page platforms preflight; primary video and mixed/GIF content use distinct routes',async()=>{
 const rows=[['https://www.xiaohongshu.com/explore/6ae9f8a7000000000e027ca1','video'],['https://www.bilibili.com/video/BV16HL26BEjd','video'],['https://www.youtube.com/watch?v=abcdefghijk','video'],['https://www.instagram.com/p/AbCd123/','video'],['https://x.com/example/status/123','images'],['https://www.artstation.com/artwork/a123','images'],['https://huaban.com/pins/123','images'],['https://www.pinterest.com/pin/123/','images'],['https://weibo.com/123/AbCd','video'],['https://example.com/article','plain'],['https://svglogo.top/library/consumerBrands/aimeite.svg','images']];
 for(const [url,kind] of rows){
  const preview={kind,images:kind==='images'?2:0,gifs:0,videos:kind==='video'?1:0,has_video:kind==='video',has_text:true};
  const w=worker({site:CollectorSite.context(url),preview});
  const r=await w.run({type:'REFTRAY_QUICK_SAVE',requestId:'owned'}, {...sender,tab:{id:42,url}});
  assert.equal(r.ok,true,url);assert.ok(w.calls.some(c=>c[0]==='preview'),url);
  const call=w.calls.find(c=>c[0]===(kind==='video'?'download':'current'));assert.ok(call,url);
  assert.equal(call[3].quickSave,true);assert.equal(call[3].quickRequestId,'owned');
 }
 for(const preview of [{images:0,gifs:2,videos:0,has_video:true,kind:'images'}, {images:2,gifs:0,videos:1,has_video:true,kind:'images'}]){
  const w=worker({preview});await w.run({type:'REFTRAY_QUICK_SAVE'},sender);const call=w.calls.find(c=>c[0]==='current');assert.ok(call);assert.equal(call[2].video_action,'skip');
 }
});
test('one-time choices override content only and do not persist or accept a caller path',async()=>{
 const w=worker();await w.run({type:'REFTRAY_QUICK_SAVE',choice:'plain',options:{destination:'untrusted'}},sender);
 const plain=w.calls.find(c=>c[0]==='current');assert.equal(plain[2].md_only,true);assert.equal(plain[2].destination,null);
 await w.run({type:'REFTRAY_QUICK_SAVE'},sender);assert.equal(w.calls.filter(c=>c[0]==='current').at(-1)[2].md_only,false);
 assert.ok(!w.calls.some(c=>c[2]==='/settings/defaults'&&c[3]!==undefined));
 assert.equal((await worker().run({type:'REFTRAY_QUICK_SAVE',choice:'anything'},sender)).ok,false);
});
test('saved-folder actions accept a history ID, never a caller directory',async()=>{
 const w=worker();assert.equal((await w.run({type:'REFTRAY_OPEN_SAVED',captureId:7,directory:'untrusted'},sender)).ok,true);
 const call=w.calls.find(c=>c[2]==='/history/7/open');assert.ok(call);assert.deepEqual(Object.keys(call[3]),[]);
 for(const captureId of [-1,0,'7','../settings',1.5])assert.equal((await w.run({type:'REFTRAY_OPEN_SAVED',captureId},sender)).ok,false);
});
test('quick-save download consent still probes and enforces the per-file size limit',async()=>{
 const source=fs.readFileSync('source/extension/task-services.js','utf8');
 const code=source.slice(source.indexOf('async function approveDownloads('),source.indexOf('async function approveDownloads(')+source.slice(source.indexOf('async function approveDownloads(')).indexOf('\n}')+2);
 const context={taskContext:{quickSave:true,options:{max_video_mb:1}},approvedSizes:new Map(),downloadConsent:false,chrome:{storage:{local:{set:async()=>assert.fail('must not wait for an invisible popup')}}}};
 vm.runInNewContext(code,context);
 await context.approveDownloads([{estimates:[{source:{url:'small'},bytes:500}]}]);assert.equal(context.downloadConsent,true);
 await assert.rejects(context.approveDownloads([{estimates:[{source:{url:'large'},bytes:2*1048576}]}]),/上限/);
});
test('iframe, foreign sender and concurrent task cannot start capture',async()=>{
 for(const [s,busy] of [[{...sender,frameId:1},false],[{...sender,id:'wrong'},false],[sender,true]]){
  const w=worker({busy}),r=await w.run({type:'REFTRAY_QUICK_SAVE'},s);assert.equal(r.ok,false);assert.equal(w.calls.length,0);
 }
});

test('floating stop rejects a stale request and another tab, and stops only its active capture',async()=>{
 let finish;const w=worker({onCollect:()=>new Promise(resolve=>finish=resolve)}),pending=w.run({type:'REFTRAY_QUICK_SAVE',requestId:'current'},sender);
 await new Promise(resolve=>setImmediate(resolve));
 for(const [requestId,s] of [['old',sender],['current',{...sender,tab:{...sender.tab,id:99}}],['current',{...sender,frameId:1}]])assert.equal((await w.run({type:'REFTRAY_QUICK_STOP',requestId},s)).ok,false);
 assert.ok(!w.progress.some(p=>p.liblibControl==='stopped'));
 assert.equal((await w.run({type:'REFTRAY_QUICK_STOP',requestId:'current'},sender)).ok,true);assert.ok(w.progress.some(p=>p.liblibControl==='stopped'));
 finish({status:'stopped'});await pending;assert.equal((await w.run({type:'REFTRAY_QUICK_STOP',requestId:'current'},sender)).ok,false);
});

test('stopping during identification prevents a later download and does not stop an unrelated context',async()=>{
 let finish;const w=worker({previewWait:new Promise(resolve=>finish=resolve)}),pending=w.run({type:'REFTRAY_QUICK_SAVE',requestId:'identify'},sender);
 await new Promise(resolve=>setImmediate(resolve));assert.equal((await w.run({type:'REFTRAY_QUICK_STOP',requestId:'identify'},sender)).ok,true);
 assert.ok(!w.progress.some(p=>p.liblibControl==='stopped'));finish();const result=await pending;assert.equal(result.ok,false);assert.equal(result.error,'USER_STOPPED');assert.ok(!w.calls.some(c=>c[0]==='current'));
});
test('page scripts cannot ask for screenshot permission through the content entry',async()=>{
 const w=worker();assert.equal((await w.run({type:'REFTRAY_FULL_PAGE',tabId:42},sender)).ok,false);
});

test('screenshot failure cancels backend session and restores original page',async()=>{
 const commands=[],requests=[];
 const context={module:{exports:{}},crypto:{randomUUID:()=> 'test'},setTimeout:f=>{f();return 0;},
  chrome:{tabs:{query:async()=>[{id:42,url:'https://example.com'}],captureVisibleTab:async()=>{throw new Error('capture denied');}},windows:{get:async()=>({focused:true})},scripting:{executeScript:async({args})=>{commands.push(args[0]);return [{result:{title:'page',width:800,height:1200,viewWidth:800,viewHeight:600,innerWidth:800,dpr:1,x:args[2]?.x||0,y:Math.min(args[2]?.y||0,600)}}];}}}};
 vm.runInNewContext(fs.readFileSync('source/extension/full-page-capture.js','utf8'),context);
 await assert.rejects(context.module.exports.capture({id:42,windowId:1,url:'https://example.com'},{api:async(path)=>{requests.push(path);return {id:'job'};},progress:async()=>{}}),/capture denied/);
 assert.equal(commands.at(-1),'restore');assert.ok(requests.includes('/page-snapshots/job/cancel'));assert.ok(!requests.some(p=>p.endsWith('/finish')));
});
