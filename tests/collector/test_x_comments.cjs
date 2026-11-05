const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('source/extension/x-comments.js','utf8');
function article(id,parent,text,images=[]){
 const a={__reactProps$fixture:{rest_id:id,legacy:{in_reply_to_status_id_str:parent,full_text:text}},querySelectorAll(selector){if(selector==='a[href]')return[{href:'https://x.com/user/status/'+id,querySelector:()=>({}),closest:()=>null}];if(selector==='[data-testid="tweetPhoto"] img')return images.map(src=>({src,currentSrc:src,closest:()=>null}));return[];},querySelector:()=>null};return a;
}
test('X replies retain image-only replies, order and identities; unrelated parents are excluded',()=>{
 const articles=[article('1','0','main'),article('3','1','',['https://pbs.twimg.com/media/photo?format=jpg']),article('2','1','hello'),article('4','99','unrelated')];
 const result=vm.runInNewContext(source,{location:{hostname:'x.com',pathname:'/user/status/1'},document:{querySelectorAll:selector=>selector.startsWith('article')?articles:[]}});
 assert.equal(result.comments.length,2);assert.equal(result.comments[0].id,'3');assert.equal(result.comments[0].text,'');assert.equal(result.comments[0].images.length,1);assert.equal(result.comments[1].id,'2');
});
