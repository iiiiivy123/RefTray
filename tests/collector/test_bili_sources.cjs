const test=require('node:test'),assert=require('node:assert/strict');
const Bili=require('../../source/extension/bilibili.js');
const bv='BV1wWJa61EYv',url='https://www.bilibili.com/video/'+bv+'/?p=3';
const state={videoData:{bvid:bv,aid:123,title:'Songs',owner:{mid:123,name:'Uploader'},pages:[{page:3,cid:333,part:'Song',duration:266}]}};
const primary='https://edge.mcdn.bilivideo.cn:8082/song.mp4';
const backup='https://upos.bilivideo.com/song.mp4?token=exact-track';
function read(data,format='original') {return Bili.post(url,state,{data:{cid:333,timelength:266000,...data}},'best',format);}

test('Bilibili progressive source tries the same file backups and keeps P3 identity',()=>{
 const r=read({durl:[{url:primary,backup_url:['https://evil.invalid/song.mp4',backup]}]});
 assert.equal(r.source?.url,backup);
 assert.equal(r.source.canonical_url,url);
 assert.equal(r.source.media_kind,'bilibili-file');
});
test('Bilibili audio and video select usable same-track addresses before quality ranking',()=>{
 const r=read({dash:{video:[{baseUrl:primary,codecs:'avc1',height:1080},{baseUrl:backup,codecs:'avc1',height:720}],audio:[{baseUrl:primary,backupUrl:[backup],codecs:'mp4a.40.2'}]}});
 assert.equal(r.source?.url,backup);assert.equal(r.source.audio_url,backup);assert.match(r.source.quality,/720p/);
 const audio=read({dash:{audio:[{base_url:primary,backup_url:[backup],codecs:'mp4a.40.2'}]}},'audio');
 assert.equal(audio.source.media_kind,'bilibili-audio');assert.equal(audio.source.url,backup);
});
test('Bilibili backups do not bypass a wrong part, preview, DRM or multiple file segments',()=>{
 for(const data of [{cid:999},{is_drm:true},{is_preview:true}])assert.equal(read({...data,durl:[{url:primary,backup_url:[backup]}]}).source,undefined);
 for(const durl of [[{url:primary,backup_url:['https://127.0.0.1/a.mp4']}],[{url:backup},{url:backup}]])assert.equal(read({durl}).source,undefined);
});
