const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(kind='xhs'){
 let clicks=0,loaded=0;
 const parent={id:'parent-1',getBoundingClientRect:()=>({width:300}),getAttribute:()=>null,parentElement:{closest:()=>null},
  cloneNode:()=>({querySelectorAll:()=>[],querySelector:()=>({textContent:'parent text'})}),
  querySelectorAll:selector=>selector==='.comment-item'||selector==='ul ul li'?Array.from({length:loaded},()=>({})):buttons};
 const button=(label,link=false)=>({textContent:label,getBoundingClientRect:()=>({width:100}),getAttribute:()=>null,closest:s=>s==='a'?(link?{}:null):parent,click:()=>{clicks++;loaded++;}});
 const buttons=[button('回复'),button('关注'),button('展开 5 条回复',true),button(kind==='xhs'?'展开 5 条回复':'View replies (5)')];
 const root={getBoundingClientRect:()=>({width:500}),contains:()=>false,querySelectorAll:()=>[parent]};
 const location=new URL(kind==='xhs'?'https://www.xiaohongshu.com/explore/685a89a90000000010026c6d':'https://www.instagram.com/p/ABC123/');
 const ctx=vm.createContext({URL,location,document:{querySelectorAll:()=>[root]},getComputedStyle:()=>({display:'block',visibility:'visible'})});
 for(const name of ['comment-replies.js','platforms.js'])vm.runInContext(fs.readFileSync('source/extension/'+name,'utf8'),ctx);
 return {ctx,root,parent,buttons,location,get clicks(){return clicks;}};
}
test('only explicit reply expansion is clicked, bounded per parent and caller limit',()=>{
 for(const kind of ['xhs','instagram']){
  const f=fixture(kind),options={comment_limit:1,replies_per_comment:2};let state={};
  for(let i=0;i<2;i++){const result=f.ctx.CollectorReplies.step(f.root,kind,options,state);assert.equal(result.done,false);state=result.state;}
  assert.equal(f.ctx.CollectorReplies.step(f.root,kind,options,state).done,true);
  assert.equal(f.clicks,2);
 }
});
test('changed post and multiple unrelated roots prevent expansion',()=>{
 const f=fixture();
 assert.throws(()=>f.ctx.InspirationPlatforms.replyStep(f.location.href.replace('685a89a9','685a89a8'),{},{}),/页面已切换/);
 assert.equal(f.clicks,0);
 f.ctx.document.querySelectorAll=()=>[f.root,{...f.root}];
 assert.throws(()=>f.ctx.InspirationPlatforms.replyStep(f.location.href,{},{}),/唯一/);
 assert.equal(f.clicks,0);
});
test('unresponsive expand buttons stop after three attempts, without unbounded clicking',()=>{
 const f=fixture();f.buttons[3].click=()=>{};let state={};
 for(let i=0;i<3;i++){const result=f.ctx.CollectorReplies.step(f.root,'xhs',{},state);assert.equal(result.done,false);state=result.state;}
 assert.equal(f.ctx.CollectorReplies.step(f.root,'xhs',{},state).done,true);
});
