const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=(fs.readFileSync('source/extension/batch-state.js','utf8')+'\n'+fs.readFileSync('source/extension/batch.js','utf8'));
test('X text capture opens the document directory even when an attachment returns another directory',async()=>{
 const writes=[];
 const context=vm.createContext({taskContext:{options:{collection_mode:'text',include_images:true,include_comments:true}},
  submit:async value=>{writes.push(value);return {new_images:writes.length===1?11:0,directory:'F:/text/X/post'}},
  downloadVideo:async()=>({directory:'F:/images/X/post',video_file:'main.gif',new_images:1}),healthCache:{},controlPoint:async()=>{}});
 vm.runInContext(script,context);
 context.payload={platform:'x',canonical_url:'https://x.com/sample/status/123',page_title:'Post',body_text:'Beat my GIF',
  images:[{url:'https://pbs.twimg.com/media/reply.gif'}],_media:[{kind:'gif',url:'https://video.twimg.com/tweet_video/main.mp4'}]};
 const result=await vm.runInContext('processBatchPost({id:1},8766,{},payload)',context);
 assert.equal(result.directory,'F:/text/X/post');assert.equal(result.status,'saved');assert.equal(result.images,12);
 assert.deepEqual(Array.from(writes[1].media_files),['main.gif']);
});
test('X images skip a confirmed text post, then accept five image posts; text mode still saves it',async()=>{
 let saved=0;const context=vm.createContext({taskContext:{options:{collection_mode:'images'},batch:{limit:5,options:{},records:{}}},submit:async()=>{saved++;return {new_images:1,directory:'scratch'}},loadedPageMedia:async()=>({media:[]}),controlPoint:async()=>{}});
 vm.runInContext(script,context);
 context.payload={platform:'x',canonical_url:'https://x.com/sample/status/123',body_text:'pinned text',images:[],_media:[]};
 const skip=await vm.runInContext('processBatchPost({id:1},8766,{},payload)',context);
 assert.equal(skip.status,'skipped');assert.equal(skip.quota_exempt,true);assert.equal(saved,0);
 context.taskContext.batch.records.text=skip;
 assert.equal(vm.runInContext('batchFull()',context),false);
 for(let i=0;i<5;i++){
  context.payload={...context.payload,images:[{url:'https://pbs.twimg.com/media/sample.jpg'}]};
  context.taskContext.batch.records[i]=await vm.runInContext('processBatchPost({id:1},8766,{},payload)',context);
 }
 assert.equal(saved,5);assert.equal(vm.runInContext('batchCount()',context),5);assert.equal(vm.runInContext('batchFull()',context),true);
 context.taskContext.options.collection_mode='text';context.payload={...context.payload,images:[]};
 const text=await vm.runInContext('processBatchPost({id:1},8766,{},payload)',context);
 assert.equal(text.status,'saved');assert.equal(text.documents,1);
});
