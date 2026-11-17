const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Bili=require('../../source/extension/bilibili.js');
const url='https://space.bilibili.com/3706983322487599/upload/video';
const video='https://www.bilibili.com/video/BV16HL26BEjd/';
function doc(links=null){return {readyState:'complete',visibilityState:'visible',querySelector:selector=>selector.includes('#submit-video-list')?(links?{querySelectorAll:()=>links}:null):{textContent:'诺诺剪辑日常'},querySelectorAll:()=>{throw Error('must not scan entire document');}};}
function link(href,{ad=false,card=true,badge=false}={}){return {href,closest:selector=>selector.includes('[data-ad]')?(ad?{}:null):(card?{querySelectorAll:()=>badge?[{textContent:'广告'}]:[]}:null)};}
test('completed document with missing or empty submission container is pending, not empty success',()=>{
 for(const document of [doc(),doc([])])assert.throws(()=>Bili.profile(url,document),e=>e.code==='BILI_LIST_PENDING'&&e.diagnostics.ready_state==='complete');
});
test('submission extraction keeps card ownership scope, deduplication and ad exclusion',()=>{
 const r=Bili.profile(url,doc([link(video),link(video+'?from=test'),link('https://www.bilibili.com/video/BV1wWJa61EYv/',{ad:true}),link(video,{card:false}),link('https://www.bilibili.com/video/BV1ySaf69EAp/',{badge:true})]));
 assert.deepEqual(r.urls,[video]);assert.equal(r.handle,'3706983322487599');
 assert.throws(()=>Bili.profile('https://space.bilibili.com/3706983322487599',doc()),/投稿/);
});
function batch(results,{changed=false,stop=false}={}){
 let reads=0,waits=0,started=false;const messages=[];
 const ctx=vm.createContext({URL,RefTrayBatchState:{},CollectorBiliParts:{key:()=>null},
  pageProblem:async()=>null,reportProgress:async p=>messages.push(p.message),controlledWait:async ms=>{waits+=ms;},controlPoint:async()=>{if(stop)throw Error('USER_STOPPED');},
  chrome:{tabs:{get:async()=>({url:changed?url.replace('3706983322487599','123'):url})},scripting:{executeScript:async()=>[{result:results[Math.min(reads++,results.length-1)]}]}}});
 vm.runInContext(fs.readFileSync('source/extension/batch.js','utf8'),ctx);
 ctx.beginBatch=async()=>{started=true;throw Error('TEST_PROFILE_READY');};
 return {run:()=>ctx.runSocialBatch({id:7,url},8766,{limit:500,video_action:'save'},'bilibili'),state:()=>({reads,waits,started,messages})};
}
const pending={error:'未识别投稿列表',code:'BILI_LIST_PENDING',diagnostics:{ready_state:'complete',recognized_root:false}};
test('delayed list gets bounded waits before batch can begin',async()=>{
 const b=batch([pending,pending,{author_url:url,handle:'3706983322487599',urls:[video],view:'videos'}]);
 await assert.rejects(b.run(),/TEST_PROFILE_READY/);assert.equal(b.state().reads,3);assert.equal(b.state().waits,2500);assert.equal(b.state().started,true);
});
test('unknown layout times out explicitly, never claims login failure or starts downloads',async()=>{
 const b=batch([pending]);await assert.rejects(b.run(),/等待30秒.*不能据此判定登录失效/);
 assert.equal(b.state().reads,25);assert.equal(b.state().waits,30000);assert.equal(b.state().started,false);
});
test('cancellation, real errors and changed author stop without retrying arbitrary pages',async()=>{
 const stopped=batch([pending],{stop:true});await assert.rejects(stopped.run(),/USER_STOPPED/);assert.equal(stopped.state().reads,1);
 const error=batch([{error:'identity mismatch'}]);await assert.rejects(error.run(),/identity mismatch/);assert.equal(error.state().waits,0);
 const moved=batch([pending],{changed:true});await assert.rejects(moved.run(),/页面已切换/);assert.equal(moved.state().reads,0);
});
test('MCP reuses and activates loaded Bilibili submissions instead of creating a hidden duplicate',async()=>{
 const tabs=[{id:1,url,status:'complete',frozen:true,active:true},{id:2,url,status:'complete',lastAccessed:10},{id:3,url,status:'loading'}];let created=0,activated=[];
 const ctx=vm.createContext({URL,module:{exports:{}},waitForTab:async()=>{},chrome:{tabs:{query:async()=>tabs,get:async id=>tabs.find(t=>t.id===id),update:async(id,options)=>{activated.push(id);return Object.assign(tabs.find(t=>t.id===id),options);},create:async value=>{created++;const tab={id:4,...value};tabs.push(tab);return tab;}}}});
 vm.runInContext(fs.readFileSync('source/extension/browser-runner.js','utf8'),ctx);
 assert.equal((await ctx.module.exports.target(url,'author')).id,2);assert.equal(created,0);assert.deepEqual(activated,[2]);
 tabs.length=0;const fresh=await ctx.module.exports.target(url,'author');assert.equal(fresh.active,true);assert.equal(created,1);
});
