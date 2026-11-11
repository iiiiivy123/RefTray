(() => {
 const q=s=>document.querySelector(s),panel=q('#diagnostics');
 const old=q('#resolver-diagnostic-text');old.hidden=true;
 const toolbar=document.createElement('div');toolbar.className='diagnostic-toolbar';
 const query=document.createElement('input');query.placeholder='搜索诊断编号、站点或错误';query.setAttribute('aria-label','搜索诊断');
 const category=document.createElement('select');category.setAttribute('aria-label','诊断分类');
 const list=document.createElement('div');list.id='diagnostics-list';list.setAttribute('aria-live','polite');
 const pager=document.createElement('nav');pager.className='diagnostic-pager';pager.setAttribute('aria-label','诊断分页');
 const previous=document.createElement('button'),next=document.createElement('button'),pageText=document.createElement('span');
 previous.type=next.type='button';previous.textContent='上一页';next.textContent='下一页';pager.append(previous,pageText,next);
 toolbar.append(query,category);old.before(toolbar,list,pager);
 let items=[],page=1,loaded=false,loading=null;const pageSize=10;
 function paint(){
  list.replaceChildren();const term=query.value.trim().toLowerCase();
  const rows=items.filter(x=>(!category.value||x.code===category.value)&&(!term||[x.id,x.source,x.summary,x.detail,x.stage].join(' ').toLowerCase().includes(term)));
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.max(1,Math.min(page,pages));
  pager.hidden=!rows.length;previous.disabled=page===1;next.disabled=page===pages;
  pageText.textContent=`第 ${page} / ${pages} 页 · ${rows.length} 条`;
  if(!rows.length){list.textContent=term||category.value?'没有匹配的诊断':'暂无诊断记录';return;}
  for(const x of rows.slice((page-1)*pageSize,page*pageSize)){
   const card=document.createElement('article');card.className='diagnostic-card';
   const title=document.createElement('h3');title.textContent=x.summary;
   const meta=document.createElement('p');meta.className='diagnostic-meta';meta.textContent=[new Date(x.time).toLocaleString(),x.source].filter(Boolean).join(' · ');
   const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='查看详细日志';pre.textContent=[x.code,x.id,x.detail||'无详细记录'].filter(Boolean).join('\n');details.append(summary,pre);card.append(title,meta,details);list.append(card);
  }
 }
 function load(){
  if(loading)return loading;
  list.textContent='正在读取诊断…';pager.hidden=true;
  loading=(async()=>{try{const result=await Hub.api('/diagnostics');if(!Array.isArray(result.items))throw new Error('诊断数据格式错误');items=result.items;loaded=true;const selected=category.value;category.replaceChildren(new Option('全部错误类型',''));for(const code of [...new Set(items.map(x=>x.code))])category.add(new Option(code,code));category.value=selected;page=1;paint();}
   catch(e){loaded=false;list.textContent='诊断读取失败：'+e.message;}
   finally{loading=null;}})();return loading;
 }
 function id(text){return String(text||'').match(/\b\d{8}T\d{6}Z-[a-f0-9]{8}\b/)?.[0];}
 async function open(value=''){
  query.value=value;category.value='';page=1;location.hash='diagnostics';globalThis.ManageLayout?.showView('diagnostics');await load();panel.scrollIntoView({block:'start'});
 }
 query.oninput=category.onchange=()=>{page=1;paint();};
 previous.onclick=()=>{page--;paint();};next.onclick=()=>{page++;paint();};
 globalThis.DiagnosticsView={open,load,id,ensureLoaded:()=>loaded?Promise.resolve():load()};
 const requested=new URLSearchParams(location.search).get('diagnostic');
 if(requested)document.addEventListener('DOMContentLoaded',()=>open(requested));
})();
