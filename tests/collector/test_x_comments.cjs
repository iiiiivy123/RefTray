const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('source/extension/x-comments.js','utf8');
function article(id,parent,text,images=[]){
 const a={__reactProps$fixture:{rest_id:id,legacy:{in_reply_to_status_id_str:parent,full_text:text}},querySelectorAll(selector){if(selector==='a[href]')return[{href:'https://x.com/user/status/'+id,querySelector:()=>({}),closest:()=>null}];if(selector==='[data-testid="tweetPhoto"] img')return images.map(src=>({src,currentSrc:src,closest:()=>null}));return[];},querySelector:()=>null};return a;
}
test('X replies retain image-only replies, order and identities; unrelated parents are excluded',()=>{
 const articles=[article('1','0','main'),article('3','1','',['https://pbs.twimg.com/media/photo?format=jpg']),article('2','1','hello'),article('4','99','unrelated')];
 const result=vm.runInNewContext(source,{URL,location:{hostname:'x.com',pathname:'/user/status/1'},document:{querySelectorAll:selector=>selector.startsWith('article')?articles:[]}});
 assert.equal(result.comments.length,2);assert.equal(result.comments[0].id,'3');assert.equal(result.comments[0].text,'');assert.equal(result.comments[0].images[0],'https://pbs.twimg.com/media/photo?format=jpg&name=orig');assert.equal(result.comments[1].id,'2');
});

test('reply loading deduplicates overlapping pages, stops at the requested count and restores position',async()=>{
 const background=fs.readFileSync('source/extension/background.js','utf8');
 const reader=background.slice(background.indexOf('async function readXReplies('),background.indexOf('async function loadedMedia('));
 let passes=0,restored=0;
 const chrome={scripting:{executeScript:async({files,args})=>{
  if(files){const ids=passes++===0?['2']:['2','3','4'];return [{result:{postId:'1',comments:ids.map(id=>({id}))}}];}
  if(args.length===3){restored++;return [{}];}
  return [{result:{before:0,after:300}}];
 }}};
 const ctx=vm.createContext({chrome,controlPoint:async()=>{},controlledWait:async()=>{}});
 const result=await vm.runInContext(reader+';readXReplies(1,"1",2)',ctx);
 assert.deepEqual(Array.from(result.comments,x=>x.id),['2','3']);
 assert.equal(restored,1);assert.equal(passes,2);
});
test('YouTube preview requires the loaded player to belong to the URL',()=>{
 const code=fs.readFileSync('source/extension/page-identify.js','utf8');
 const location=new URL('https://www.youtube.com/watch?v=abcdefghijk');
 const player={};let id='other';
 const document={querySelector:q=>q==='#movie_player video'?player:q.includes('videoId')?{content:id}:null};
 const run=()=>vm.runInNewContext(code,{URL,location,document});
 assert.equal(run().state,'unknown');id='abcdefghijk';assert.equal(run().videos,1);
});
