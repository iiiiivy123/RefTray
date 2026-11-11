const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Parts=require('../../source/extension/bilibili-parts.js');
const Site=require('../../source/extension/site-panel.js');
const Options=require('../../source/extension/capture-options.js');
const base='https://www.bilibili.com/video/BV1wWJa61EYv/';
const state=(count=3)=>({videoData:{bvid:'BV1wWJa61EYv',title:'Songs',owner:{mid:123,name:'Artist'},pages:Array.from({length:count},(_,i)=>({page:i+1,cid:100+i,part:'Song '+(i+1),duration:10+i}))}});

test('Bilibili current work and its ordered parts are available without sidebar recommendations',()=>{
 const metadata=state();metadata.videoData.pages.reverse();metadata.related=[{bvid:'BV1oxdmBKEbY'}];
 const result=Parts.read(base+'?p=3&tracking=1',metadata);
 assert.deepEqual(result.urls,[base,base+'?p=2',base+'?p=3']);
 assert.deepEqual(result.parts.map(p=>[p.page,p.cid]),[[1,'100'],[2,'101'],[3,'102']]);
 assert.equal(Site.context(base+'?p=3').bulk,'author');
 assert.equal(Site.context(base+'?p=3').single,true);
 assert.equal(Parts.key(base),Parts.key(base+'?p=1'));
 assert.notEqual(Parts.key(base),Parts.key(base+'?p=2'));
});
test('Bilibili part list rejects wrong works, duplicate parts, invalid part numbers and a single video',()=>{
 const bad=state();bad.videoData.bvid='BV1oxdmBKEbY';assert.throws(()=>Parts.read(base,bad));
 for(const field of ['page','cid']){const bad=state();bad.videoData.pages[1][field]=bad.videoData.pages[0][field];assert.throws(()=>Parts.read(base,bad));}
 assert.throws(()=>Parts.read(base,state(1)));assert.throws(()=>Parts.read(base+'?p=4',state()));
 for(const url of [base+'?p=0',base+'?p=',base+'?p=2&p=3',base+'?p=1.5',base.replace('bilibili.com','evil.invalid')])assert.equal(Parts.key(url),null);
});

async function run(options={},previous=null,{alwaysWrong=false,profileOverride=null,blankLoading=false}={}){
 const metadata=state(),profile=profileOverride||Parts.read(base,metadata),origin=profileOverride?.author_url||base+'?p=3',store={collectorCheckpoint:previous},saved=[],attempts={},navigated=[];
 let workUrl,scans=0,loadingReads=0;
 const ctx=vm.createContext({URL,crypto,console,CollectorBiliParts:Parts,CaptureOptions:Options,
 tab:{id:1,url:origin,title:'Songs'},options:{video_only:true,collection_mode:'images',output_format:'audio',limit:2,skip_posts:1,...options},
 taskContext:{id:'batch',directory:'F:/test',options:{},imageQuotaUsed:0},
 chrome:{storage:{local:{get:async()=>store}},tabs:{
 get:async id=>id!==1&&blankLoading&&loadingReads++===0?{id,url:'',pendingUrl:workUrl,status:'loading'}:{id,url:id===1?origin:workUrl,status:'complete'},
 create:async({url})=>{workUrl=url;navigated.push(url);return {id:2,url};},
 update:async(id,{url})=>{if(url){workUrl=url;navigated.push(url);}return {id,url:workUrl};},remove:async()=>{}},
 scripting:{executeScript:async({world,files})=>{assert.equal(world,'MAIN');assert.deepEqual(Array.from(files),['bilibili-parts.js']);scans++;return [{result:profile}];}}},
 TaskStore:{reconcile:async()=>{},save:async value=>{store.collectorCheckpoint=JSON.parse(JSON.stringify(value));}},
 pageProblem:async()=>null,controlledWait:async()=>{},controlPoint:async()=>{},reportProgress:async()=>{},
 pagePayload:async()=>{const n=attempts[workUrl]=(attempts[workUrl]||0)+1;return {canonical_url:alwaysWrong||workUrl.endsWith('p=2')&&n===1?base:workUrl,author_handle:profile.handle,page_title:'Child work title',has_video:true,images:[]};}
 });
 vm.runInContext((fs.readFileSync('source/extension/batch-state.js','utf8')+'\n'+fs.readFileSync('source/extension/batch.js','utf8')),ctx);
 ctx.processBatchPost=async(tab,port,group,payload)=>{saved.push({url:tab.url,title:payload.page_title,group,format:ctx.taskContext.options.output_format});return {status:'saved',video_count:1,videos:1,directory:'F:/test/song'};};
 const result=await vm.runInContext("runSocialBatch(tab,8766,options,'bilibili')",ctx);
 return {result,saved,attempts,navigated,scans,checkpoint:store.collectorCheckpoint};
}
test('Bilibili selected range keeps distinct P keys, waits past stale P1 and passes audio options',async()=>{
 const r=await run();assert.equal(r.result.status,'saved');
 assert.deepEqual(r.saved.map(p=>p.url),[base+'?p=2',base+'?p=3']);
 assert.deepEqual(r.saved.map(p=>p.title),['P002 Song 2','P003 Song 3']);
 assert.ok(r.saved.every(p=>p.format==='audio'&&p.group.list_url===base));
 assert.equal(r.attempts[base+'?p=2'],2);assert.equal(r.scans,2);
 assert.equal(r.checkpoint.records[base].status,'skipped');assert.equal(r.checkpoint.completed,true);
});

test('a new work tab with an empty URL is awaited without losing the batch',async()=>{
 const r=await run({},null,{blankLoading:true});
 assert.deepEqual(r.saved.map(p=>p.url),[base+'?p=2',base+'?p=3']);
 assert.equal(r.checkpoint.completed,true);
});
test('Bilibili finite list finishes when all parts are handled, without scrolling into recommendations',async()=>{
 const r=await run({skip_posts:0,limit:500});assert.equal(r.result.status,'saved');
 assert.equal(r.saved.length,3);assert.equal(r.checkpoint.limit,3);assert.equal(r.scans,2);
});
test('Bilibili wrong part is rejected and failed parts still respect the selected count',async()=>{
 const r=await run({limit:1},null,{alwaysWrong:true});assert.equal(r.result.status,'failed');
 assert.equal(r.saved.length,0);assert.deepEqual(r.navigated,[base+'?p=2']);
 assert.equal(r.checkpoint.records[base+'?p=2'].video_count,1);
});
test('Bilibili retry preserves successful parts and only revisits the failed part',async()=>{
 const first=await run();const previous=first.checkpoint;
 previous.completed=false;previous.records[base+'?p=3'].status='pending';previous.retryKeys=[base+'?p=3'];
 const retried=await run({resume:true},previous);
 assert.deepEqual(retried.saved.map(p=>p.url),[base+'?p=3']);
 assert.equal(retried.checkpoint.records[base+'?p=2'].status,'saved');
});

test('collection batch uses its finite work order and preserves normal video titles',async()=>{
 const source=require('./fixtures/bilibili-season-5056136.json'),profile=Parts.read(source.source_url,source);
 const r=await run({skip_posts:23,limit:2},null,{profileOverride:profile});
 assert.deepEqual(r.saved.map(p=>p.url),profile.urls.slice(23,25));
 assert.ok(r.saved.every(p=>p.title==='Child work title'&&p.format==='audio'));
 assert.equal(r.scans,2);assert.equal(r.checkpoint.queue_complete,true);
 const last=await run({skip_posts:27,limit:10},null,{profileOverride:profile});
 assert.equal(last.saved.length,1);assert.equal(last.checkpoint.limit,1);
 await assert.rejects(()=>run({skip_posts:28},null,{profileOverride:profile}),/超出/);
});

test('collection retry revisits only the failed work within the original range',async()=>{
 const source=require('./fixtures/bilibili-season-5056136.json'),profile=Parts.read(source.source_url,source);
 const failed=await run({skip_posts:23,limit:1},null,{profileOverride:profile,alwaysWrong:true});
 assert.equal(failed.result.status,'failed');assert.equal(failed.saved.length,0);
 assert.equal(failed.checkpoint.records[profile.urls[23]].video_count,1);
 failed.checkpoint.completed=false;failed.checkpoint.records[profile.urls[23]].status='pending';
 failed.checkpoint.retryKeys=[profile.urls[23]];
 const retried=await run({resume:true},failed.checkpoint,{profileOverride:profile});
 assert.deepEqual(retried.saved.map(p=>p.url),[profile.urls[23]]);
});
