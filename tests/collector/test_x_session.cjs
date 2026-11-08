const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const base='source/extension/';
test('flat loaded tweet media keeps exact identity and separate photo/GIF/video types',()=>{
 const api=require('../../source/extension/cat-media.js');
 for(const [type,kind] of [['photo','photo'],['animated_gif','gif'],['video','video']]){
  const full=tweet('1234567890123',type),flat={id_str:full.rest_id,...full.legacy};
  assert.equal(api.tweetRecord(flat).tweetId,full.rest_id);
  assert.equal(api.tweetRecord(flat).media[0].kind,kind);
  delete flat.id_str;assert.equal(api.tweetRecord(flat),null);
 }
});
const tweet=(id,type='photo')=>({rest_id:id,legacy:{full_text:'ordinary sample',extended_entities:{media:[{type,media_url_https:'https://pbs.twimg.com/media/sample.jpg',video_info:{variants:[{content_type:'video/mp4',url:'https://video.twimg.com/ext_tw_video/'+id+'/pu/vid/720x720/sample.mp4',bitrate:200}]}}]}},core:{user_results:{result:{legacy:{screen_name:'sample'}}}}});
function session(data,url='https://x.com/i/api/graphql/hash/TweetDetail'){
 const response=new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});Object.defineProperty(response,'url',{value:url});
 const promise=Promise.resolve(response);let calls=0;
 class XHR{send(){} addEventListener(){}}
 const context=vm.createContext({URL,Map,WeakSet,Date,JSON,Object,Reflect,TextDecoder,structuredClone,XMLHttpRequest:XHR,location:new URL('https://x.com/sample/status/1234567890123'),fetch:()=>{calls++;return promise;}});
 for(const name of ['cat-media.js','x-session.js'])vm.runInContext(fs.readFileSync(base+name,'utf8'),context);
 return {context,promise,calls:()=>calls};
}
test('X session leaves original response usable and isolates images/GIF/video by tweet ID',async()=>{
 const s=session({items:[tweet('1234567890123'),tweet('1234567890124','animated_gif'),tweet('1234567890125','video')]});
 assert.equal(s.context.fetch('/anything'),s.promise);assert.equal(s.calls(),1);
 assert.equal((await (await s.promise).json()).items.length,3);
 await new Promise(r=>setTimeout(r,30));
 const api=s.context.RefTrayXSession;
 assert.equal(api.get('1234567890123').media[0].kind,'photo');
 assert.equal(api.get('1234567890124').media[0].kind,'gif');
 assert.equal(api.get('1234567890125').media[0].kind,'video');
 assert.equal(api.get('9999999999999'),null);
 const row=api.get('1234567890123');row.media=[];assert.equal(api.get('1234567890123').media.length,1);
 assert.deepEqual(Object.keys(row).sort(),['account','media','postId','seen','text']);
});
test('X session ignores private messages, foreign origins, malformed JSON and non-CDN assets',async()=>{
 for(const url of ['https://x.com/i/api/1.1/dm/inbox','https://evil.invalid/i/api/graphql/hash/TweetDetail']){
  const s=session(tweet('1234567890123'),url);await s.context.fetch('/');await new Promise(r=>setTimeout(r,15));assert.equal(s.context.RefTrayXSession.get('1234567890123'),null);
 }
 const row=tweet('1234567890123');row.legacy.extended_entities.media[0].media_url_https='https://evil.invalid/image.jpg';
 const s=session(row);await s.context.fetch('/');await new Promise(r=>setTimeout(r,15));assert.equal(s.context.RefTrayXSession.get('1234567890123'),null);
});
test('Huaban matches exact Pin, not recommendation or video poster',()=>{
 const {extract}=require('../../source/extension/huaban.js');
 const doc={title:'sample',querySelectorAll:()=>[]};
 const state={__NEXT_DATA__:{recommended:{pin_id:999,file:{type:'image/jpeg',key:'a'.repeat(40)}},pin:{pin_id:123,file:{type:'image/jpeg',key:'b'.repeat(40)},raw_text:'target'}}};
 assert.equal(extract('https://huaban.com/pins/123',doc,state).images[0].url,'https://hbimg.huaban.com/'+'b'.repeat(40));
 state.__NEXT_DATA__.pin.file.type='video/mp4';assert.equal(extract('https://huaban.com/pins/123',doc,state),null);
 assert.throws(()=>extract('https://evil.invalid/pins/123',doc,state));
});
test('progress retains current percentage across text updates and stops on confirmation',()=>{
 const c=vm.createContext({});vm.runInContext(fs.readFileSync(base+'task-progress.js','utf8'),c);
 const first=c.TaskProgress.reduce({}, {percent:40,stage:'saving',message:'2/5'});
 assert.equal(c.TaskProgress.reduce(first,{message:'writing'}).percent,40);
 assert.equal(c.TaskProgress.ring({status:'awaiting_approval'},true).indeterminate,false);
 const job={limit:10,queue:[],records:{a:{status:'saved'},b:{status:'skipped',quota_exempt:true}}};
 const result=c.TaskProgress.reduce({}, {percent:90},job);assert.equal(result.percent,10);assert.equal(result.current.percent,90);
});
test('X photo payload survives supplemental GIF and skip-GIF filtering',async()=>{
 const code=fs.readFileSync(base+'background.js','utf8');
 const fn=code.slice(code.indexOf('async function readPagePayload('),code.indexOf('async function readXReplies('));
 for(const skip of [false,true]){
  const payload={platform:'x',canonical_url:'https://x.com/sample/status/1234567890123',images:[{url:'https://pbs.twimg.com/media/photo?format=jpg&name=orig'}],extraction_warnings:[]};
  const c=vm.createContext({URL,Map,inject:async()=>{},chrome:{tabs:{sendMessage:async()=>structuredClone(payload)}},
    loadedPageMedia:async()=>({postId:'1234567890123',media:[{kind:'gif',url:'https://video.twimg.com/gif.mp4'}]})});
  vm.runInContext(fn,c);
  const result=await c.readPagePayload(1,{skip_gifs:skip},{url:payload.canonical_url});
  assert.equal(result.images.length,1);assert.equal(result._media.length,skip?0:1);
 }
});


test('confirmed plain-text X posts survive the session cache without changing photo/GIF records',async()=>{
 const plain=tweet('1234567890199');delete plain.legacy.extended_entities;
 const s=session({items:[plain,tweet('1234567890123'),tweet('1234567890124','animated_gif')]});
 await s.context.fetch('/');await new Promise(r=>setTimeout(r,30));
 assert.equal(s.context.RefTrayXSession.get('1234567890199').text_only,true);
 assert.equal(s.context.RefTrayXSession.get('1234567890199').media.length,0);
 assert.equal(s.context.RefTrayXSession.get('1234567890123').media[0].kind,'photo');
 assert.equal(s.context.RefTrayXSession.get('1234567890124').media[0].kind,'gif');
});
