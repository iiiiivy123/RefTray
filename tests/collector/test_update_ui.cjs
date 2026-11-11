const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('only update status crosses a version change and renews the old authorization token',async()=>{
 let version='0.5.49',calls=0;const requested=[];
 const ctx=vm.createContext({AbortSignal,chrome:{runtime:{getManifest:()=>({version:'0.5.49'})}},
  reftrayHealth:async()=>({ok:true,json:async()=>({release:version,settings_token:version})}),
  fetch:async(url,options)=>{calls++;requested.push(options.headers['X-Collector-Token']);return calls===2?{status:403,ok:false,json:async()=>({detail:'扩展未通过后台校验。'})}:{ok:true,json:async()=>({phase:'completed',version})};}});
 const hub=vm.runInContext(fs.readFileSync('source/extension/hub-api.js','utf8')+';Hub',ctx);
 await hub.api('/updates/status');version='0.5.50';
 assert.equal((await hub.api('/updates/status')).version,'0.5.50');
 assert.deepEqual(requested,['0.5.49','0.5.49','0.5.50']);
 await assert.rejects(hub.api('/updates/install',{version:'0.5.51'}),/版本/);
 await assert.rejects(hub.api('/collect/start',{}),/版本/);
 assert.equal(calls,3);
});
function ui(status,store={}){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},hidden:false});return nodes.get(id);};
 const section={querySelector:node};let timer,reloads=0;const calls=[];
 const context=vm.createContext({Date,Set,setTimeout:f=>(timer=f,1),clearTimeout:()=>{timer=null;},
  document:{createElement:()=>section,querySelector:s=>s==='#about-settings'?{append(){}}:null},
  Hub:{api:async(path,value)=>{calls.push([path,value]);return path==='/updates/status'?status:path==='/updates/check'?{available:true,version:'0.5.50'}:{};}},
  chrome:{runtime:{getManifest:()=>({version:'0.5.49'}),reload:()=>reloads++},storage:{local:{get:async()=>store,set:async v=>Object.assign(store,v)}}}});
 vm.runInContext(fs.readFileSync('source/extension/update-ui.js','utf8'),context);
 return {node,store,calls,get reloads(){return reloads;},get timer(){return timer;}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('an old successful receipt is not displayed as the current installed version',async()=>{
 const state=ui({phase:'completed',version:'0.5.45',current:'0.5.49',message:'已更新到 0.5.45'});
 await flush();assert.equal(state.node('#update-message').textContent,'当前版本 0.5.49');assert.equal(state.reloads,0);
});
test('manual repair uses the running backend version, not an older completion receipt',async()=>{
 const status={phase:'completed',version:'0.5.49',current:'0.5.51'},state=ui(status);
 await flush();assert.equal(state.reloads,1);assert.equal(state.store.reftrayUpdateReload,'0.5.51');
 const reopened=ui(status,state.store);await flush();assert.equal(reopened.reloads,0);
});
test('update UI checks, starts, observes progress and reloads only once per completed version',async()=>{
 const status={phase:'idle'},state=ui(status);await flush();assert.equal(state.timer,null);
 await state.node('#check-update').onclick();assert.equal(state.node('#install-update').hidden,false);
 Object.assign(status,{phase:'downloading',message:'下载',received:1,total:2});await state.node('#install-update').onclick();
 assert.deepEqual(state.calls.find(c=>c[0]==='/updates/install')[1].version,'0.5.50');
 assert.match(state.node('#update-message').textContent,/50%/);assert.equal(state.node('#install-update').disabled,true);
 Object.assign(status,{phase:'completed',message:'完成',version:'0.5.50'});await state.timer();await flush();assert.equal(state.reloads,1);
 const reopened=ui(status,state.store);await flush();assert.equal(reopened.reloads,0);assert.match(reopened.node('#update-message').textContent,/尚未加载新版/);
});
test('recovery shows a detached entry and shares the existing progress flow',async()=>{
 const status={phase:'failed',current:'0.5.49',message:'安装中断',recovery:{available:true,version:'0.5.48',directory:'F:/isolated/updates/0.5.49'}};
 const state=ui(status);await flush();assert.equal(state.node('#restore-update').hidden,false);
 assert.match(state.node('#update-recovery').textContent,/RefTrayRestore.exe/);
 assert.match(state.node('#update-connections').textContent,/后台 0.5.49 已连接/);
 status.phase='rolling_back';await state.node('#restore-update').onclick();
 assert.ok(state.calls.some(call=>call[0]==='/updates/restore'));
 assert.equal(state.node('#restore-update').disabled,true);assert.ok(state.timer);
 Object.assign(status,{phase:'rolled_back',version:'0.5.48',current:'0.5.48'});await state.timer();await flush();assert.equal(state.reloads,1);
});
