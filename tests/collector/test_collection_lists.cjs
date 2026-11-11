const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {snapshot}=require('../../source/extension/huaban-list.js');
const {profile}=require('../../source/extension/xhs-list.js');
const site=require('../../source/extension/site-panel.js');
const board='6a3de54c00000000350148f4',note='685a89a90000000010026c6d';
function huabanCard(id,owner,{hidden=false,related=false}={}){
 const evidence={dataset:{boardId:owner,contentId:id},closest:()=>related?{}:null};
 return {dataset:{pinId:id},getClientRects:()=>hidden?[]:[{}],closest:()=>related?{}:null,
 querySelectorAll:s=>s==='a[href]'?[]:[evidence]};
}
test('modern Huaban board cards, both routes, exclude wrong-board and recommendation cards',()=>{
 const cards=[huabanCard('7319587295','102999899'),huabanCard('7319587169','102999899'),huabanCard('3','other'),huabanCard('4','102999899',{related:true}),huabanCard('5','102999899',{hidden:true})];
 const doc={querySelector:()=>({textContent:'古风'}),querySelectorAll:s=>s.includes('[data-pin-id]')?cards:[]};
 for(const path of ['/boards/102999899','/discovery/boards/102999899']){
  const result=snapshot('https://huaban.com'+path,doc);
  assert.deepEqual(result.urls,['https://huaban.com/pins/7319587295','https://huaban.com/pins/7319587169']);
  assert.equal(result.list_url,'https://huaban.com/boards/102999899');assert.equal(site.context('https://huaban.com'+path).bulk,'author');
 }
});
test('legacy linked Huaban cards retain membership checks and order',()=>{
 const card={dataset:{pinId:'42',boardId:'9'},closest:()=>null,querySelectorAll:()=>[]};
 const anchor={href:'https://huaban.com/pins/42',getClientRects:()=>[{}],closest:()=>card};
 const doc={querySelector:()=>null,querySelectorAll:s=>s.includes('a[href*')?[anchor]:[]};
 assert.deepEqual(snapshot('https://huaban.com/boards/9',doc).urls,['https://huaban.com/pins/42']);
 card.dataset.boardId='8';assert.throws(()=>snapshot('https://huaban.com/boards/9',doc),/尚未确认/);
});

test('Huaban card image keeps both Pin and board identity and rejects avatars, video cards and ambiguous images',()=>{
 const imageUrl='https://gd-hbimg-edge.huaban.com/'+'c'.repeat(40)+'-WE9Q4o_fw658webp?auth_key=fixture';
 const image={src:imageUrl,alt:'主图',naturalWidth:658,naturalHeight:900,complete:true,getAttribute:()=> '42'};
 const card=huabanCard('42','9');
 const evidence=card.querySelectorAll('[data-board-id][data-content-id]');
 let images=[image],video=false;
 card.querySelectorAll=selector=>selector.startsWith('img[')?images:selector==='a[href]'?[]:evidence;
 card.querySelector=()=>video?{}:null;
 const doc={querySelector:()=>null,querySelectorAll:selector=>selector==='[data-pin-id]'?[card]:[]};
 const source='https://huaban.com/pins/42';
 let result=snapshot('https://huaban.com/boards/9',doc);
 assert.equal(result.pins[source].images[0].preferred_url,imageUrl.replace('_fw658webp',''));
 image.getAttribute=()=> '99';assert.deepEqual(snapshot('https://huaban.com/boards/9',doc).pins,{});
 image.getAttribute=()=> '42';video=true;assert.deepEqual(snapshot('https://huaban.com/boards/9',doc).pins,{});
 video=false;images=[image,{...image,src:imageUrl.replace('c'.repeat(40),'d'.repeat(40))}];
 assert.deepEqual(snapshot('https://huaban.com/boards/9',doc).pins,{});
 evidence[0].dataset.boardId='8';assert.throws(()=>snapshot('https://huaban.com/boards/9',doc),/尚未确认/);
});

test('Huaban uses a card only after full-size bytes arrive, and leaves text/video/comment modes on the detail path',async()=>{
 const {create}=require('../../source/extension/page-reader.js'),originalFetch=global.fetch;
 const url='https://huaban.com/pins/42',candidate={platform:'huaban',canonical_url:url,images:[{url:'https://gd-hbimg-edge.huaban.com/preview',preferred_url:'https://gd-hbimg-edge.huaban.com/original'}]};
 try{
  let originalWorks=true,controls=0,fetches=0;
  global.fetch=async source=>{fetches++;return new Response(new Uint8Array([1,2,3]),{status:source.endsWith('/original')&&!originalWorks?403:200,headers:{'Content-Type':'image/png'}});};
  const reader=create({controlPoint:async()=>{controls++;}});
  const result=await reader.huabanBoardPayload(candidate,url,{collection_mode:'images'});
  assert.equal(result.images[0].data_url,candidate.images[0].preferred_url);assert.equal(controls,2);
  assert.equal(candidate.images[0].data_base64,undefined,'do not retain raw bytes in the board snapshot');
  originalWorks=false;assert.equal(await reader.huabanBoardPayload(candidate,url,{}),null,'a thumbnail is not a successful original');
  const before=fetches;
  for(const options of [{collection_mode:'text'},{video_only:true},{include_videos:true},{include_comments:true},{md_only:true}])assert.equal(await reader.huabanBoardPayload(candidate,url,options),null);
  assert.equal(await reader.huabanBoardPayload(candidate,url+'9',{}),null);
  assert.equal(fetches,before);
  await assert.rejects(create({controlPoint:async()=>{throw Error('USER_STOPPED');}}).huabanBoardPayload(candidate,url,{}),/USER_STOPPED/);
 }finally{global.fetch=originalFetch;}
});

test('modern Huaban image cards can identify their own unmarked main image without accepting avatars or nested pins',()=>{
 const {cardImage}=require('../../source/extension/huaban.js');
 const source='https://gd-hbimg-edge.huaban.com/'+'c'.repeat(40)+'-WE9Q4o_fw480webp?auth_key=fixture';
 const card={dataset:{pinId:'42'},matches:s=>s==='.simple-image-card[data-pin-id]',querySelector:()=>null};
 const main={src:source,alt:'主图',complete:true,naturalWidth:480,naturalHeight:600,getAttribute:()=>null,closest:()=>card,getBoundingClientRect:()=>({width:236,height:295})};
 let images=[main];card.querySelectorAll=s=>s==='img'?images:[];
 assert.equal(cardImage(card,'42').preferred_url,source.replace('_fw480webp',''));
 const avatar={...main,src:source.replace('_fw480webp','_fw80webp'),getBoundingClientRect:()=>({width:40,height:40})};
 images=[main,avatar];assert.equal(cardImage(card,'42').url,source);
 images=[avatar];assert.equal(cardImage(card,'42'),null);
 images=[{...main,closest:()=>({dataset:{pinId:'99'}})}];assert.equal(cardImage(card,'42'),null);
 images=[{...main,getAttribute:()=> '99'}];assert.equal(cardImage(card,'42'),null);
 images=[main,{...main,src:source.replace('c'.repeat(40),'d'.repeat(40))}];assert.equal(cardImage(card,'42'),null);
 images=[main];card.matches=()=>false;assert.equal(cardImage(card,'42'),null,'unknown card layouts still require an explicit image identity');
});

test('Huaban board image path keeps list checks and the existing journal, with detail fallback',async()=>{
 for(const scenario of ['image','fallback','changed']){
  const boardUrl='https://huaban.com/boards/9',pinUrl='https://huaban.com/pins/42';
  const payload={canonical_url:pinUrl,platform:'huaban',images:[{url:'full-size-image'}]},profile={author_url:boardUrl,list_url:boardUrl,list_kind:'board',list_name:'画板',urls:[pinUrl],pins:{[pinUrl]:payload}};
  let saved=0,created=0,closed=0,scans=0;
  const ctx=vm.createContext({URL,taskContext:{id:'batch',options:{collection_mode:'images'},batch:{queue:[],records:{},options:{},limit:1}},
   chrome:{tabs:{query:async()=>[],get:async id=>({id,url:id===1?boardUrl:pinUrl,status:'complete'}),create:async()=>{created++;return {id:2,url:pinUrl};},remove:async()=>{closed++;}},
    scripting:{executeScript:async()=>[{result:++scans===3&&scenario==='changed'?{...profile,list_url:boardUrl+'0'}:profile}]}},
   controlledWait:async()=>{},controlPoint:async()=>{},pagePayload:async()=>payload,
   pageReader:{huabanBoardPayload:async candidate=>scenario==='fallback'?null:candidate,huabanListPayload:async()=>null}
  });
  vm.runInContext(fs.readFileSync('source/extension/batch-state.js','utf8')+'\n'+fs.readFileSync('source/extension/batch.js','utf8'),ctx);
  ctx.beginBatch=async()=>{};ctx.saveBatch=async()=>{};ctx.batchProblem=async()=>null;ctx.finishBatch=()=>({saved});
  ctx.processBatchPost=async(tab,_port,group,actual)=>{assert.equal(tab.url,pinUrl);assert.equal(group.list_url,boardUrl);assert.equal(actual,payload);return {status:'saved'};};
  ctx.recordPost=async(url,record)=>{saved++;ctx.taskContext.batch.records[url]=record;};
  const operation=ctx.runSocialBatch({id:1,url:boardUrl},8766,{},'huaban');
  if(scenario==='changed'){await assert.rejects(operation,/离开原列表/);assert.equal(saved,0);}
  else {assert.equal((await operation).saved,1);assert.equal(created,scenario==='fallback'?1:0);assert.equal(closed,created);}
 }
});

test('Huaban waits for visible board membership and stops if navigation changes',async()=>{
 for(const scenario of ['late','empty','changed']){
  let waits=0;
  const context=vm.createContext({URL,location:{href:'https://huaban.com/boards/102999899'},
   document:{querySelector:()=>null,querySelectorAll:s=>scenario==='late'&&waits>=2&&s==='[data-pin-id]'?[huabanCard('42','102999899')]:[]},
   setTimeout:fn=>{waits++;if(scenario==='changed')context.location.href='https://huaban.com/boards/9';fn();}});
  const result=await vm.runInContext(fs.readFileSync('source/extension/huaban-list.js','utf8'),context);
  if(scenario==='late')assert.deepEqual(Array.from(result.urls||[]),['https://huaban.com/pins/42']);
  else assert.match(result.error,scenario==='empty'?/尚未确认/:/已切换/);
  assert.ok(waits<20,'bounded waiting');
 }
});

test('Huaban borrows loaded details without navigating or closing them, including stop, login and page changes',async()=>{
 for(const scenario of ['saved','stop','login','changed']){
  const boardUrl='https://huaban.com/boards/9',urls=['https://huaban.com/pins/42','https://huaban.com/pins/43'];
  const profile={author_url:boardUrl,list_url:boardUrl,list_kind:'board',urls,pins:{}};
  const borrowed={id:7,url:urls[1],status:'complete',active:true};
  let created=0;const closed=[],updated=[],reads=[];
  const ctx=vm.createContext({URL,taskContext:{id:'batch',options:{collection_mode:'images'},batch:{queue:[],records:{},options:{},limit:2}},
   chrome:{tabs:{query:async()=>[borrowed],get:async id=>id===1?{id,url:boardUrl,status:'complete'}:id===2?{id,url:urls[0],status:'complete'}:{...borrowed,url:scenario==='login'?'https://huaban.com/login':scenario==='changed'?'https://huaban.com/pins/99':borrowed.url},
    create:async value=>{created++;assert.equal(value.windowId,10);assert.equal(value.openerTabId,1);assert.equal(value.active,false);return {id:2,url:value.url};},
    update:async(id,value)=>{updated.push([id,value]);},remove:async id=>{closed.push(id);}},scripting:{executeScript:async()=>[{result:profile}]}},
   controlledWait:async()=>{},controlPoint:async()=>{},pageReader:{huabanBoardPayload:async()=>null,huabanListPayload:async()=>null},
   pagePayload:async id=>{reads.push(id);if(id===7&&scenario==='stop')throw Error('USER_STOPPED');return {canonical_url:urls[id===2?0:1],images:[{url:'image'}],_media:[]};}
  });
  vm.runInContext(fs.readFileSync('source/extension/batch-state.js','utf8')+'\n'+fs.readFileSync('source/extension/batch.js','utf8'),ctx);
  ctx.beginBatch=async()=>{};ctx.saveBatch=async()=>{};ctx.batchProblem=async()=>null;ctx.finishBatch=()=>ctx.taskContext.batch.records;
  ctx.processBatchPost=async()=>({status:'saved'});ctx.recordPost=async(url,record)=>{ctx.taskContext.batch.records[url]=record;};
  const run=ctx.runSocialBatch({id:1,windowId:10,url:boardUrl},8766,{},'huaban');
  if(scenario==='stop'||scenario==='login')await assert.rejects(run,scenario==='stop'?/USER_STOPPED/:/NEEDS_ATTENTION/);
  else{const records=await run;assert.equal(records[urls[1]].status,scenario==='changed'?'failed':'saved');}
  assert.equal(created,1);assert.deepEqual(closed,[2]);assert.deepEqual(updated,[]);
  assert.deepEqual(reads,scenario==='changed'||scenario==='login'?[2]:[2,7]);
 }
});
test('XHS board has its own list identity and never becomes the note author',()=>{
 const root={getClientRects:()=>[{}],querySelector:()=>null};
 const doc={querySelector:s=>s.includes('.board-info .name')?{textContent:'景德镇'}:s.includes('.board-info .owner')?{textContent:'Ivy'}:s.includes('.board .feeds-container')?root:null};
 const result=profile('https://www.xiaohongshu.com/board/'+board+'?source=web_user_page',doc);
 assert.equal(result.list_kind,'favorites');assert.equal(result.list_name,'景德镇');assert.equal(result.author_name,undefined);
 assert.equal(result.list_url,'https://www.xiaohongshu.com/board/'+board);
 assert.equal(site.context(result.list_url).bulk,'author');assert.equal(site.context(result.list_url).single,false);
 assert.equal(site.context(result.list_url+'/'+note).single,true);
});
test('existing XHS profile notes and favorites remain distinct',()=>{
 const selected={textContent:'笔记'},root={querySelector:()=>null};
 const doc={querySelector:s=>s.includes('aria-selected')?selected:s.includes('feeds-container')?root:s.includes('user-name')?{textContent:'作者'}:null};
 const url='https://www.xiaohongshu.com/user/profile/'+board;
 assert.equal(profile(url,doc).author_name,'作者');selected.textContent='收藏';
 assert.equal(profile(url,doc).list_kind,'favorites');assert.equal(profile(url,doc).author_name,undefined);
 selected.textContent='点赞';assert.throws(()=>profile(url,doc),/未确认/);
});
test('XHS content reads only this board cards, opens exact note and accepts returned explore detail',()=>{
 const url='https://www.xiaohongshu.com/board/'+board,links=[];let clicked=0,listener;
 function link(path){return {href:'https://www.xiaohongshu.com'+path,getBoundingClientRect:()=>({width:200,height:300}),querySelector:()=>({}),scrollIntoView(){},removeAttribute(){},click(){clicked++;}};}
 links.push(link('/board/'+board+'/'+note+'?xsec_token=fixture'),link('/board/'+'a'.repeat(24)+'/'+'b'.repeat(24)),link('/explore/'+'c'.repeat(24)));
 const feed={querySelectorAll:()=>links};
 const context=vm.createContext({URL,Map,Set,window:{},location:new URL(url),getComputedStyle:()=>({display:'block',visibility:'visible'}),document:{querySelector:()=>feed},chrome:{runtime:{onMessage:{addListener:f=>listener=f}}}});
 vm.runInContext(fs.readFileSync('source/extension/content.js','utf8'),context);
 let result;listener({type:'LIBLIB_CARDS'},null,r=>result=r);
 assert.equal(result.cards.length,1);assert.equal(result.cards[0].id,note);assert.match(result.cards[0].url,/xsec_token=fixture/);
 listener({type:'LIBLIB_OPEN_WORK',url:result.cards[0].url},null,r=>result=r);assert.equal(result.opened,true);assert.equal(clicked,1);
 const gallery={querySelectorAll:()=>[{complete:true,naturalWidth:640,currentSrc:'https://sns-webpic-qc.xhscdn.com/fixture',alt:''}],querySelector:()=>null};
 const detail={getBoundingClientRect:()=>({width:900,height:600}),querySelector:s=>s.includes('.media-container')?gallery:{textContent:'收藏笔记'}};
 context.location=new URL('https://www.xiaohongshu.com/explore/'+note);context.document.querySelectorAll=()=>[detail];
 listener({type:'LIBLIB_DETAIL',id:note,options:{}},null,r=>result=r);assert.equal(result.payload.images.length,1);assert.equal(result.payload.canonical_url,context.location.href);
 listener({type:'LIBLIB_DETAIL',id:'a'.repeat(24),options:{}},null,r=>result=r);assert.match(result.reason,/编号.*不一致/);
});

test('XHS board batches reuse detail processing and stop when the selected list changes',async()=>{
 for(const changed of [false,true]){
  let snapshots=0,saved=0,mode;const group={list_url:'https://www.xiaohongshu.com/board/'+board,list_kind:'favorites',list_name:'景德镇'};
  const ctx=vm.createContext({URL,taskContext:{batch:{records:{},options:{},limit:1},options:{collection_mode:'text'}},
   chrome:{scripting:{executeScript:async()=>[{result:++snapshots>=3&&changed?{...group,list_url:group.list_url+'other'}:group}]},
    tabs:{get:async()=>({url:group.list_url}),sendMessage:async(_id,m)=>m.type==='LIBLIB_CARDS'?{cards:[{id:note,url:group.list_url+'/'+note}]}:m.type==='LIBLIB_OPEN_WORK'?{opened:true}:m.type==='LIBLIB_DETAIL'?{payload:{canonical_url:'https://www.xiaohongshu.com/explore/'+note,images:[{url:'image'}]}}:{closed:true}}},
   controlledWait:async()=>{},controlPoint:async()=>{},inject:async()=>{},batchFull:()=>saved===1,batchScannedCount:()=>saved,batchRecorded:()=>false,skipLeadingPost:()=>false});
  vm.runInContext((fs.readFileSync('source/extension/batch-state.js','utf8')+'\n'+fs.readFileSync('source/extension/batch.js','utf8')),ctx);
  ctx.beginBatch=async(_tab,m)=>mode=m;ctx.batchProblem=async()=>null;
  ctx.processBatchPost=async(_tab,_port,metadata)=>{assert.equal(metadata.list_name,'景德镇');assert.equal(metadata.author_name,undefined);return {status:'completed'};};
  ctx.recordPost=async(id,record)=>{saved++;ctx.taskContext.batch.records[id]=record;};ctx.finishBatch=()=>({saved});
  const result=ctx.runXhsBatch({id:1,url:group.list_url},8766,{});
  if(changed)await assert.rejects(result,/列表已切换/);else assert.equal((await result).saved,1);
  assert.equal(mode,'favorites');assert.equal(saved,1);
 }
});
