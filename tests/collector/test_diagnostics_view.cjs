const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.disabled=false;this._text='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;this._text='';}
 set textContent(value){this._text=value;this.children=[];} get textContent(){return this._text;}
 setAttribute(){} scrollIntoView(){} add(option){this.children.push(option);}
 before(...nodes){this.beforeNodes=nodes;}
}
function fixture(result){
 const panel=new Element('section'),old=new Element('pre'),location={hash:'',search:''};let calls=0;
 const context=vm.createContext({URLSearchParams,Date,Option:function(label,value){return {label,value};},location,
  document:{querySelector:s=>s==='#diagnostics'?panel:old,createElement:tag=>new Element(tag),addEventListener(){}},
  Hub:{api:async()=>{calls++;if(result instanceof Error)throw result;return result;}},ManageLayout:{showView(){}}});
 vm.runInContext(fs.readFileSync('source/extension/diagnostics-view.js','utf8'),context);
 const [toolbar,list,pager]=old.beforeNodes;const [query,category]=toolbar.children;const [previous,label,next]=pager.children;
 return {view:context.DiagnosticsView,query,category,list,pager,previous,label,next,location,get calls(){return calls;}};
}
const rows=Array.from({length:25},(_,i)=>({id:'record-'+i,time:'2026-11-11T12:00:00Z',code:i%2?'NETWORK':'EXTRACTOR',source:'https://x.com/example',summary:'问题 '+i,detail:'detail '+i}));
test('diagnostics paginate 10 at a time and keep full logs collapsed',async()=>{
 const f=fixture({items:rows});await f.view.load();assert.equal(f.list.children.length,10);assert.equal(f.previous.disabled,true);
 assert.ok(f.list.children.every(c=>c.children[2].tag==='details'&&!c.children[2].open));
 f.next.onclick();assert.equal(f.list.children[0].children[0].textContent,'问题 10');
 f.next.onclick();assert.equal(f.list.children.length,5);assert.equal(f.next.disabled,true);
 f.previous.onclick();assert.equal(f.list.children.length,10);await f.view.ensureLoaded();assert.equal(f.calls,1);
});
test('filter resets the page and diagnostic links find items beyond the first page',async()=>{
 const f=fixture({items:rows});await f.view.load();f.next.onclick();f.next.onclick();f.category.value='NETWORK';f.category.onchange();
 assert.equal(f.list.children.length,10);assert.match(f.label.textContent,/1 \/ 2/);
 await f.view.open('record-24');assert.equal(f.location.hash,'diagnostics');assert.equal(f.list.children.length,1);assert.equal(f.list.children[0].children[0].textContent,'问题 24');
 f.query.value='missing';f.query.oninput();assert.equal(f.list.textContent,'没有匹配的诊断');assert.equal(f.pager.hidden,true);
});
test('empty records and loading failures have different visible results',async()=>{
 const empty=fixture({items:[]});await empty.view.load();assert.equal(empty.list.textContent,'暂无诊断记录');
 for(const result of [new Error('离线'),{}]){const f=fixture(result);await f.view.load();assert.match(f.list.textContent,/诊断读取失败/);assert.equal(f.pager.hidden,true);await f.view.ensureLoaded();assert.equal(f.calls,2);}
});
