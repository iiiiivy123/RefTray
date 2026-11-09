const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const base='source/extension/',bg=fs.readFileSync(base+'background.js','utf8');
const fn=(name,next)=>bg.slice(bg.indexOf('async function '+name+'('),bg.indexOf('async function '+next+'('));
const url='https://x.com/example/status/1234567890123';
test('X page script failures are not converted to an empty media list',async()=>{
 const c=vm.createContext({URL,chrome:{tabs:{get:async()=>({url})},scripting:{executeScript:async()=>{throw Error('script context invalidated');}}}});
 vm.runInContext('let taskContext={options:{}};async function setMediaQuality(){};'+fn('loadedPageMedia','includeProtectedImages'),c);
 await assert.rejects(c.loadedPageMedia(1,false),/X_PAGE_READ.*script context invalidated/);
});
test('X video retains the page failure when the guest resolver also fails; calls guest once',async()=>{
 let calls=0;
 const c=vm.createContext({URL,loadedPageMedia:async()=>{throw Error('[X_PAGE_READ] script context invalidated');},matureMedia:async()=>{calls++;throw Error('[IDENTITY] missing post id');}});
 vm.runInContext(fn('videoSource','browserYouTubeCaptions'),c);
 await assert.rejects(c.videoSource({id:1,url},{}),e=>/script context invalidated/.test(e.message)&&/missing post id/.test(e.message));
 assert.equal(calls,1);
});
test('X exact page video bypasses guest resolver; a different post does not',async()=>{
 let calls=0;let postId='1234567890123';
 const c=vm.createContext({URL,loadedPageMedia:async()=>({postId,media:[{kind:'video',url:'https://video.twimg.com/main.mp4'}]}),matureMedia:async()=>{calls++;throw Error('guest unavailable');}});
 vm.runInContext(fn('videoSource','browserYouTubeCaptions'),c);
 assert.equal((await c.videoSource({id:1,url},{})).url,'https://video.twimg.com/main.mp4');assert.equal(calls,0);
 postId='9999999999999';await assert.rejects(c.videoSource({id:1,url},{}),/X_PAGE_ID/);assert.equal(calls,1);
});
test('X reader finds exact tweet props on a descendant without following unrelated React owners',()=>{
 const target={rest_id:'1234567890123',legacy:{extended_entities:{media:[{type:'video',video_info:{variants:[{content_type:'video/mp4',url:'https://video.twimg.com/main.mp4'}]}}]}}};
 const link={closest:s=>s==='article'?article:null,querySelector:()=>({}),getAttribute:()=>'/example/status/1234567890123'};
 const child={__reactProps$test:{tweet:target}};
 const article={querySelectorAll:s=>s==='a[href]'?[link]:s==='*'?[child]:[],querySelector:()=>({closest:()=>link})};
 const c=vm.createContext({URL,location:new URL(url),document:{querySelectorAll:s=>s==='article[data-testid="tweet"]'?[article]:[]}});
 vm.runInContext(fs.readFileSync(base+'cat-media.js','utf8'),c);
 const result=vm.runInContext(fs.readFileSync(base+'page-media.js','utf8'),c);
 assert.equal(result.media.length,1);assert.equal(result.media[0].url,'https://video.twimg.com/main.mp4');
});

test('X page reader excludes another tweet and rejects non-CDN video sources',()=>{
 const record=(id,url)=>({rest_id:id,legacy:{extended_entities:{media:[{type:'video',video_info:{variants:[{content_type:'video/mp4',url}]}}]}}});
 const c=vm.createContext({URL,location:new URL(url),document:{querySelectorAll:s=>s.startsWith('script')?[{textContent:JSON.stringify({items:[record('9999999999999','https://video.twimg.com/other.mp4'),record('1234567890123','https://example.com/not-a-cdn.mp4')]})}]:[]}});
 vm.runInContext(fs.readFileSync(base+'cat-media.js','utf8'),c);
 const result=vm.runInContext(fs.readFileSync(base+'page-media.js','utf8'),c);
 assert.equal(result.media.length,0);
});

test('X multiple page videos require selection instead of taking a guest singleton',async()=>{
 let calls=0;
 const c=vm.createContext({URL,loadedPageMedia:async()=>({postId:'1234567890123',media:[{kind:'video',url:'https://video.twimg.com/one.mp4'},{kind:'video',url:'https://video.twimg.com/two.mp4'}]}),matureMedia:async()=>{calls++;return {media:[{kind:'video',url:'https://video.twimg.com/wrong.mp4'}]};}});
 vm.runInContext(fn('videoSource','browserYouTubeCaptions'),c);
 await assert.rejects(c.videoSource({id:1,url},{}),/多个动态媒体/);assert.equal(calls,0);
 assert.equal((await c.videoSource({id:1,url},{},true)).length,2);assert.equal(calls,0);
});

test('MCP queues every identity-checked public fallback video while manual selection stays explicit',async()=>{
 const media=[{kind:'video',url:'one'},{kind:'gif',url:'two'}];let calls=0;
 const c=vm.createContext({URL,loadedPageMedia:async()=>{throw Error('page unavailable');},matureMedia:async()=>{calls++;return {media};}});
 vm.runInContext(fn('videoSource','browserYouTubeCaptions'),c);
 const result=await c.videoSource({id:1,url},{},true);
 assert.equal(result.length,2);assert.equal(result[1].url,'two');assert.match(result[0].resolver_warning,/page unavailable/);assert.equal(calls,1);
 await assert.rejects(c.videoSource({id:1,url},{}),/多个动态媒体/);
});
