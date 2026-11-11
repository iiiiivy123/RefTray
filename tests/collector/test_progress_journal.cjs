const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const extension=path.resolve(__dirname,'../../source/extension');

function setup(){
 const state={},remote=new Map();
 const context=vm.createContext({structuredClone,Date,URL,crypto:require('node:crypto').webcrypto,
  BUILD:'fixture',batchDownloadItem:null,healthCache:{capture_history:true},taskContext:{},
  TaskProgress:{reduce:(old,value)=>({...old,...value})},
  chrome:{storage:{local:{get:async()=>structuredClone(state),set:async values=>Object.assign(state,structuredClone(values)),remove:async key=>delete state[key]}}},
  service:async(route,body)=>{
   if(!body){const item=remote.get(route.split('/').pop());if(!item)throw new Error('404');return {item:structuredClone(item)};}
   assert.equal(body.expected_revision,remote.get(body.id)?.revision||0);
   assert.ok(body.data.revision>(remote.get(body.id)?.revision||0));
   remote.set(body.id,structuredClone(body.data));return {item:body.data};
  }});
 vm.runInContext(fs.readFileSync(path.join(extension,'task-store.js'),'utf8'),context);
 const background=fs.readFileSync(path.join(extension,'background.js'),'utf8');
 vm.runInContext(background.slice(background.indexOf('let progressChain='),background.indexOf('const pageReader=')),context);
 return {state,remote,async report(id,value){context.taskContext={id,url:'https://example.com/post',title:id,options:{}};return context.reportProgress(value);}};
}

test('concurrent progress writes keep both journals and publish retry resolution with a newer revision',async()=>{
 const store=setup();
 await Promise.all([store.report('failed',{status:'failed',message:'unavailable'}),store.report('other',{status:'failed'})]);
 assert.deepEqual(Object.keys(store.state.collectorTaskJournal).sort(),['failed','other']);
 await store.report('success',{status:'completed'});
 for(const id of ['failed','other']){
  assert.equal(store.remote.get(id).resolvedBy,'success');
  assert.equal(store.remote.get(id).revision,2);
  assert.equal(store.state.collectorTaskJournal[id].revision,2);
 }
 assert.equal(store.state.collectorTaskJournal.success.revision,1);
});

test('stopped and interrupted tasks remain unfinished and are synchronized',async()=>{
 const store=setup();
 for(const status of ['stopped','interrupted','paused']){
  await store.report(status,{status});
  assert.equal(store.remote.get(status).completed,false);
  assert.equal(store.remote.get(status).status,status);
 }
});
