const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const background=fs.readFileSync('source/extension/background.js','utf8');
const start=background.indexOf('async function previewCollection(');
const end=background.indexOf('chrome.runtime.onMessage.addListener',start);
const previewCode=background.slice(start,end);
test('preview counts the same collected payload without counting comment images or duplicate media',async()=>{
 const calls=[],url='https://x.com/example/status/123';
 const context=vm.createContext({taskRunning:false,healthCache:null,chrome:{tabs:{get:async()=>({url})}},
   reftrayHealth:async()=>({json:async()=>({release:'0.5.41'})}),
   pagePayload:async(id,options)=>{calls.push({id,options});return {images:[{url:'a.jpg'},{url:'a.jpg'},{url:'reply.jpg',role:'comment'}],_media:[{url:'gif.mp4',kind:'gif'},{url:'video.mp4',kind:'video'},{url:'video.mp4',kind:'video'}],has_video:true};}});
 const result=await vm.runInContext(previewCode+';previewCollection(7,'+JSON.stringify(url)+')',context);
 assert.equal(calls.length,1);assert.equal(calls[0].options.include_comments,false);
 assert.deepEqual([result.images,result.gifs,result.videos],[1,1,1]);
});
test('preview fails if navigation changes during extraction',async()=>{
 let reads=0;const url='https://example.org/article';
 const context=vm.createContext({taskRunning:false,healthCache:null,chrome:{tabs:{get:async()=>({url:reads++?url+'/other':url})}},
  reftrayHealth:async()=>({json:async()=>({})}),pagePayload:async()=>({images:[]})});
 await assert.rejects(vm.runInContext(previewCode+';previewCollection(7,'+JSON.stringify(url)+')',context),/页面已切换/);
});
test('ArtStation reads videos only inside the artwork and admits supported embedded players',()=>{
 const {extract}=require('../../source/extension/artstation.js');
 const root={querySelectorAll:selector=>selector==='video'?[{src:'https://cdn.artstation.com/p/assets/videos/sample.mp4',querySelectorAll:()=>[]}]:selector==='iframe[src]'?[{src:'https://www.youtube.com/embed/abcdefghijk'},{src:'https://youtube.com.evil.invalid/embed/abcdefghijk'}]:[]};
 const doc={title:'Work',querySelector:()=>null,querySelectorAll:selector=>selector.startsWith('.project-assets')?[root]:[]};
 const result=extract('https://www.artstation.com/artwork/abc',doc);
 assert.equal(result.has_video,true);assert.equal(result._media.length,2);
 assert.equal(result._media[1].embedded_url,'https://www.youtube.com/watch?v=abcdefghijk');
});

test('generic pages without an article container fail before reading the whole body',()=>{
 const code=fs.readFileSync('source/extension/platforms.js','utf8');
 const context=vm.createContext({URL,location:new URL('https://example.org/article'),
   document:{body:{textContent:'Navigation and unrelated recommendations'},querySelector:()=>null,querySelectorAll:()=>[]}});
 vm.runInContext(code,context);
 assert.throws(()=>vm.runInContext('InspirationPlatforms.extract({collection_mode:"text"})',context),/未找到明确的文章正文/);
});
