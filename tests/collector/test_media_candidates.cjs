const test=require('node:test'),assert=require('node:assert/strict');
const X=require('../../source/extension/cat-media.js');
const IG=require('../../source/extension/cat-instagram.js');
const XHS=require('../../source/extension/cat-xhs.js');

test('XHS uses a provided original before the default preview and keeps signed URLs intact',()=>{
 const preview={imageScene:'WB_DFT',url:'https://sns-webpic-qc.xhscdn.com/preview!webp?auth=fixture'};
 const original={imageScene:'ORIGINAL',url:'https://sns-webpic-qc.xhscdn.com/original.jpg?auth=fixture'};
 assert.equal(XHS.imageUrl({infoList:[preview,original]}),original.url);
 assert.equal(XHS.imageUrl({infoList:[preview,{...original,url:''}]}),preview.url);
 assert.equal(XHS.imageUrl({infoList:[preview]}),preview.url);
});

test('XHS chooses a complete audio/video rendition before a higher-bitrate silent track',()=>{
 const silent={masterUrl:'https://sns-video-hw.xhscdn.com/silent.mp4',width:1080,height:1920,bitrate:8000000,audioChannels:0,audioCodec:''};
 const complete={masterUrl:'https://sns-video-hw.xhscdn.com/complete.mp4',width:1080,height:1920,bitrate:3000000,audioChannels:2,audioCodec:'aac'};
 const audioOnly={masterUrl:'https://sns-video-hw.xhscdn.com/audio.mp4',width:0,height:0,videoCodec:'',audioChannels:2,audioCodec:'aac',bitrate:9000000};
 const video={media:{stream:{h264:[complete,silent],audio:[audioOnly]}}};
 assert.equal(XHS.bestVideo(video).url,complete.masterUrl);
 assert.equal(XHS.mediaItems({video})[0].url,complete.masterUrl);
});

test('XHS treats absent audio metadata as unknown and keeps silent Live Photo selection',()=>{
 const unknown={masterUrl:'https://sns-video-hw.xhscdn.com/unknown.mp4',width:1080,height:1920};
 const silent={masterUrl:'https://sns-video-hw.xhscdn.com/silent.mp4',width:2160,height:3840,audioChannels:0};
 assert.equal(XHS.bestVideo({stream:[silent,unknown]}).url,unknown.masterUrl);
 assert.equal(XHS.mediaItems({imageList:[{livePhoto:true,stream:[silent,unknown]}]})[0].url,silent.masterUrl);
});

test('X chooses the usable MP4 before bitrate ranking for both video and GIF',()=>{
 for(const type of ['video','animated_gif']){
  const items=X.mediaItems([{type,video_info:{variants:[
   {content_type:'video/mp4',url:'https://video.twimg.com:8082/rejected.mp4',bitrate:9999},
   {content_type:'video/mp4',url:'https://evil.invalid/rejected.mp4',bitrate:8888},
   {content_type:'video/mp4',url:'https://video.twimg.com/accepted.mp4',bitrate:1000}]}}]);
  assert.equal(items.length,1);assert.equal(items[0].url,'https://video.twimg.com/accepted.mp4');
  assert.equal(items[0].kind,type==='video'?'video':'gif');
 }
});
test('Instagram keeps usable images and videos when a larger candidate has an unsupported URL',()=>{
 const bad={url:'https://cdninstagram.com:8082/rejected',width:4096,height:4096};
 const items=IG.mediaItems({carousel_media:[
  {id:'photo',image_versions2:{candidates:[bad,{url:'https://s.cdninstagram.com/photo.jpg',width:1000,height:1000}]}},
  {id:'video',video_versions:[bad,{url:'https://s.cdninstagram.com/movie.mp4',width:1280,height:720}]}]});
 assert.deepEqual(items.map(x=>x.url),['https://s.cdninstagram.com/photo.jpg','https://s.cdninstagram.com/movie.mp4']);
 assert.deepEqual(items.map(x=>x.kind),['photo','video']);
});
