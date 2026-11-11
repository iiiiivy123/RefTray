const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Huaban=require('../../source/extension/huaban.js');
const List=require('../../source/extension/huaban-list.js');
const {create}=require('../../source/extension/page-reader.js');
const board='https://huaban.com/boards/102999899',pin='https://huaban.com/pins/7319587277';
function liveCard(){
 const card={dataset:{pinId:'7319587277'},className:'BR9Lhzqi __7b58EDIh',matches:()=>false,getClientRects:()=>[{}],closest:()=>null,querySelector:()=>null};
 const evidence={dataset:{boardId:'102999899',contentId:'7319587277',contentType:'普通采集'},closest:s=>s==='[data-pin-id]'?card:null};
 const image={src:'https://gd-hbimg-edge.huaban.com/small/'+'c'.repeat(40)+'-hvuPFQ_fw480webp?auth_key=card',complete:true,naturalWidth:240,naturalHeight:240,alt:'主图',
  getAttribute:()=>null,closest:()=>card,getBoundingClientRect:()=>({width:242,height:242})};
 card.querySelectorAll=s=>s==='img'?[image]:s==='[data-board-id][data-content-id]'||s==='[data-content-id][data-content-type]'?[evidence]:[];
 const doc={title:'古风',querySelector:()=>null,querySelectorAll:s=>s==='[data-pin-id]'?[card]:[]};
 return {card,evidence,image,doc};
}
test('real hashed Huaban card layout uses own ordinary-Pin evidence; small signed URL is not rewritten',()=>{
 const {card,evidence,image}=liveCard();
 assert.equal(Huaban.cardImage(card,'7319587277').url,image.src);
 assert.equal(Huaban.cardImage(card,'7319587277').preferred_url,undefined);
 evidence.dataset.contentType='素材采集';assert.equal(Huaban.cardImage(card,'7319587277').url,image.src);
 evidence.dataset.contentId='99';assert.equal(Huaban.cardImage(card,'7319587277'),null);
 evidence.dataset.contentId='7319587277';evidence.dataset.contentType='视频采集';assert.equal(Huaban.cardImage(card,'7319587277'),null);
});
test('Huaban numbered modal root still requires matching Pin identity on its image',()=>{
 const image={currentSrc:'https://gd-hbimg-edge.huaban.com/'+'c'.repeat(40)+'-hvuPFQ_fw1200webp?auth_key=detail',complete:true,naturalWidth:400,naturalHeight:400,alt:'主图'};
 let same=true;
 const root={querySelector:()=>null,querySelectorAll:selector=>same&&selector==='img[data-preview-pin-id="7319587277"][data-pin-detail="true"]'?[image]:[]};
 const doc={title:'花瓣',querySelector:selector=>selector==='[data-pin-image-id="7319587277"]'?root:null,querySelectorAll:()=>[]};
 assert.equal(Huaban.extract(pin,doc,{}).images[0].url,image.currentSrc);
 same=false;assert.equal(Huaban.extract(pin,doc,{}),null);
});
test('Huaban modal navigation verifies membership and only restores its own single history entry',()=>{
 const {image,doc,evidence}=liveCard();let back=0,clicks=0;
 const view={document:doc,location:{href:board},performance:{timeOrigin:123},history:{length:4,back:()=>{back++;view.location.href=board;}}};
 image.click=()=>{clicks++;view.location.href=pin;view.history.length++;};
 let token=List.openPin(board,pin,view);
 assert.equal(token.opened,true);assert.equal(clicks,1);
 assert.equal(List.restorePin(token,view).restoring,true);assert.equal(back,1);
 token=List.openPin(board,pin,view);view.location.href='https://huaban.com/pins/99';
 assert.equal(List.restorePin(token,view).changed,true);assert.equal(back,1);
 view.location.href=pin;view.history.length++;
 assert.equal(List.restorePin(token,view).changed,true);assert.equal(back,1);
 view.location.href=board;evidence.dataset.boardId='other';
 assert.throws(()=>List.openPin(board,pin,view),/列表|作品/);assert.equal(clicks,2);
});
test('Huaban returning from a new Pin replaces forward history without increasing its total length',()=>{
 const {image,doc}=liveCard();let back=0;
 let entries=[{key:'older',index:0,url:'https://huaban.com/'},{key:'board-entry',index:1,url:board},{key:'old-forward-pin',index:2,url:'https://huaban.com/pins/99'}];
 const view={document:doc,location:{href:board},performance:{timeOrigin:123},history:{length:3,back:()=>{back++;view.location.href=board;}},navigation:{currentEntry:entries[1],entries:()=>entries}};
 image.click=()=>{view.location.href=pin;entries[2]={key:'new-pin-entry',index:2,url:pin};view.navigation.currentEntry=entries[2];};
 const token=List.openPin(board,pin,view);
 assert.equal(List.restorePin(token,view).restoring,true);assert.equal(back,1);
 view.location.href=pin;entries[1]={...entries[1],key:'user-visited-board'};
 assert.equal(List.restorePin(token,view).changed,true);assert.equal(back,1,'same URL with a different preceding entry belongs to the user');
});
test('public Pin fallback accepts only exact static-image identity and honors user stop',async()=>{
 const url='https://www.pinterest.com/pin/849843392234288694/';let current=url,calls=0,stop=false,pending=false;
 let response={canonical_url:url,platform:'pinterest',page_title:'Pin',scope:'verified_pin_image',images:[{url:'https://i.pinimg.com/originals/a.jpg'}]};
 const reader=create({chrome:{tabs:{get:async()=>(pending?{url:'about:blank',pendingUrl:current}:{url:current})}},controlPoint:async()=>{if(stop)throw Error('USER_STOPPED');},service:async()=>{calls++;return response;}});
 const options={collection_mode:'images',include_videos:false};
 assert.equal((await reader.publicPinPayload(7,url,options)).images.length,1);
 pending=true;assert.equal((await reader.publicPinPayload(7,url,options)).images.length,1);pending=false;
 for(const extra of [{include_comments:true},{include_videos:true},{md_only:true},{collection_mode:'text'},{video_only:true}])assert.equal(reader.publicPinEligible(url,{...options,...extra}),false);
 response={...response,scope:'verified_share_image'};await assert.rejects(reader.publicPinPayload(7,url,options),/完整|静态/);
 response={...response,scope:'verified_pin_image',canonical_url:url.replace('694','695')};await assert.rejects(reader.publicPinPayload(7,url,options),/身份/);
 current=url.replace('694','696');const before=calls;await assert.rejects(reader.publicPinPayload(7,url,options),/切换/);assert.equal(calls,before);
 current=url;stop=true;await assert.rejects(reader.publicPinPayload(7,url,options),/USER_STOPPED/);
});

test('Huaban modal reader returns to its board on save, failure or Stop and leaves user navigation alone',async()=>{
 for(const scenario of ['saved','empty','stop','user']){
  const {image,doc}=liveCard();let back=0,reads=0,controls=0;
  const context=vm.createContext({URL,document:doc,location:{href:board},performance:{timeOrigin:123},history:{length:4,back:()=>{back++;context.location.href=board;}}});
  image.click=()=>{context.location.href=pin;context.history.length++;};
  context.CollectorHuabanList={openPin:(list,url)=>List.openPin(list,url,context),restorePin:token=>List.restorePin(token,context)};
  context.CollectorHuaban={extract:()=>{reads++;return scenario==='saved'&&reads>=2?{canonical_url:pin,images:[{url:'main-image'}]}:null;}};
  const chrome={tabs:{get:async()=>({url:context.location.href})},scripting:{executeScript:async input=>{context.args=input.args;return [{result:vm.runInContext('('+input.func.toString()+')(...args)',context)}];}}};
  const reader=create({chrome,controlPoint:async()=>{controls++;if(scenario==='stop'&&controls===3)throw Error('USER_STOPPED');},controlledWait:async()=>{if(scenario==='user')context.location.href='https://huaban.com/pins/99';}});
  const result=reader.huabanListPayload(1,board,pin,{collection_mode:'images'});
  if(scenario==='stop'||scenario==='user')await assert.rejects(result,scenario==='stop'?/USER_STOPPED/:/已切换/);
  else assert.equal((await result)?.images?.length||0,scenario==='saved'?1:0);
  assert.equal(back,scenario==='user'?0:1);assert.ok(reads<=20);
  assert.equal(context.location.href,scenario==='user'?'https://huaban.com/pins/99':board);
 }
});

test('MCP only uses the public Pin path after a load timeout; redirects and other errors stay failures',async()=>{
 const url='https://www.pinterest.com/pin/849843392234288694/';let current=url,problem='页面加载超时',pending=false;
 const ctx=vm.createContext({URL,module:{exports:{}},waitForTab:async()=>{throw Error(problem);},chrome:{tabs:{query:async()=>[],create:async()=>({id:7,url}),get:async()=>({id:7,url:pending?'about:blank':current,pendingUrl:pending?current:undefined,status:'loading'})}}});
 vm.runInContext(fs.readFileSync('source/extension/browser-runner.js','utf8'),ctx);
 const runner=ctx.module.exports;
 assert.equal((await runner.target(url,'single',true)).publicPinFallback,true);
 pending=true;assert.equal((await runner.target(url,'single',true)).url,url);pending=false;
 await assert.rejects(runner.target(url,'single',false),/页面加载超时/);
 current=url.replace('694','695');await assert.rejects(runner.target(url,'single',true),/跳转/);
 current=url;problem='USER_STOPPED';await assert.rejects(runner.target(url,'single',true),/USER_STOPPED/);
});
