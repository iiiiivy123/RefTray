const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('source/extension/release-check.js','utf8');
function harness(results,store={}){
 const calls=[];
 const context=vm.createContext({
  chrome:{storage:{local:{get:async()=>store,set:async v=>Object.assign(store,v)}}},
  Hub:{api:async path=>{calls.push(path);assert.ok(results.length,'unexpected request');const value=results.shift();if(value instanceof Error)throw value;return value;}},
  fetch:()=>assert.fail('popup must not create a second external update lookup')
 });
 return {calls,store,updates:vm.runInContext(source+';RefTrayUpdates',context)};
}
const available={available:true,version:'1.0.11',notes:'Update lookup fix'};
test('popup uses the manual-check backend and caches a successful result for one day',async()=>{
 const {updates,calls,store}=harness([available]);
 assert.equal((await updates.check('1.0.9')).version,'v1.0.11');
 await updates.check('1.0.9');
 assert.deepEqual(calls,['/updates/check']);
 assert.equal(store.releaseCheck.source,'backend-feed');
 assert.ok(store.releaseCheck.nextCheck>Date.now()+23*3600000);
});
test('old direct-API failure cache cannot hide the repaired feed',async()=>{
 const state=harness([available],{releaseCheck:{nextCheck:Date.now()+86400000,error:'HTTP 403'}});
 assert.equal((await state.updates.check('1.0.9')).version,'v1.0.11');
 assert.equal(state.calls.length,1);
});
test('backend failures are cached without fetch fallback, install, or retry loop',async()=>{
 for(const message of ['额度已用完','官方更新地址拒绝访问','offline']){
  const state=harness([new Error(message)]);
  assert.equal(await state.updates.check('1.0.9'),null);
  assert.equal(await state.updates.check('1.0.9'),null);
  assert.deepEqual(state.calls,['/updates/check']);
  assert.equal(state.store.releaseCheck.error,message);
 }
});
test('a successful no-update response clears obsolete release data',async()=>{
 const state=harness([{available:false,current:'1.0.11'}],{releaseCheck:{latest:{version:'v1.0.10'}}});
 assert.equal(await state.updates.check('1.0.11'),null);
 assert.equal(state.store.releaseCheck.latest,null);
});
test('invalid backend metadata never becomes a release notice',async()=>{
 for(const value of [{},{available:true,version:'invalid'},{available:'true',version:'1.0.11'}]){
  const state=harness([value]);assert.equal(await state.updates.check('1.0.9'),null);
  assert.ok(state.store.releaseCheck.error);assert.equal(state.calls.length,1);
 }
});
test('ignore and later choices retain their previous v-prefixed identity',async()=>{
 for(const choice of [{releaseIgnored:'v1.0.11'},{releaseLater:{version:'v1.0.11',until:Date.now()+86400000}}]){
  const state=harness([available],choice);assert.equal(await state.updates.check('1.0.9'),null);
 }
});
