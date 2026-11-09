const test=require('node:test'),assert=require('node:assert/strict');
const X=require('../../source/extension/cat-media.js');
const IG=require('../../source/extension/cat-instagram.js');

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
