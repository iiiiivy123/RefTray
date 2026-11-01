const q=s=>document.querySelector(s);
if(q('#live-test'))q('#live-test').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('live-test.html')});
const notice=(message,params={})=>UI.message(q('#notice'),message,params);
const guard=fn=>async(...args)=>{try{await fn(...args);}catch(e){UI.feedback(q('#notice'),e.message);q('#diagnostic-text').textContent=e.message;}};
function button(label,action){const b=document.createElement('button');UI.message(b,label);b.addEventListener('click',guard(action));return b;}
function line(parent,text,params={}){const p=document.createElement('p');UI.message(p,text,params);parent.append(p);return p;}
let historyRequest=0,taskRequest=0;
q('#history-platform').add(new Option('YouTube','YouTube'));
let historyPage=1,taskPage=1;const pageSize=20;
function pager(parent,page,pages,total,change){
  const nav=document.createElement('div');nav.className='inline-actions';
  const previous=button('上一页',()=>change(page-1)),next=button('下一页',()=>change(page+1));
  previous.disabled=page<=1;next.disabled=page>=pages;
  const info=document.createElement('span');UI.message(info,'第 {page} / {pages} 页 · 共 {total} 条',{page,pages,total});
  nav.append(previous,info,next);parent.append(nav);
}
q('#history-content > p').textContent='每页20条，可翻页查看全部匹配记录。保留实际保存位置；文件移动后不会自动关联。';
q('#task-state').add(new Option('不再处理','ignored'));
async function dismissTasks(ids,ignored){
  const {collectorDismissedTasks:values={}}=await chrome.storage.local.get(['collectorDismissedTasks']);
  for(const id of ids)if(ignored)values[id]=Date.now();else delete values[id];
  await chrome.storage.local.set({collectorDismissedTasks:values});await tasks();
}
const dismissSelected=button('不再处理所选（保留文件）',()=>dismissTasks([...q('#task-list').querySelectorAll('input[data-task-id]:checked')].map(input=>input.dataset.taskId),true));
dismissSelected.disabled=true;
q('#refresh-tasks').after(dismissSelected);
const selectAll=document.createElement('label');selectAll.className='task-selection';
const allBox=document.createElement('input');allBox.type='checkbox';selectAll.append(allBox,document.createTextNode('选择本页任务'));dismissSelected.after(selectAll);
const taskToolbar=document.createElement('div');taskToolbar.className='task-toolbar';
const taskSelect=q('#task-state').closest('.rounded-select')||q('#task-state');taskSelect.before(taskToolbar);taskToolbar.append(taskSelect,q('#refresh-tasks'),dismissSelected);
const selectionChanged=()=>{const boxes=[...q('#task-list').querySelectorAll('input[data-task-id]')];dismissSelected.disabled=!boxes.some(b=>b.checked);allBox.checked=boxes.length>0&&boxes.every(b=>b.checked);allBox.disabled=!boxes.length;};
allBox.onchange=()=>{for(const box of q('#task-list').querySelectorAll('input[data-task-id]'))box.checked=allBox.checked;selectionChanged();};
q('#task-list').addEventListener('change',selectionChanged);
function recordView(pending){
 q('#history-content').hidden=pending;q('#tasks').hidden=!pending;
 q('#records-tab').setAttribute('aria-selected',String(!pending));q('#pending-tab').setAttribute('aria-selected',String(pending));
}
q('#records-tab').onclick=guard(async()=>{recordView(false);await history();});
q('#pending-tab').onclick=guard(async()=>{recordView(true);await tasks();});
async function history(){
  const request=++historyRequest,query=q('#query').value;
  const category=q('#history-category').value,platform=q('#history-platform').value;
  const result=await Hub.api('/history?q='+encodeURIComponent(query)+'&category='+encodeURIComponent(category)+'&platform='+encodeURIComponent(platform)+'&page='+historyPage+'&page_size='+pageSize);
  const {items}=result;historyPage=result.page||1;
  if(request!==historyRequest||q('#query').value!==query)return;
  q('#history-list').replaceChildren();
  if(!items.length)line(q('#history-list'),'没有匹配的采集记录；旧文件可从下方导入。');
  for(const item of items){
    const row=document.createElement('article');row.className='entry';
    line(row,'{title} · {author} · {mode} · {time}',{title:item.title,author:item.author,mode:{ui:({text:'图文',images:'图片',video:'视频',batch:'批量'})[item.category||item.mode]||'图片'},time:new Date(item.updated*1000).toLocaleString()});
    line(row,'{state} · {directory}',{state:{ui:item.available?'文件存在':'文件已移走、删除或大小改变'},directory:item.directory});
    row.append(button('打开文件夹',()=>Hub.api('/history/'+item.id+'/open',{})),button('打开原帖',()=>chrome.tabs.create({url:item.url})),button('重新采集',async()=>{
      await chrome.storage.local.set({collectorNextAction:{url:item.url,duplicate_policy:'refresh'}});await chrome.tabs.create({url:item.url});notice('已打开原帖。打开采集面板后确认本次位置并开始；不会删除旧文件。');
    }));q('#history-list').append(row);
  }
  pager(q('#history-list'),historyPage,result.pages||1,result.total??items.length,async page=>{historyPage=page;await history();});
}
async function tasks(){
  const request=++taskRequest,result=await Hub.api('/tasks');
  const stored=await chrome.storage.local.get(['liblibActiveJob','liblibProgress','collectorCheckpoint','collectorTaskJournal','collectorDismissedTasks']);
  const combined=new Map((result.items||[]).map(item=>[item.id,{...item}]));
  for(const entry of Object.values(stored.collectorTaskJournal||{})){
    const id=entry.batchId||entry.id,server=combined.get(id);
    if(server){
      server.updated=Math.max(server.updated||0,entry.updated||0);server.journalId=entry.id;
      server.directory ||= entry.directory;server.name ||= entry.name;
      server.resolvedBy ||= entry.resolvedBy;
      if(['failed','partial'].includes(entry.status)&&!Object.values(server.records||{}).some(r=>['failed','partial'].includes(r.status)))server.error=entry.records?.result?.reason||entry.status;
    }else combined.set(id,{...entry});
  }
  const items=[...combined.values()];
  if(request!==taskRequest)return;q('#task-list').replaceChildren();
  const rows=[];
  for(const item of items){
    const row=document.createElement('article');row.className='entry';
    const records=Object.values(item.records||{}),failures=records.filter(r=>['failed','partial'].includes(r.status));
    if(['failed','partial'].includes(item.status)&&!failures.length&&!item.error){const failure={status:item.status,url:item.source,reason:'任务未完成，请打开原页重试'};failures.push(failure);records.push(failure);}
    if(item.resolvedBy)continue;
    if(item.error){const failure={status:'failed',url:item.source,reason:item.error};failures.push(failure);records.push(failure);}
    const currentId=stored.liblibProgress?.context?.id;
    const running=stored.liblibActiveJob&&Boolean(item.id)&&(currentId===item.id||currentId===item.journalId||!currentId&&stored.collectorCheckpoint?.id===item.id);
    if(item.completed&&!failures.length&&!running)continue;
    const filter=q('#task-state').value;
    const ignored=Boolean(stored.collectorDismissedTasks?.[item.id]);
    if(!running&&(filter==='ignored'?!ignored:ignored))continue;
    if(running&&filter==='ignored')continue;
    if(filter==='running'&&!running||filter==='unfinished'&&(running||item.completed)||filter==='completed'&&!item.completed||filter==='failed'&&!failures.length)continue;
    line(row,'{name} · {state} · {count} 篇 · 失败/部分失败 {failures}',{name:item.name||item.source||'',state:{ui:running?'正在运行':ignored?'已忽略':failures.length?(records.some(r=>r.status==='saved')?'部分完成':'失败'):'已暂停'},count:records.length,failures:failures.length});
    if(item.directory){const p=document.createElement('p');p.dataset.userContent='';p.textContent=item.directory;row.append(p);}else line(row,'尚未确认保存位置');
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='逐项结果';details.append(summary);
    for(const r of records){const p=document.createElement('p');UI.message(p,'{state} · {url} · {reason}',{state:{ui:({saved:'成功',completed:'成功',failed:'失败',partial:'部分完成',skipped:'已跳过',planned:'待保存',stopped:'已停止'})[r.status]||r.status},url:(r.url||'').replace(/([?&](?:token|xsec_token|signature)=)[^&#]*/gi,'$1[hidden]'),reason:r.reason||''});details.append(p);}
    row.append(details);
    if(item.localOnly){row.append(button('打开原页重试',()=>chrome.tabs.create({url:item.source})));}
    if(!item.localOnly&&!running&&!item.completed)row.append(button('回原页续采',()=>restore(item,false)));
    if(!item.localOnly&&!item.error&&!running&&failures.length)row.append(button('只重试失败项',()=>restore(item,true)));
    if(!running&&item.id){
      const choose=document.createElement('input');choose.type='checkbox';choose.dataset.taskId=item.id;choose.setAttribute('aria-label','选择此任务');const label=document.createElement('label');label.className='task-selection';label.append(choose,document.createTextNode('选择此任务'));row.prepend(label);
      row.append(button(ignored?'恢复到待处理':'不再处理（保留文件）',()=>dismissTasks([item.id],!ignored)));
    }
    rows.push({row,running,updated:item.updated||0});
  }
  rows.sort((a,b)=>Number(b.running)-Number(a.running)||b.updated-a.updated);
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));taskPage=Math.min(taskPage,pages);
  for(const entry of rows.slice((taskPage-1)*pageSize,taskPage*pageSize))q('#task-list').append(entry.row);
  if(!rows.length)line(q('#task-list'),'暂无匹配的任务记录');
  pager(q('#task-list'),taskPage,pages,rows.length,async page=>{taskPage=page;await tasks();});
  selectionChanged();
}
async function restore(item,retry){
  const state=await chrome.storage.local.get(['liblibActiveJob']);if(state.liblibActiveJob)throw new Error('请先停止当前任务');
  if(retry&&!Object.values(item.records||{}).some(r=>['failed','partial'].includes(r.status)))throw new Error('没有失败项');
  const checkpoint=structuredClone(item);checkpoint.completed=false;delete checkpoint.error;
  if(retry)checkpoint.image_used=0;
  if(retry){checkpoint.retryKeys=Object.entries(checkpoint.records).filter(([,r])=>['failed','partial'].includes(r.status)).map(([k])=>k);for(const key of checkpoint.retryKeys)delete checkpoint.records[key];}
  await chrome.storage.local.set({collectorCheckpoint:checkpoint,collectorResumeRequested:true});await chrome.tabs.create({url:checkpoint.source});notice('已恢复任务。打开原页采集面板，确认继续上次任务后开始。');
}
async function approval(){const {collectorApproval:a}=await chrome.storage.local.get(['collectorApproval']);q('#approval').hidden=!a||a.state!=='pending';if(a)UI.feedback(q('#approval-text'),a.message,'等待下载确认');}
q('#approve').onclick=guard(async()=>{await chrome.runtime.sendMessage({type:'APPROVE_DOWNLOAD',approve:true});await approval();});
q('#reject').onclick=guard(async()=>{await chrome.runtime.sendMessage({type:'APPROVE_DOWNLOAD',approve:false});await approval();});
q('#defaults-form').onsubmit=guard(async e=>{
  e.preventDefault();const data={};for(const input of e.target.elements){if(!input.name)continue;data[input.name]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;}
  const submit=e.target.querySelector('[type=submit]');submit.disabled=true;
  try{const current=await Hub.defaults();await Hub.api('/settings/defaults',{...current,...data,min_free_mb:0,include_images:true});await chrome.storage.local.remove(['collectorLastOptions','collectorModePreferences']);notice('默认设置已保存；正在运行的任务不变。');}finally{submit.disabled=false;}
});
q('#query').addEventListener('input',()=>{historyRequest++;});
q('#history-category').onchange=q('#history-platform').onchange=guard(async()=>{historyPage=1;await history();});
q('#task-state').onchange=guard(async()=>{taskPage=1;await tasks();});
q('#search-form').onsubmit=guard(async e=>{e.preventDefault();historyPage=1;await history();});
q('#resolver-diagnostics').onclick=guard(async()=>{const result=await Hub.api('/diagnostics');q('#resolver-diagnostic-text').textContent=result.items.length?result.items.map(x=>`${x.time} · ${x.stage} · ${x.code} · ${x.id}\n${x.summary}\n退出码 ${x.exit_code??'未知'} · 耗时 ${x.elapsed_seconds??'未知'} 秒\n${x.detail}`).join('\n\n'):'暂无媒体解析诊断';});
q('#refresh-tasks').onclick=guard(tasks);q('#local-video').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('video.html')});
let previewToken,previewDirectory,previewRequest=0,importing=false;
function invalidatePreview(){previewRequest++;previewToken=undefined;previewDirectory=undefined;q('#import-confirm').disabled=true;}
q('#import-directory').addEventListener('input',()=>{invalidatePreview();UI.message(q('#import-result'),'目录已改变，请重新预览。');});
q('#import-preview').onclick=guard(async()=>{
  if(importing)return;invalidatePreview();const request=previewRequest,directory=q('#import-directory').value.trim();
  q('#import-preview').disabled=true;
  UI.message(q('#import-result'),'正在预览…');
  try{
    const result=await Hub.api('/history/import/preview',{directory});
    if(request!==previewRequest||directory!==q('#import-directory').value.trim())return;
    previewToken=result.token;previewDirectory=directory;
    UI.message(q('#import-result'),'预览目录：{directory}\n可导入 {count} 条；异常 {errors} 个{limited}',{directory,count:result.count,errors:result.errors,limited:{ui:result.limited?'；已达到扫描上限':''}});
    q('#import-confirm').disabled=!result.count;
  }catch(e){if(request===previewRequest){invalidatePreview();UI.feedback(q('#import-result'),e.message);throw e;}}
  finally{q('#import-preview').disabled=importing;}
});
q('#import-confirm').onclick=guard(async()=>{
  if(importing)return;
  if(!previewToken||previewDirectory!==q('#import-directory').value.trim())throw new Error('请先预览当前目录。');
  const token=previewToken;invalidatePreview();importing=true;
  q('#import-directory').disabled=q('#import-preview').disabled=true;UI.message(q('#import-result'),'正在导入…');
  try{const r=await Hub.api('/history/import/confirm',{token});UI.message(q('#import-result'),'已导入 {count} 条',{count:r.count});await history();}
  catch(e){UI.feedback(q('#import-result'),e.message);throw e;}
  finally{importing=false;q('#import-directory').disabled=q('#import-preview').disabled=false;}
});
let refreshTimer;
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area&&area!=='local')return;
  approval().catch(e=>notice(e.message));
  if(['collectorTaskJournal','collectorCheckpoint','liblibActiveJob','collectorDismissedTasks'].some(key=>changes?.[key])){
    clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>tasks().catch(e=>notice(e.message)),150);
  }
});
guard(async()=>{const d=await Hub.defaults();for(const [k,v]of Object.entries(d)){const input=q('#defaults-form').elements.namedItem(k);if(input)input.type==='checkbox'?input.checked=v:input.value=v;}globalThis.refreshSelects?.();await history();await tasks();await approval();const {liblibProgress:p}=await chrome.storage.local.get(['liblibProgress']);q('#diagnostic-text').textContent=[p?.message,p?.details].filter(Boolean).join('\n');})();
