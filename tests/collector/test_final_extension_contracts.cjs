const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const extension=process.env.REFTRAY_EXTENSION||path.resolve(__dirname,'../../source/extension');
const background=fs.readFileSync(path.join(extension,'background.js'),'utf8');
function functionSource(name,next){const start=background.indexOf('async function '+name+'(');const end=background.indexOf('async function '+next+'(',start+1);assert.ok(start>=0&&end>start);return background.slice(start,end);}

function pageMedia(){
  let resolves=0;
  const context=vm.createContext({URL,Map,Error,chrome:{tabs:{get:async()=>({url:'https://x.com/user/status/123'})},scripting:{executeScript:async()=>[{result:{media:[]}}]}},
    service:async()=>{resolves++;if(resolves===1)throw new Error('resolver failure');return {media:[{kind:'video',url:'https://example.org/video'}]};}});
  vm.runInContext('let taskContext={options:{}};let healthCache={};let resolvedMedia=new Map();async function setMediaQuality(){};'+functionSource('matureMedia','reportProgress')+functionSource('loadedPageMedia','includeProtectedImages'),context);
  return {context,calls:()=>resolves};
}
test('X1 image-only page read never invokes the mature video resolver',async()=>{
  const {context,calls}=pageMedia();await vm.runInContext('loadedPageMedia(1,false)',context);assert.equal(calls(),0);
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
test('T1 media 5→80 percent never changes overall batch 3/5, unknown total stays unknown',()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(extension,'task-progress.js'),'utf8'),context);
  const job={limit:5,queue:['a','b','c','d','e'],queue_complete:true,records:{a:{status:'saved'},b:{status:'saved'},c:{status:'failed'}}};
  const first=context.TaskProgress.reduce({}, {percent:5},job),second=context.TaskProgress.reduce(first,{percent:80},job);
  assert.equal(first.percent,60);assert.equal(second.percent,60);assert.equal(second.batch.processed,3);assert.equal(second.current.percent,80);
  const unknown=context.TaskProgress.reduce(second,{percent:80},{...job,queue_complete:false});assert.equal(unknown.percent,null);assert.equal(unknown.batch.total,null);
});
