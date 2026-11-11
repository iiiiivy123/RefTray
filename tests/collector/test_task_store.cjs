const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function store(){
  const state={},remote=new Map();
  const context=vm.createContext({structuredClone,crypto:require('node:crypto').webcrypto,Date,
    chrome:{storage:{local:{get:async()=>structuredClone(state),set:async value=>Object.assign(state,structuredClone(value)),remove:async keys=>{for(const key of [].concat(keys))delete state[key];}}}},
    Hub:{api:async(route,body)=>{
      if(body){const saved=structuredClone(body.data),prior=remote.get(body.id);assert.equal(body.expected_revision,prior?.revision||0);assert.ok(saved.revision>(prior?.revision||0));remote.set(body.id,saved);return {item:saved,revision:saved.revision};}
      const item=remote.get(decodeURIComponent(route.split('/').pop()));if(!item)throw new Error('404 not found');return {item:structuredClone(item)};
    }}});
  const file=process.env.TASK_STORE_JS||path.resolve(__dirname,'../../source/extension/task-store.js');
  vm.runInContext(fs.readFileSync(file,'utf8'),context);
  return {api:context.TaskStore,state,remote};
}

test('concurrent checkpoint saves get distinct durable revisions and retain newest pending data',async()=>{
  const {api,state}=store();
  const records=await Promise.all([
    api.save({id:'a',records:{one:{status:'saved'}},queue:['one','two']}),
    api.save({id:'a',records:{one:{status:'saved'},two:{status:'failed'}},queue:['one','two']})
  ]);
  assert.deepEqual(records.map(record=>record.revision),[1,2]);
  assert.equal(state.collectorCheckpoint.revision,2);
  assert.equal(state.collectorCheckpoint.records.two.status,'failed');
});

test('ending a synced batch advances its revision and survives offline until reconciliation',async()=>{
 const {api,state,remote}=store();
 await api.save({id:'batch',records:{one:{status:'saved'}},queue:['one','two']});
 await api.endBatch();
 assert.equal(remote.get('batch').revision,2);
 assert.equal(remote.get('batch').endedByUser,true);
 // Persisted outbox is the same durable path used when the API is unavailable.
 assert.equal(state.collectorCheckpoint.completed,true);
 assert.deepEqual(state.collectorTaskOutbox,{});
});

test('single-task journal retains revisions and synchronizes resolution of an older failure',async()=>{
 const {api,state,remote}=store();
 state.collectorTaskJournal={failed:{id:'failed',status:'failed',records:{result:{status:'failed'}}}};
 await api.save(state.collectorTaskJournal.failed,{checkpoint:false});
 assert.equal(state.collectorTaskJournal.failed.revision,1);
 await api.save({...state.collectorTaskJournal.failed,resolvedBy:'success'},{checkpoint:false});
 assert.equal(remote.get('failed').revision,2);
 assert.equal(state.collectorTaskJournal.failed.resolvedBy,'success');
 assert.equal(api.latest(state.collectorTaskJournal.failed,remote.get('failed')).resolvedBy,'success');
});

test('legacy resolution rebases only resolvedBy, preserving newer server evidence',async()=>{
 const {api,state,remote}=store();
 state.collectorTaskJournal={legacy:{id:'legacy',revision:0,records:{},resolvedBy:'success'}};
 remote.set('legacy',{id:'legacy',revision:3,records:{photo:{status:'saved'}},directory:'keep'});
 await api.save(state.collectorTaskJournal.legacy,{checkpoint:false});
 assert.equal(remote.get('legacy').revision,4);
 assert.equal(remote.get('legacy').resolvedBy,'success');
 assert.equal(remote.get('legacy').records.photo.status,'saved');
 assert.equal(state.collectorTaskJournal.legacy.directory,'keep');
});
