const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('source/extension/x-comments.js','utf8');
function article(id,parent,text,images=[]){
 const a={__reactProps$fixture:{rest_id:id,legacy:{in_reply_to_status_id_str:parent,full_text:text}},querySelectorAll(selector){if(selector==='a[href]')return[{href:'https://x.com/user/status/'+id,querySelector:()=>({}),closest:q=>q==='article'?a:null}];if(selector==='[data-testid="tweetPhoto"] img')return images.map(src=>({src,currentSrc:src,closest:q=>q==='article'?a:null}));return[];},querySelector:()=>null};return a;
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

test('only a direct reply contributes its own animated GIF source',()=>{
 const parent='1234567890123456789', id='1234567890123456790';
 const item=article(id,parent,'');
 const url='https://video.twimg.com/tweet_video/own.mp4';
 item.__reactProps$fixture.legacy.extended_entities={media:[{type:'animated_gif',video_info:{variants:[{content_type:'video/mp4',url}]}}]};
 const ctx=vm.createContext({URL,location:{hostname:'x.com',pathname:'/user/status/'+parent},document:{querySelectorAll:selector=>selector.startsWith('article')?[item]:[]}});
 vm.runInContext(fs.readFileSync('source/extension/cat-media.js','utf8'),ctx);
 const result=vm.runInContext(source,ctx);
 assert.deepEqual(Array.from(result.comments[0].gifs),[url]);
});

test('YouTube playlist only admits selected-tab cards with matching video and playlist identities',()=>{
 const {profile}=require('../../source/extension/youtube.js');
 const id='PLcollection', url='https://www.youtube.com/playlist?list='+id;
 const doc={title:'Playlist',querySelector:()=>null};
 const card=(video,list,clicked=video)=>({lockupViewModel:{contentType:'LOCKUP_CONTENT_TYPE_VIDEO',contentId:video,rendererContext:{commandContext:{onTap:{innertubeCommand:{watchEndpoint:{videoId:clicked,playlistId:list}}}}}}});
 const tab=(selected,cards)=>({tabRenderer:{selected,content:{sectionListRenderer:{contents:[{itemSectionRenderer:{contents:cards}}]}}}});
 const tabs=[tab(false,[card('99999999999',id)]),tab(true,[card('11111111111',id),card('22222222222','PLother'),card('33333333333',id,'44444444444')])];
 const list=profile(url,doc,{contents:{twoColumnBrowseResultsRenderer:{tabs}}});
 assert.deepEqual(list.urls,['https://www.youtube.com/watch?v=11111111111']);
});

test('loaded Bilibili captions require the selected part and allow a canonical trailing slash',()=>{
 const source=fs.readFileSync('source/extension/background.js','utf8');
 const begin=source.indexOf('func:canonical=>{',source.indexOf("if(source.subtitle_mode!=='none'&&!"));
 assert.ok(begin>=0);
 const end=source.indexOf('\n    }});',begin);
 const callback=source.slice(begin+5,end)+'\n}';
 const stem='https://www.bilibili.com/video/BV1oxdmBKEbY';
 function read(expected,actual){
  return vm.runInNewContext('('+callback+')(expected)',{URL,expected,location:new URL(actual),document:{querySelectorAll:()=>[{textTracks:[{kind:'subtitles',cues:[{startTime:0,endTime:1,text:'sample'}]}]}]}});
 }
 assert.equal(read(stem+'/?p=2',stem+'?p=2')[0].text,'sample');
 assert.equal(read(stem+'/?p=1',stem).length,1);
 for(const url of [stem+'?p=1',stem+'?p=2&p=1',stem+'?p=',stem.replace('www.','other.')+'?p=2']){
   assert.equal(read(stem+'/?p=2',url).length,0);
 }
});

test('nested tweet images belong to the inner article',()=>{
 const outer=article('2','1','outer reply');
 const inner=article('3','2','nested',['https://pbs.twimg.com/media/nested?format=jpg']);
 const lookup=outer.querySelectorAll.bind(outer);
 outer.querySelectorAll=selector=>[...lookup(selector),...inner.querySelectorAll(selector)];
 const result=vm.runInNewContext(source,{URL,location:{hostname:'x.com',pathname:'/user/status/1'},document:{querySelectorAll:q=>q.startsWith('article')?[outer,inner]:[]}});
 assert.deepEqual(Array.from(result.comments,c=>[c.id,c.images.length]),[['2',0]]);
});
