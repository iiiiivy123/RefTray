(() => {
 const q=s=>document.querySelector(s),panel=q('#resolver-diagnostics').closest('details');
 const old=q('#resolver-diagnostic-text');old.hidden=true;
 const toolbar=document.createElement('div');toolbar.className='diagnostic-toolbar';
 const query=document.createElement('input');query.placeholder='搜索诊断编号、站点或错误';query.setAttribute('aria-label','搜索诊断');
 const category=document.createElement('select');category.setAttribute('aria-label','诊断分类');
 const list=document.createElement('div');list.id='diagnostics-list';list.setAttribute('aria-live','polite');
 toolbar.append(query,category);old.before(toolbar,list);
 let items=[];
 function paint(){
  list.replaceChildren();const term=query.value.trim().toLowerCase();
  const rows=items.filter(x=>(!category.value||x.code===category.value)&&(!term||[x.id,x.source,x.summary,x.detail,x.stage].join(' ').toLowerCase().includes(term)));
  if(!rows.length){list.textContent=term?'没有匹配的诊断':'暂无诊断记录';return;}
  for(const x of rows){
   const card=document.createElement('article');card.className='diagnostic-card';
   const title=document.createElement('h3');title.textContent=x.summary;
   const meta=document.createElement('p');meta.className='diagnostic-meta';meta.textContent=[new Date(x.time).toLocaleString(),x.source].filter(Boolean).join(' · ');
   const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='技术详情';pre.textContent=[x.code,x.id,x.detail||'无详细记录'].filter(Boolean).join('\n');details.append(summary,pre);card.append(title,meta,details);list.append(card);
  }
 }
 async function load(){
  panel.open=true;list.textContent='正在读取诊断…';
  try{items=(await Hub.api('/diagnostics')).items||[];const selected=category.value;category.replaceChildren(new Option('全部错误类型',''));for(const code of [...new Set(items.map(x=>x.code))])category.add(new Option(code,code));category.value=selected;paint();}
  catch(e){list.textContent='诊断读取失败：'+e.message;}
 }
 function id(text){return String(text||'').match(/\b\d{8}T\d{6}Z-[a-f0-9]{8}\b/)?.[0];}
 async function open(value=''){
  location.hash='tools';globalThis.ManageLayout?.showView('tools');query.value=value;category.value='';await load();panel.scrollIntoView({block:'start'});
 }
 query.oninput=paint;category.onchange=paint;
 globalThis.DiagnosticsView={open,load,id};
 const requested=new URLSearchParams(location.search).get('diagnostic');
 if(requested)document.addEventListener('DOMContentLoaded',()=>open(requested));
})();
