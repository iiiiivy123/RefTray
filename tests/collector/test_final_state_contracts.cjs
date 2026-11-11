const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const extension=process.env.REFTRAY_EXTENSION||path.resolve(__dirname,'../../source/extension');

test('frame engine quota 2 of 5 saves exactly two, reports three omitted and restores playback',async()=>{
  const canvases=[];let played=0,calls=0,confirmed=0;
  const video={duration:5,videoWidth:64,videoHeight:64,currentTime:1.25,paused:false,currentSrc:'fixture-video',isConnected:true,seeking:false,readyState:2,pause(){this.paused=true;},async play(){this.paused=false;played++;}};
  const context=vm.createContext({Uint8ClampedArray,Date,setTimeout:callback=>{queueMicrotask(callback);},document:{createElement:()=>{
    const canvas={width:0,height:0,toDataURL:()=> 'data:image/jpeg;base64,AAAA',getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([video.currentTime*30,0,0,255])})})};canvases.push(canvas);return canvas;
  }}});
  vm.runInContext(fs.readFileSync(path.join(extension,'frame-engine.js'),'utf8'),context);
  const result=await context.InspirationFrames.extract(video,{interval:1,strategy:'interval'},async()=>{},async()=>{
    calls++;if(calls>2)return {ok:true,new_images:0,partial:true,omitted_images:1};confirmed++;return {ok:true,new_images:1};
  },async()=>{});
  assert.equal(result.saved,2);assert.equal(result.omitted,3);assert.equal(result.partial,true);assert.equal(calls,3);assert.equal(confirmed,2);
  assert.equal(video.currentTime,1.25);assert.equal(video.paused,false);assert.equal(played,1);assert.ok(canvases.every(canvas=>canvas.width===0&&canvas.height===0));
});

function outbox(){
  const state={},writes=[];let online=false,remote;
  const context=vm.createContext({structuredClone,Date,crypto:require('node:crypto').webcrypto,
    chrome:{storage:{local:{get:async()=>structuredClone(state),set:async values=>Object.assign(state,structuredClone(values)),remove:async keys=>{for(const key of [].concat(keys))delete state[key];}}}},
    Hub:{api:async(route,body)=>{
      if(!online)throw new Error('network offline');
      if(!body){if(!remote)throw new Error('404 not found');return {item:structuredClone(remote)};}
      assert.equal(body.expected_revision,remote?.revision||0);
      assert.ok(body.data.revision>=(remote?.revision||0));
      writes.push(body.data.revision);remote=structuredClone(body.data);return {item:structuredClone(remote),revision:remote.revision};
    }}});
  vm.runInContext(fs.readFileSync(path.join(extension,'task-store.js'),'utf8'),context);
  return {api:context.TaskStore,state,writes,recover(value){online=true;remote=value;},remote:()=>remote};
}
test('three failed-sync revisions coalesce then recover as newest revision without replaying old ones',async()=>{
  const store=outbox();const record={id:'batch',records:{},queue:['one','two','three']};
  for(let index=1;index<=3;index++){
    record.records[String(index)]={status:'saved'};await store.api.save(record);
    assert.equal(store.state.collectorCheckpoint.revision,index);assert.equal(store.state.collectorTaskOutbox.batch.revision,index);
  }
  store.recover();await store.api.reconcile();
  assert.deepEqual(store.writes,[3]);assert.equal(store.remote().revision,3);assert.equal(Object.keys(store.remote().records).length,3);
  assert.equal(store.state.collectorCheckpoint.revision,3);assert.deepEqual(store.state.collectorTaskOutbox,{});
  await store.api.reconcile();assert.deepEqual(store.writes,[3]);
});
test('higher local revision wins stale remote and non-checkpoint journal saves retain the batch checkpoint',async()=>{
  const store=outbox();const record={id:'batch',revision:2,records:{one:{status:'saved'}},queue:['one']};
  await store.api.save(record);store.recover({id:'batch',revision:2,records:{}});await store.api.reconcile();
  assert.deepEqual(store.writes,[3]);assert.equal(store.state.collectorCheckpoint.revision,3);
  const checkpoint=structuredClone(store.state.collectorCheckpoint);
  // A single-task journal write must not replace the retained batch checkpoint.
  store.recover();await store.api.save({id:'single',records:{}},{checkpoint:false});
  assert.deepEqual(store.state.collectorCheckpoint,checkpoint);
});

test('ending a batch offline is durable and syncs once connectivity returns',async()=>{
 const store=outbox();
 await store.api.save({id:'batch',records:{},queue:['one']});
 await store.api.endBatch();
 assert.equal(store.state.collectorCheckpoint.revision,2);
 assert.equal(store.state.collectorTaskOutbox.batch.endedByUser,true);
 store.recover();await store.api.reconcile();
 assert.equal(store.remote().completed,true);
 assert.deepEqual(store.writes,[2]);
});
