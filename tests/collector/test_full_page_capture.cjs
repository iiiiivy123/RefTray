const test=require('node:test'),assert=require('node:assert/strict');
const {plan}=require('../../source/extension/full-page-capture.js');
test('tiles cover entire page including a partial last viewport',()=>{
 for(const [width,height] of [[800,600],[800,2501],[1701,2501],[200,100]]){
  const tiles=plan(width,height,800,600);
  assert.deepEqual(tiles[0],{x:0,y:0});
  for(let y=0;y<height;y+=17)for(let x=0;x<width;x+=23)assert.ok(tiles.some(p=>x>=p.x&&x<p.x+800&&y>=p.y&&y<p.y+600));
  assert.equal(new Set(tiles.map(p=>`${p.x},${p.y}`)).size,tiles.length);
 }
});
test('oversized and invalid pages fail rather than truncate',()=>{
 for(const args of [[800,30001,800,600],[800,30000,800,100],[0,600,800,600],[800,600,NaN,600]])assert.throws(()=>plan(...args));
});
