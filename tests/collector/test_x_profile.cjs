const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('source/extension/x-profile.js','utf8');
function post(id,{handle='kissmeow6',tracking=false,video=false,ad=false,wholePost=false,quote=false,text='',quotedText=''}={}){
 const article={hasAttribute:()=>true};
 const link={href:`https://x.com/${handle}/status/${id}`,querySelector:s=>s==='time'?{}:null,
  closest:s=>s==='article'?article:s==='[data-testid="quoteTweet"]'&&quote?{}:null};
 const placement={querySelector:s=>s.includes('videoPlayer')&&video?{}:s.includes('time')&&wholePost?{}:null};
 article.querySelector=s=>s.includes('promotedIndicator')&&ad?{}:s.includes('placementTracking')&&tracking?placement:null;
 const texts=[{innerText:text,closest:s=>s==='article'?article:null},{innerText:quotedText,closest:s=>s==='article'?article:s==='[data-testid="quoteTweet"]'?{}:null}];
 article.querySelectorAll=s=>s==='a[href]'?[link]:s.includes('placementTracking')&&tracking?[placement]:s.includes('tweetText')?texts:[];
 return article;
}
function read(articles,scrollingElement,loading=false,visibilityState='visible'){return vm.runInNewContext(source,{URL,location:{href:'https://x.com/kissmeow6'},document:{scrollingElement,visibilityState,querySelector:s=>s.includes('progressbar')&&loading?{}:null,querySelectorAll:()=>articles}});}

test('ordinary X profile videos use placementTracking around just the video player',()=>{
 const result=read([post('2112348076551876669',{tracking:true,video:true}),post('2120456516557771224',{tracking:true,video:true})]);
 assert.deepEqual(Array.from(result.urls),['https://x.com/kissmeow6/status/2112348076551876669','https://x.com/kissmeow6/status/2120456516557771224']);
});
test('X still excludes whole-post ad placements and explicitly promoted videos',()=>{
 const result=read([post('1',{tracking:true}),post('2',{tracking:true,video:true,wholePost:true}),post('3',{tracking:true,video:true,ad:true}),post('4')]);
 assert.deepEqual(Array.from(result.urls),['https://x.com/kissmeow6/status/4']);
});
test('X keeps owner identity and excludes embedded quotes while deduplicating',()=>{
 const result=read([post('1',{handle:'someone_else'}),post('2',{quote:true}),post('3'),post('3'),post('4',{handle:'KissMeow6',tracking:true,video:true})]);
 assert.deepEqual(Array.from(result.urls),['https://x.com/kissmeow6/status/3','https://x.com/kissmeow6/status/4']);
});

const popup=fs.readFileSync('source/extension/popup-layout.js','utf8');
const summary=vm.runInNewContext('('+popup.slice(popup.indexOf('function resultSummary('),popup.indexOf(' function rawDetails(')).trim()+')');
test('a missing profile list is not presented as a login failure, including older logs',()=>{
 for(const message of ['未找到本人帖子。请确认已登录、主页帖子已加载；未开始保存。','未识别到当前主页的作品链接，未开始保存。请刷新主页后重试。']){
  const text=summary({status:'failed',message});assert.match(text,/主页/);assert.doesNotMatch(text,/登录/);
 }
});
test('a real access rejection keeps the sign-in hint',()=>{assert.match(summary({status:'failed',message:'HTTP 401: login required'}),/登录/);});

test('X reports whether the timeline is at the bottom or still loading',()=>{
 const scroller={scrollTop:4934,clientHeight:1074,scrollHeight:12688};
 assert.equal(read([],scroller).list_at_end,false);
 scroller.scrollTop=11614;assert.equal(read([],scroller).list_at_end,true);
 assert.equal(read([],scroller,true).list_loading,true);
});

test('X profile returns its visible post caption without borrowing quoted text',()=>{
 const result=read([post('1',{text:'  My three little sushi kitty car ornaments  ',quotedText:'Another author'}),post('2',{quotedText:'Not this post'})]);
 assert.equal(result.titles['https://x.com/kissmeow6/status/1'],'My three little sushi kitty car ornaments');
 assert.equal(result.titles['https://x.com/kissmeow6/status/2'],'@kissmeow6 · 2');
 assert.equal(result.list_visible,true);
 assert.equal(read([],undefined,false,'hidden').list_visible,false);
});

function batchFixture({loading=false,stop=false,change=false,empty=false,hiddenReads=0}={}){
 const owner='https://x.com/kissmeow6',first=owner+'/status/1',second=owner+'/status/2';let scrolls=0,current=first,reads=0,lastVisible=true;const saved=[];
 const ctx=vm.createContext({URL,taskContext:{id:'batch',options:{collection_mode:'images'},batch:{queue:[],records:{},options:{},limit:2}},
  chrome:{tabs:{get:async id=>({id,url:id===1?owner:current,status:'complete'}),create:async({url})=>{current=url;return {id:2,url};},update:async(id,{url})=>{current=url;return {id,url};},remove:async()=>{}},
   scripting:{executeScript:async input=>{
    if(input.files){lastVisible=++reads>hiddenReads;return [{result:{author_url:change&&scrolls===3?'https://x.com/changed':owner,author_name:'KissMeow',urls:empty?[]:scrolls>=7?[first,second]:[first],titles:{[first]:'First caption',[second]:'Second caption'},list_visible:lastVisible,list_at_end:loading||empty,list_loading:loading&&scrolls<7}}];}
    if(input.world==='MAIN')return [{result:null}];
    assert.equal(lastVisible,true,'must not scroll past unrendered hidden timeline cards');scrolls++;return [{result:null}];
   }}},controlPoint:async()=>{if(stop&&scrolls===3)throw Error('USER_STOPPED');},controlledWait:async()=>{},reportProgress:async()=>{},
  pagePayload:async()=>({canonical_url:current,images:[{url:'image'}]})});
 vm.runInContext(fs.readFileSync('source/extension/batch-state.js','utf8')+'\n'+fs.readFileSync('source/extension/batch.js','utf8'),ctx);
 ctx.beginBatch=ctx.saveBatch=async()=>{};ctx.batchProblem=async()=>null;ctx.finishBatch=()=>ctx.taskContext.batch.records;
 ctx.processBatchPost=async(_tab,_port,_group,payload)=>{saved.push(payload);return {status:'saved'};};ctx.recordPost=async(url,record)=>{ctx.taskContext.batch.records[url]=record;};
 return {run:()=>ctx.runXBatch({id:1,url:owner},8766,{}),get scrolls(){return scrolls;},first,second,saved};
}
test('X scans beyond five unchanged views when the page has not reached the bottom',async()=>{
 for(const loading of [false,true]){const f=batchFixture({loading});const records=await f.run();assert.equal(records[f.second]?.status,'saved');assert.equal(f.scrolls,7);}
});

test('X waits for visible rendering before scrolling and carries confirmed list titles to saving',async()=>{
 const f=batchFixture({hiddenReads:3});await f.run();
 assert.deepEqual(f.saved.map(p=>p.page_title),['First caption','Second caption']);
});

test('X hidden rendering times out with a useful message and never skips ahead',async()=>{
 const f=batchFixture({hiddenReads:1000});await assert.rejects(f.run(),/X 主页.*后台.*列表加载/);assert.equal(f.scrolls,0);
});
test('X loading retains stop and profile-change guards; an exhausted empty list remains an error',async()=>{
 await assert.rejects(batchFixture({stop:true}).run(),/USER_STOPPED/);
 await assert.rejects(batchFixture({change:true}).run(),/已离开/);
 const f=batchFixture({empty:true});await assert.rejects(f.run(),/未识别到/);assert.ok(f.scrolls<=5);
});
