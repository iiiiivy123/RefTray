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
      if(body){const saved=structuredClone(body.data);remote.set(body.id,saved);return {item:saved,revision:saved.revision};}
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
