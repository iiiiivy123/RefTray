const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../../source/extension/page-reader.js');
const batch=require('../../source/extension/batch-state.js');
const {expandLabel}=require('../../source/extension/comment-replies.js');

test('Huaban readable document need not wait for all external resources; wrong/loading documents stay blocked',async()=>{
 let actual='https://huaban.com/boards/102999899',state='interactive',calls=0;
 const reader=create({chrome:{scripting:{executeScript:async request=>{
  calls++;assert.equal(request.injectImmediately,true);
  const vm=require('node:vm');
  return [{result:vm.runInNewContext('('+request.func.toString()+')()',{
   location:{href:actual},document:{readyState:state,body:{childElementCount:2}}
  })}];
 }}}});
 const tab={id:7,url:actual,status:'loading'};
 assert.equal(await reader.tabReady(tab),true);
 state='loading';assert.equal(await reader.tabReady(tab),false);
 state='interactive';actual='https://huaban.com/login';assert.equal(await reader.tabReady(tab),false);
 assert.equal(await reader.tabReady({...tab,url:'about:blank'}),false);
 assert.equal(await reader.tabReady({...tab,url:'https://www.bilibili.com/video/BV1234567890/'}),false);
 assert.equal(calls,3);
});

test('Pinterest and ArtStation readable documents do not wait for unrelated resources',async()=>{
 for(const host of ['www.pinterest.com','www.artstation.com']){
  const url='https://'+host+'/work';
  const reader=create({chrome:{scripting:{executeScript:async()=>[{result:{url,ready:true}}]}}});
  assert.equal(await reader.tabReady({id:7,url,status:'loading'}),true);
  assert.equal(await reader.tabReady({id:7,url:url.replace(host,host+'.evil.invalid'),status:'loading'}),false);
 }
});

test('ArtStation waits through missing results and loading errors, rejects a changed work and propagates stop',async()=>{
 const current={url:'https://www.artstation.com/artwork/mA8We1'};
 for(const scenario of ['late','empty','changed','stop']){
  let reads=0,waits=0;
  const reader=create({controlPoint:async()=>{if(scenario==='stop')throw Error('USER_STOPPED');},controlledWait:async()=>{waits++;},chrome:{scripting:{executeScript:async request=>{
   assert.equal(request.injectImmediately,true);
   if(request.files)return [];
   reads++;
   if(scenario==='changed')return [{result:{changed:true}}];
   if(reads===1)return [{}];
   if(scenario==='empty'||reads===2)return [{result:{error:'ArtStation 作品正文尚未加载'}}];
   return [{result:{canonical_url:current.url,images:[{url:'artwork.jpg'}]}}];
  }}}});
  const operation=reader.readPagePayload(1,{collection_mode:'images'},current);
  if(scenario==='late'){assert.equal((await operation).images.length,1);assert.equal(waits,2);}
  else await assert.rejects(operation,scenario==='stop'?/USER_STOPPED/:scenario==='changed'?/页面已切换/:/尚未加载/);
  assert.ok(reads<=16);
 }
});

test('reply controls accept explicit counts without matching comment or posting actions',()=>{
 for(const label of ['查看所有 2 条回复','展开9条回复','View 2 replies','View all 2 replies','View 2 more replies','View replies (3)'])assert.equal(expandLabel(label),true,label);
 for(const label of ['回复','Reply','Send reply','View all comments','Follow','Hide replies'])assert.equal(expandLabel(label),false,label);
});

test('independent readers retain their own browser and cancellation services',async()=>{
 function fixture(name){
  let controls=0;
  const reader=create({BUILD:'fixture',controlPoint:async()=>{controls++;},controlledWait:async()=>{},
   chrome:{scripting:{executeScript:async request=>[{result:request.files?null:{platform:'huaban',canonical_url:request.args[0],name}}]}}});
  return {reader,controls:()=>controls};
 }
 const first=fixture('first'),second=fixture('second');
 const page={url:'https://huaban.com/pins/7010350717'};
 const [a,b]=await Promise.all([first.reader.readPagePayload(1,{md_only:true},page),second.reader.readPagePayload(2,{include_images:false},page)]);
 assert.equal(a.name,'first');assert.equal(b.name,'second');
 assert.equal(a.md_only,true);assert.equal(b.md_only,false);
 assert.equal(a.include_images,true);assert.equal(b.include_images,false);
 assert.equal(first.controls(),1);assert.equal(second.controls(),1);
});

test('reply expansion propagates stop and rejects a different origin with the same post path',async()=>{
 const payload={platform:'xhs',canonical_url:'https://www.xiaohongshu.com/explore/abc',comments:[]};
 const options={collection_mode:'text',include_comments:true,include_replies:true};
 let reads=0;
 const chrome={scripting:{executeScript:async()=>[{result:{done:true,reason:'loaded'}}]},tabs:{sendMessage:async()=>{reads++;return {...payload,canonical_url:'https://evil.example/explore/abc'};}}};
 const cancelled=create({chrome,controlPoint:async()=>{throw Error('USER_STOPPED');}});
 await assert.rejects(cancelled.readExpandedReplies(1,{...payload},options),/USER_STOPPED/);
 assert.equal(reads,0);
 const reader=create({chrome,controlPoint:async()=>{}});
 await assert.rejects(reader.readExpandedReplies(1,{...payload},options),/帖子已变化/);
 assert.equal(reads,1);
});

test('batch range and accounting stay isolated across resumed and new jobs',()=>{
 const saved={options:{skip_posts:2},leading_keys:['p1'],records:{p3:{status:'saved',images:2}},limit:3};
 const fresh={options:{skip_posts:1,video_only:true},records:{p2:{status:'saved',video_count:2}},limit:2};
 assert.equal(batch.skipLeadingPost(saved,'p2'),true);
 assert.equal(batch.skipLeadingPost(fresh,'p1'),true);
 assert.equal(batch.skipLeadingPost(saved,'p3'),false);
 assert.deepEqual(saved.leading_keys,['p1','p2']);assert.deepEqual(fresh.leading_keys,['p1']);
 assert.equal(batch.batchCount(saved),1);assert.equal(batch.batchCount(fresh),2);
 assert.equal(batch.batchFull(saved),false);assert.equal(batch.batchFull(fresh),true);
});
