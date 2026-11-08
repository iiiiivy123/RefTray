const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({});vm.runInContext(fs.readFileSync('source/extension/task-progress.js','utf8'),context);
test('shared terminal result preserves complete failure and partial success',()=>{
 const state=context.TaskProgress.resultStatus;
 assert.equal(state({failed_images:3,new_images:0}),'failed');
 assert.equal(state({failed_images:1,new_images:1}),'partial');
 assert.equal(state({failed_images:1,duplicate_images:1}),'partial');
 assert.equal(state({status:'failed',partial:true}),'failed');
 assert.equal(state({duplicate_images:2}),'completed');
});
