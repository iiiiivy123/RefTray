const test=require('node:test');
const assert=require('node:assert/strict');
const {extract}=require('../../source/extension/huaban.js');
const url='https://huaban.com/pins/7306038360/';
function fixture({id='7306038360',imageId=id,src='https://gd-hbimg-edge.huaban.com/image_fw1200webp?auth_key=keep-this',loaded=true}={}){
 const image={currentSrc:src,alt:'正文图片',complete:loaded,naturalWidth:loaded?1200:0,naturalHeight:1600};
 const detail={querySelectorAll:s=>s===`img[data-preview-pin-id="${imageId}"][data-pin-detail="true"]`?[image]:[],querySelector:()=>({getAttribute:()=> '采集作者'})};
 return {title:'花瓣',querySelector:s=>s===`#pin_detail[data-pin-image-id="${id}"]`?detail:null,querySelectorAll:()=>[]};
}
test('modern exact Pin detail retains signed image URL and excludes unrelated media',()=>{
 const result=extract(url,fixture(),{});
 assert.equal(result.images.length,1);assert.match(result.images[0].url,/auth_key=keep-this$/);
 assert.equal(result.author_name,'采集作者');assert.equal(result.has_video,false);
});
test('stale container or different image identity is not the current Pin',()=>{
 assert.equal(extract(url,fixture({id:'123'}),{}),null);
 assert.equal(extract(url,fixture({imageId:'123'}),{}),null);
});
test('unloaded image is not reported as ready',()=>assert.equal(extract(url,fixture({loaded:false}),{}),null));

test('fullscreen viewer reads only the loaded image matching modalImg',()=>{
 const src='https://gd-hbimg-edge.huaban.com/sample_fw1200?auth_key=preserved';
 const image={src,complete:true,naturalWidth:640,naturalHeight:914};
 const doc={title:'viewer',querySelector:()=>null,querySelectorAll:s=>s==='img[alt="查看图片"]'?[image]:[]};
 const viewer=url+'?modalImg='+encodeURIComponent(src);
 assert.equal(extract(viewer,doc,{}).images[0].url,src);
 image.src='https://gd-hbimg-edge.huaban.com/different';assert.equal(extract(viewer,doc,{}),null);
 image.src=src;image.naturalWidth=0;assert.equal(extract(viewer,doc,{}),null);
});

test('exact detail image identifies the Pin when its wrapper has no Pin attribute',()=>{
 const original=fixture();
 const detail=original.querySelector('#pin_detail[data-pin-image-id="7306038360"]');
 const doc={...original,querySelector:s=>s==='#pin_detail'?detail:null};
 assert.equal(extract(url,doc,{}).images.length,1);
 const wrong=fixture({imageId:'123'});
 const wrongDetail=wrong.querySelector('#pin_detail[data-pin-image-id="7306038360"]');
 assert.equal(extract(url,{...wrong,querySelector:s=>s==='#pin_detail'?wrongDetail:null},{}),null);
});
test('invalid CDN and embedded credentials are rejected',()=>{
 for(const src of ['https://huaban.com.attacker.test/image','https://user:pass@gd-hbimg-edge.huaban.com/image','http://gd-hbimg-edge.huaban.com/image'])assert.equal(extract(url,fixture({src}),{}),null);
});
test('legacy exact Pin state remains usable',()=>{
 const result=extract(url,fixture({id:'123'}),{__INITIAL_STATE__:{pin:{pin_id:'7306038360',file:{type:'image/png',key:'a'.repeat(40)}}}});
 assert.equal(result.images[0].url,'https://hbimg.huaban.com/'+'a'.repeat(40));
});

test('Huaban keeps the signed preview as fallback and offers the same asset without the resize suffix',()=>{
 const original='https://gd-hbimg-edge.huaban.com/'+'c'.repeat(40)+'-WE9Q4o?auth_key=fixture';
 const preview=original.replace('?','_fw1200webp?');
 const result=extract(url,fixture({src:preview}),{});
 assert.equal(result.images[0].url,preview);assert.equal(result.images[0].preferred_url,original);
});

test('Huaban browser prefetch records which source produced the bytes and falls back on failure',async()=>{
 const {create}=require('../../source/extension/page-reader.js');
 const savedFetch=global.fetch;
 try {
  for(const failure of [true,false]){
   const calls=[];global.fetch=async source=>{calls.push(source);return new Response(new Uint8Array([1,2,3]),{status:failure&&source==='https://gd-hbimg-edge.huaban.com/original'?403:200,headers:{'Content-Type':'image/png'}});};
   const payload={platform:'huaban',images:[{url:'https://gd-hbimg-edge.huaban.com/preview',preferred_url:'https://gd-hbimg-edge.huaban.com/original'}]};
   await create({}).includeProtectedImages(payload,'https://huaban.com/pins/7306038360');
   assert.equal(payload.images[0].data_url,'https://gd-hbimg-edge.huaban.com/'+(failure?'preview':'original'));
   assert.equal(payload.images[0].data_base64,'AQID');assert.equal(calls.length,failure?2:1);
  }
 }finally{global.fetch=savedFetch;}
});
test('Huaban submit prefetches only its own CDN and keeps the returned bytes',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const code=(fs.readFileSync('source/extension/page-reader.js','utf8')+'\n'+fs.readFileSync(require.resolve('../../source/extension/background.js'),'utf8'));
 const source=code.slice(code.indexOf('async function submit('),code.indexOf('async function pageProblem('));
 const own={url:'https://gd-hbimg-edge.huaban.com/image?auth_key=signed'};
 const foreign={url:'https://huaban.com.attacker.test/image'};
 const payload={platform:'huaban',images:[own,foreign]},prefetched=[];
 const c=vm.createContext({URL,Map,crypto,taskContext:{options:{}},imagesRemaining:()=>Infinity,reserveImages:()=>{},
  includeProtectedImages:async value=>{prefetched.push(...value.images.map(i=>i.url));value.images=value.images.map(i=>({...i,data_base64:'verified-by-browser'}));},
  controlPoint:async()=>{throw new Error('test-stop-before-submit');}});
 vm.runInContext(source,c);
 await assert.rejects(c.submit(payload,url,8766),/test-stop-before-submit/);
 assert.deepEqual(prefetched,[own.url]);assert.equal(payload.images[0].data_base64,'verified-by-browser');
 assert.equal(payload.images[1].data_base64,undefined);
});

test('Huaban normal page waits for identified main image; timeout never falls into recommendation extraction',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const code=(fs.readFileSync('source/extension/page-reader.js','utf8')+'\n'+fs.readFileSync('source/extension/background.js','utf8'));
 const source=code.slice(code.indexOf('async function readPagePayload('),code.indexOf('async function loadedPageMedia('));
 for(const ready of [true,false]){
  let reads=0,generic=0;
  const context=vm.createContext({URL,controlledWait:async()=>{},controlPoint:async()=>{},
   inject:async()=>{generic++;throw Error('wrong generic fallback');},
   chrome:{scripting:{executeScript:async input=>input.files?[]:[{result:++reads>=3&&ready?{images:[{url:'https://gd-hbimg-edge.huaban.com/main?auth_key=fixture'}]}:null}]}}});
  vm.runInContext(source,context);
  const result=context.readPagePayload(7,{}, {url});
  if(ready)assert.equal((await result).images.length,1);
  else await assert.rejects(result,/主图.*加载|未确认.*主图/);
  assert.equal(generic,0);assert.ok(reads>=3&&reads<=16);
 }
});
