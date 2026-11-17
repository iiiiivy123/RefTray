const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {summary,bounds}=require('../../source/extension/floating-save.js');
function fixture({result={new_images:22,message:'保存路径\n'+ '详细记录'.repeat(1000)},stored={},replyError='',storageError=false}={}){
 const nodes={},calls=[],writes=[],timers=new Map();let timerId=0,focused;
 class Element {
  constructor(){this.style={};this.dataset={};this.attrs={};this.listeners={};this.hidden=false;this.offsetWidth=112;this.offsetHeight=48;this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),toggle:(k,v)=>v?this.classes.add(k):this.classes.delete(k)};}
  setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}addEventListener(k,v){this.listeners[k]=v;}
  dispatch(k,value={}){return this.listeners[k]?.({button:0,isPrimary:true,pointerId:1,clientX:900,clientY:700,preventDefault(){},stopPropagation(){},...value,type:k});}
  getBoundingClientRect(){return {width:112,height:48};}attachShadow(){return shadow;}append(){}matches(){return false;}focus(){focused=this;}
  setPointerCapture(id){this.capture=id;}hasPointerCapture(id){return this.capture===id;}releasePointerCapture(){this.capture=null;}
 }
 const shadow=new Element();shadow.querySelector=s=>nodes[s]||(nodes[s]=new Element());
 for(const key of ['#notice','#menu','#detail'])shadow.querySelector(key).hidden=true;
 const host=new Element(),window=new Element();window.top=window;
 const context={window,location:{origin:'https://example.com'},document:{body:{append(){}},querySelector:()=>null,createElement:()=>host,addEventListener(){}},innerWidth:1366,innerHeight:900,Math,Number,Object,String,Error,
  setTimeout:(f,ms)=>{timers.set(++timerId,{f,ms});return timerId;},clearTimeout:id=>timers.delete(id),
  chrome:{storage:{local:{get:async()=>stored,set:async v=>{if(storageError)throw Error('denied');writes.push(v);}},onChanged:{addListener(){}}},runtime:{sendMessage:async m=>{calls.push(m);return replyError?{ok:false,error:replyError}:{ok:true,result,context:{mode:'自动识别',directory:'F:/Example',latest:{id:7,directory:'F:/Example/Saved'}}};}}}};
 vm.runInNewContext(fs.readFileSync('source/extension/floating-save.js','utf8'),context);
 return {nodes,host,window,context,calls,writes,timers,focused:()=>focused};
}
const settled=()=>new Promise(resolve=>setImmediate(resolve));
test('short summaries distinguish partial, skipped, duplicate, stopped and failure',()=>{
 for(const [r,kind,text] of [[{new_images:22},'success','22'],[{images:2},'success','2'],[{documents:1},'success','文字'],[{duplicate_images:3},'success','保存过'],[{new_images:2,partial:true},'warning','部分'],[{status:'stopped'},'warning','停止'],[{status:'skipped'},'warning','跳过'],[{status:'failed',failed_images:3},'error','失败']]){
  const value=summary({...r,message:'private path '.repeat(500)});assert.equal(value.kind,kind);assert.ok(value.text.includes(text));assert.ok(value.text.length<30);
 }
});
test('viewport bounds keep controls reachable including tiny and corrupt stored values',()=>{
 for(const [w,h] of [[1366,900],[320,240],[202,56]])for(const [x,y] of [[-900,-700],[Infinity,NaN],[90000,80000]]){
  const p=bounds(x,y,202,56,w,h);assert.ok(p.x>=0&&p.y>=0&&p.x+202<=w&&p.y+56<=h);
 }
});
test('drag release never saves; next normal click saves once; result hides long details',async()=>{
 const f=fixture();await settled();const b=f.nodes['#save'];
 b.dispatch('pointerdown');b.dispatch('pointermove',{clientX:400,clientY:300});b.dispatch('pointerup',{clientX:400,clientY:300});await b.onclick({detail:1});
 assert.equal(f.calls.length,0);assert.equal(f.writes.length,1);
 b.dispatch('pointerdown');b.dispatch('pointerup');const pending=b.onclick({detail:1});await b.onclick({detail:1});await pending;
 assert.equal(f.calls.length,1);assert.equal(f.nodes['#result'].textContent,'已保存 22 张图片');assert.equal(f.nodes['#detail'].hidden,true);assert.ok(f.nodes['#detail'].textContent.length>4000);
 f.nodes['#details'].onclick();assert.equal(f.nodes['#detail'].hidden,false);assert.equal(f.timers.size,0);
 f.nodes['#dismiss'].onclick();assert.equal(f.nodes['#notice'].hidden,true);assert.equal(f.focused(),b);
});
test('pointer cancellation restores position and never persists or saves',async()=>{
 const f=fixture();await settled();const b=f.nodes['#save'],before={...f.host.style};
 b.dispatch('pointerdown');b.dispatch('pointermove',{clientX:200,clientY:100});b.dispatch('pointercancel');await b.onclick({detail:1});
 assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);assert.equal(f.host.style.left,before.left);assert.equal(f.host.style.top,before.top);
});
test('stored position restores, resize clamps and keyboard movement is persisted',async()=>{
 const f=fixture({stored:{reftrayFloatingPosition:{x:.1,y:.2}}});await settled();assert.ok(parseFloat(f.host.style.left)<200);
 f.nodes['#grip'].dispatch('keydown',{key:'ArrowRight'});assert.equal(f.writes.length,1);
 f.context.innerWidth=320;f.context.innerHeight=240;f.window.dispatch('resize');assert.ok(parseFloat(f.host.style.left)+112<=320);assert.ok(parseFloat(f.host.style.top)+48<=240);
});
test('errors remain visible, menu navigation is separate from saving, Escape restores focus',async()=>{
 const f=fixture({replyError:'connection failed\n'+'debug'.repeat(1000)});await settled();await f.nodes['#save'].onclick({detail:0});
 assert.equal(f.nodes['#notice'].dataset.kind,'error');assert.equal(f.timers.size,0);assert.ok(f.nodes['#result'].textContent.length<25);
 f.nodes['#more'].onclick();assert.equal(f.nodes['#menu'].hidden,false);assert.equal(f.nodes['#notice'].hidden,true);
 await f.nodes['#history'].onclick();assert.equal(f.calls.at(-1).type,'REFTRAY_OPEN_MANAGE');assert.equal(f.calls.at(-1).section,'history');
});
test('storage failure is reported without undoing movement or starting capture',async()=>{
 const f=fixture({storageError:true});await settled();f.nodes['#grip'].dispatch('keydown',{key:'ArrowLeft'});await settled();
 assert.equal(f.nodes['#result'].textContent,'位置已移动，但未能记住');assert.equal(f.calls.length,0);
});
test('success expires, partial does not, settings can initially hide the control',async()=>{
 const f=fixture();await settled();await f.nodes['#save'].onclick({detail:0});const timeout=[...f.timers.values()].find(t=>t.ms===5000);assert.ok(timeout);timeout.f();assert.equal(f.nodes['#notice'].hidden,true);
 const p=fixture({result:{partial:true,new_images:3}});await settled();await p.nodes['#save'].onclick({detail:0});assert.equal(p.timers.size,0);
 const hidden=fixture({stored:{reftrayFloatingEnabled:false}});await settled();assert.equal(hidden.host.hidden,true);
});

test('new default is upper right; per-site disable and saved position still win',async()=>{
 const fresh=fixture();await settled();assert.equal(fresh.host.style.top,'96px');
 const old=fixture({stored:{reftrayFloatingPosition:{x:.8,y:.85}}});await settled();assert.ok(parseFloat(old.host.style.top)>600);
 const off=fixture({stored:{reftrayFloatingSites:{'https://example.com':false}}});await settled();assert.equal(off.host.hidden,true);
});
test('hover only opens context, leaving closes, dragging cancels opening',async()=>{
 const f=fixture();await settled();f.host.dispatch('pointerenter',{pointerType:'mouse'});
 await [...f.timers.values()].find(t=>t.ms===350).f();await settled();
 assert.equal(f.nodes['#menu'].hidden,false);assert.ok(f.calls.every(c=>c.type==='REFTRAY_FLOATING_CONTEXT'));
 f.host.dispatch('pointerleave');[...f.timers.values()].find(t=>t.ms===250).f();assert.equal(f.nodes['#menu'].hidden,true);
 f.host.dispatch('pointerenter');f.nodes['#save'].dispatch('pointerdown');assert.ok(![...f.timers.values()].some(t=>t.ms===350));
});
test('one-time options reset for the next normal click, and folders use history IDs',async()=>{
 const f=fixture({result:{new_videos:1,captureId:8}});await settled();
 f.nodes['#more'].onclick();await settled();f.nodes['#options'].onclick();f.nodes['#choice'].value='video';await f.nodes['#save-options'].onclick();
 assert.equal(f.calls.find(c=>c.type==='REFTRAY_QUICK_SAVE').choice,'video');assert.equal(f.nodes['#current'].hidden,false);
 await f.nodes['#current'].onclick();assert.equal(f.calls.at(-1).captureId,8);
 await f.nodes['#save'].onclick({detail:0});assert.equal(f.calls.at(-1).choice,'auto');assert.equal(f.writes.length,0);
});
test('failed one-time save retries the same choice and preserves visible details',async()=>{
 const f=fixture({replyError:'failed'});await settled();f.nodes['#options'].onclick();f.nodes['#choice'].value='plain';await f.nodes['#save-options'].onclick();
 assert.equal(f.nodes['#retry'].hidden,false);await f.nodes['#retry'].onclick();assert.equal(f.calls.at(-1).choice,'plain');assert.equal(f.nodes['#result-links'].hidden,false);
});
test('a panel remains inside a narrow viewport after the saved button position is clamped',async()=>{
 const f=fixture();await settled();f.context.innerWidth=320;f.context.innerHeight=500;f.nodes['#menu'].offsetWidth=240;f.window.dispatch('resize');f.nodes['#more'].onclick();await settled();
 const left=parseFloat(f.host.style.left)+parseFloat(f.nodes['#menu'].style.left);assert.ok(left>=12);assert.ok(left+240<=308);
});

test('success folder action keeps the expanded result inside a narrow viewport',async()=>{
 const f=fixture({result:{new_images:3,captureId:8}});await settled();f.context.innerWidth=320;f.context.innerHeight=500;f.window.dispatch('resize');
 Object.defineProperty(f.nodes['#notice'],'offsetWidth',{get:()=>f.nodes['#current']?.hidden?112:230});
 await f.nodes['#save'].onclick({detail:0});
 const left=parseFloat(f.host.style.left)+parseFloat(f.nodes['#notice'].style.left);assert.ok(left>=12);assert.ok(left+230<=308);
});
