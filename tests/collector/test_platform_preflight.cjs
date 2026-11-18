const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Options=require('../../source/extension/capture-options.js'),Site=require('../../source/extension/site-panel.js');
const Reader=require('../../source/extension/page-reader.js');
const XHS=require('../../source/extension/cat-xhs.js'),IG=require('../../source/extension/cat-instagram.js');
const background=fs.readFileSync('source/extension/background.js','utf8');
const previewCode=background.slice(background.indexOf('async function inspectPage('),background.indexOf('chrome.runtime.onMessage.addListener',background.indexOf('async function inspectPage(')));
const mediaCode=fs.readFileSync('source/extension/page-media.js','utf8');
const defaults={collection_mode:'text',video_action:'skip',subtitle_mode:'with_video',skip_gifs:false};
async function preview(url,payload){
 const c=vm.createContext({taskRunning:false,scanInProgress:false,taskContext:{options:{}},healthCache:null,
  chrome:{tabs:{get:async()=>({url})},storage:{local:{get:async()=>({}),remove:async()=>{}}}},ensureBackendIdle:async()=>{},
  reftrayHealth:async()=>({json:async()=>({})}),pagePayload:async()=>payload});
 vm.runInContext(previewCode,c);return c.previewCollection(42,url);
}
function socialMedia(url,record,broken=false){
 return vm.runInNewContext(mediaCode,{URL,location:new URL(url),window:{},
  XEagleXhs:broken?{xhsRecord(){throw Error('parser failed');}}:XHS,XEagleInstagram:IG,
  document:{querySelectorAll:selector=>selector.startsWith('script[')?[{textContent:JSON.stringify(record)}]:[]}});
}
async function socialPayload(url,platform,record,{broken=false,domVideo=false}={}){
 const media=socialMedia(url,record,broken);
 const chrome={tabs:{get:async()=>({url}),sendMessage:async(_id,m)=>m.type==='LIBLIB_VERSION'?{version:'test'}:
  {platform,canonical_url:url,images:[{url:'https://fixture.invalid/cover.jpg'}],has_video:domVideo,body_text:'Post caption'}},
  scripting:{executeScript:async request=>request.files?.includes('page-media.js')?[{result:media}]:[]}};
 return Reader.create({BUILD:'test',chrome}).readPagePayload(42,{collection_mode:'text',include_videos:true}, {url});
}

test('real social parsers, page reader, preview and floating routing agree for video, photos, Live Photo and mixed carousel',async()=>{
 const xhs='https://www.xiaohongshu.com/explore/6ae9f8a7000000000e027ca1',id=xhs.split('/').at(-1);
 const ig='https://www.instagram.com/p/AbCd123/';
 const image={url:'https://sns-webpic-qc.xhscdn.com/image.jpg'};
 const video={masterUrl:'https://sns-video-hw.xhscdn.com/video.mp4',width:720,height:1280,audioChannels:2};
 const photo={image_versions2:{candidates:[{url:'https://s.cdninstagram.com/photo.jpg'}]}};
 const movie={video_versions:[{url:'https://s.cdninstagram.com/video.mp4'}]};
 const rows=[
  [xhs,'xhs',{noteId:id,type:'video',video:{stream:[video]},imageList:[image]},'download',[0,0,1]],
  [xhs,'xhs',{noteId:id,type:'normal',imageList:[image]},'current',[1,0,0]],
  [xhs,'xhs',{noteId:id,type:'normal',imageList:[{...image,livePhoto:true,stream:[video]}]},'current',[0,1,0]],
  [ig,'instagram',{code:'AbCd123',media_type:2,...movie,...photo},'download',[0,0,1]],
  [ig,'instagram',{code:'AbCd123',carousel_media:[photo,movie]},'current',[1,0,1]],
  [ig,'instagram',{code:'AbCd123',...photo},'current',[1,0,0]]];
 for(const [url,platform,record,mode,counts] of rows){
  const payload=await socialPayload(url,platform,record),p=await preview(url,payload);
  assert.deepEqual([p.images,p.gifs,p.videos],counts);assert.equal(p.warning,'');
  if(counts[1]&&!counts[2])assert.equal(p.has_video,false,'GIF/Live Photo must not announce a separate video');
  const selected=Options.quick(defaults,Site.context(url),p);
  assert.equal(selected.mode,mode);assert.equal(selected.options.subtitle_mode,'none');
  assert.equal(selected.options.video_action,mode==='download'?'save':'skip');
  assert.equal(Options.floatingHint(defaults,Site.context(url),{video_output:'original'}),'点击保存时识别内容');
 }
});

test('missing video sources and parser failures cannot turn a social video cover into an automatic image/text save',async()=>{
 const url='https://www.xiaohongshu.com/explore/6ae9f8a7000000000e027ca1',id=url.split('/').at(-1);
 for(const [record,settings] of [[{noteId:id,type:'video',imageList:[{url:'https://sns-webpic-qc.xhscdn.com/cover.jpg'}]},{}],
  [{noteId:id,type:'normal'},{broken:true}], [{},{domVideo:true}]]){
  const p=await preview(url,await socialPayload(url,'xhs',record,settings));
  assert.match(p.warning,/加载|失败/);assert.throws(()=>Options.quick(defaults,Site.context(url),p),/加载|失败/);
 }
 const ig='https://www.instagram.com/reel/AbCd123/';
 const p=await preview(ig,await socialPayload(ig,'instagram',{code:'AbCd123',media_type:2,display_url:'https://s.cdninstagram.com/cover.jpg'}));
 assert.match(p.warning,/加载/);assert.throws(()=>Options.quick(defaults,Site.context(ig),p),/加载/);
});

test('all platform payload contracts are counted by shared preflight before floating mode selection',async()=>{
 const rows=[
  ['B站视频','https://www.bilibili.com/video/BV1HiGV6uExj/',{images:[{url:'cover.jpg'}],has_video:true,video_count:1},'download','video'],
  ['B站图文','https://www.bilibili.com/opus/123',{images:[{url:'body.jpg'}],body_text:'Article'},'current','text'],
  ['YouTube','https://www.youtube.com/watch?v=abcdefghijk',{images:[],has_video:true,_media:[{kind:'video',url:'movie.mp4'}]},'download','video'],
  ['X视频','https://x.com/example/status/123',{images:[],has_video:true,_media:[{kind:'video',url:'movie.mp4'}]},'download','video'],
  ['X GIF','https://x.com/example/status/123',{images:[],has_video:true,_media:[{kind:'gif',url:'motion.mp4'}]},'current','text'],
  ['ArtStation混合','https://www.artstation.com/artwork/abc',{images:[{url:'art.jpg'}],has_video:true,video_count:1},'current','text'],
  ['ArtStation视频','https://www.artstation.com/artwork/abc',{images:[],has_video:true,video_count:1},'download','video'],
  ['花瓣','https://huaban.com/pins/123',{images:[{url:'photo.jpg'}]},'current','text'],
  ['Pinterest','https://www.pinterest.com/pin/123/',{images:[{url:'photo.jpg'}]},'current','text'],
  ['Pinterest视频','https://www.pinterest.com/pin/123/',{images:[],has_video:true},'download','video'],
  ['微博','https://weibo.com/123/AbCd',{images:[],has_video:true},'download','video'],
  ['网页','https://example.com/article',{images:[],body_text:'Article'},'current','text'],
  ['SVG','https://svglogo.top/library/example.svg',{images:[{url:'https://svglogo.top/library/example.svg'}]},'current','text']];
 for(const [name,url,payload,mode,kind] of rows){
  const site=Site.context(url),p=await preview(url,payload);
  assert.equal(site.single,true,name);const selected=Options.quick(defaults,site,p);
  assert.equal(selected.mode,mode,name);assert.equal(selected.options.capture_kind,kind,name);
  if(!site.mode||site.mode==='images')assert.equal(Options.floatingHint(defaults,site,{video_output:'original'}),'点击保存时识别内容',name);
 }
 for(const url of ['https://www.instagram.com/person/reel/AbCd123/','https://www.instagram.com/person/p/AbCd123/'])assert.equal(Site.context(url).single,true,url);
});
