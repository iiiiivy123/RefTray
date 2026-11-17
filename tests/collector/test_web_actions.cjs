const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const CaptureOptions=require('../../source/extension/capture-options.js');
function worker({busy=false,shotFailure=false}={}){
 let listener;const calls=[],progress=[];
 const chrome={tabs:{create:async value=>calls.push(value),get:async id=>({id,url:'https://example.com/page',title:'Page'})},runtime:{id:'extension',getURL:p=>'chrome-extension://extension/'+p,getManifest:()=>({version:'1.0.3'}),onMessage:{addListener:f=>listener=f}},storage:{local:{set:async v=>progress.push(v)}}};
 const context={chrome,URL,taskRunning:busy,scanInProgress:false,taskContext:{},CaptureOptions,
  reftrayHealth:async()=>({ok:true,json:async()=>({release:'1.0.3',settings_token:'test',busy:false,inbox:'F:/TestLibrary'})}),
  downloadApi:async(...args)=>{calls.push(args);return {collection_mode:'text',layout:'organized_flat',include_images:true,video_action:'skip',ocr_enabled:false};},
  CollectorSite:{context:()=>({single:true})},collect:async(...args)=>{calls.push(args);return {message:'saved',new_images:1};},
  FullPageCapture:{capture:async(tab,{progress})=>{calls.push(['snapshot',tab]);await progress('tile 1/2');if(shotFailure)throw Error('capture failed');return {directory:'F:/TestLibrary/图片/shot',message:'saved PNG'};}},
  reportProgress:async()=>{},TaskProgress:{resultStatus:()=> 'completed'}};
 vm.runInNewContext(fs.readFileSync('source/extension/web-actions-worker.js','utf8'),context);
 return {calls,progress,run:(message,sender)=>new Promise(resolve=>listener(message,sender,resolve))};
}
const sender={id:'extension',frameId:0,tab:{id:42,url:'https://example.com/work'}};
test('hover reads context without saving; opening library ignores a supplied path',async()=>{
 const w=worker({busy:true});const r=await w.run({type:'REFTRAY_FLOATING_CONTEXT'},sender);assert.equal(r.context.mode,'图文笔记');assert.equal(r.context.directory,'F:/TestLibrary');
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
test('iframe, foreign sender and concurrent task cannot start capture',async()=>{
 for(const [s,busy] of [[{...sender,frameId:1},false],[{...sender,id:'wrong'},false],[sender,true]]){
  const w=worker({busy}),r=await w.run({type:'REFTRAY_QUICK_SAVE'},s);assert.equal(r.ok,false);assert.equal(w.calls.length,0);
 }
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
