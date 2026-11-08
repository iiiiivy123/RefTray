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
  globalThis.ManageLayout?.counts({history:result.total??items.length});
  q('#history-list').replaceChildren();
  if(!items.length){
    if(query.trim()||category||platform)line(q('#history-list'),'没有符合筛选条件的记录。请清除筛选后再查。');
    else {
      const h=await Hub.api('/health');
      if(request!==historyRequest)return;
      line(q('#history-list'),'当前后台的数据目录：{root}',{root:h.root});
      line(q('#history-list'),'这个目录中有 0 条采集记录。如果升级前有记录，请先核对原后台的数据目录。');
    }
  }
  for(const item of items){
    const row=document.createElement('article');row.className='record-row';
    const icon=document.createElement('span');icon.className='record-icon';icon.setAttribute('aria-hidden','true');if(globalThis.ManageLayout)icon.append(ManageLayout.icon(item.category==='video'?'video':item.category==='text'?'records':'image'));else icon.textContent='▧';
    const copy=document.createElement('div'),title=document.createElement('h2');title.className='record-title';title.dataset.userContent='';title.textContent=item.title;
    copy.append(title);line(copy,'{platform} · {author} · {mode} · {time}',{platform:item.platform||'',author:item.author,mode:{ui:({text:'图文',images:'图片',video:'视频',batch:'批量'})[item.category||item.mode]||'图片'},time:new Date(item.updated*1000).toLocaleString()}).className='record-meta';
    line(copy,'{state} · {directory}',{state:{ui:item.available?'文件存在':'文件已移走、删除或大小改变'},directory:item.directory}).className='record-path';
    const actions=document.createElement('div');actions.className='record-actions';
    actions.append(button('打开文件夹',()=>Hub.api('/history/'+item.id+'/open',{})),button('打开原帖',()=>chrome.tabs.create({url:item.url})),button('重新采集',async()=>{
      await chrome.storage.local.set({collectorNextAction:{url:item.url,duplicate_policy:'refresh'}});await chrome.tabs.create({url:item.url});notice('已打开原帖。打开采集面板后确认本次位置并开始；不会删除旧文件。');
    }));row.append(icon,copy,actions);q('#history-list').append(row);
  }
  pager(q('#history-list'),historyPage,result.pages||1,result.total??items.length,async page=>{historyPage=page;await history();});
}
async function taskDetail(item){
  const stored=await chrome.storage.local.get(['collectorCheckpoint','collectorTaskJournal']);
  const local=[stored.collectorCheckpoint,...Object.values(stored.collectorTaskJournal||{})].filter(Boolean).find(entry=>(entry.task_id||entry.id)===item.id);
  if(item.localOnly)return local||item;
  let remote;
  try{remote=(await Hub.api('/tasks/'+encodeURIComponent(item.id))).item;}
  catch(error){if(!local)throw error;notice('后台详情读取失败，使用本机较新检查点：'+error.message);}
  return TaskStore.latest(local,remote);
}
function taskVisible(item,view,active,ignored){
 const running=Boolean(active)&&item.id===active,fail=Number(item.failed)||(['failed','partial'].includes(item.status)||item.error?1:0),saved=Number(item.saved)||0;
 const interrupted=['stopped','interrupted','paused'].includes(item.status);
 if(item.resolvedBy||item.completed&&!fail&&!running&&!interrupted)return false;
 if(view==='ignored')return !running&&Boolean(ignored[item.id]);
 if(!running&&ignored[item.id])return false;
 if(view==='running')return running;
 if(view==='unfinished')return !running&&(saved>0&&fail>0||interrupted||!item.completed&&item.status!=='failed');
 if(view==='failed')return !running&&!saved&&fail>0;
 return true;
}
async function tasks(){
  const request=++taskRequest;
  try{await TaskStore.reconcile();}catch(error){notice('检查点尚未同步：'+error.message);}
  const stored=await chrome.storage.local.get(['liblibActiveJob','liblibProgress','collectorCheckpoint','collectorTaskJournal','collectorDismissedTasks']);
  let result,listError='';
  const active=stored.liblibActiveJob?(stored.collectorCheckpoint?.id||stored.liblibProgress?.context?.id||''):'';
  const selectedView=q('#task-state').value||'all';
  try{result=await Hub.api('/tasks?page='+taskPage+'&page_size='+pageSize+'&view='+selectedView+'&active='+encodeURIComponent(active)+'&ignored='+encodeURIComponent(JSON.stringify(Object.keys(stored.collectorDismissedTasks||{}))));taskPage=result.page||1;}
  catch(error){
    listError='后台任务列表读取失败；以下仅为本机保留的任务：'+error.message;
    const local=new Map();
    for(const item of [stored.collectorCheckpoint,...Object.values(stored.collectorTaskJournal||{})].filter(Boolean)){
      const id=item.task_id||item.id;if(id)local.set(id,TaskStore.latest(local.get(id),item));
    }
    const entries=[...local.values()].sort((a,b)=>(b.updated||0)-(a.updated||0));
    const eligible=entries.filter(item=>taskVisible(item,selectedView,active,stored.collectorDismissedTasks||{}));
    taskPage=Math.min(taskPage,Math.max(1,Math.ceil(eligible.length/pageSize)));
    result={items:eligible.slice((taskPage-1)*pageSize,taskPage*pageSize),total:eligible.length};
  }
  // A persisted journal may retain its old localOnly flag; a server result has remote detail.
  const combined=new Map((result.items||[]).map(item=>[item.id,{...item,localOnly:Boolean(listError)}]));
  for(const entry of Object.values(stored.collectorTaskJournal||{})){
    const id=entry.batchId||entry.id,server=combined.get(id);
    if(server){
      if(entry.batchId&&entry.batchId!==entry.id){server.journalId=entry.id;continue;}
      const latest=TaskStore.latest(entry,server);
      combined.set(id,{...latest,id,journalId:entry.id,localOnly:Boolean(listError)});
    }
  }
  const checkpoint=stored.collectorCheckpoint;
  if(checkpoint?.id&&combined.has(checkpoint.id))combined.set(checkpoint.id,{...TaskStore.latest(checkpoint,combined.get(checkpoint.id)),localOnly:Boolean(listError)});
  const items=[...combined.values()];
  if(request!==taskRequest)return;q('#task-list').replaceChildren();
  if(listError)line(q('#task-list'),listError);
  const rows=[];
  for(const item of items){
    const row=document.createElement('article');row.className='entry task-row';
    const failureCount=Number(item.failed)||(['failed','partial'].includes(item.status)||item.error?1:0);
    if(item.resolvedBy)continue;
    const currentId=stored.liblibProgress?.context?.id;
    const running=stored.liblibActiveJob&&Boolean(item.id)&&(currentId===item.id||currentId===item.journalId||!currentId&&stored.collectorCheckpoint?.id===item.id);
    if(item.completed&&!failureCount&&!running)continue;
    const filter=q('#task-state').value;
    const ignored=Boolean(stored.collectorDismissedTasks?.[item.id]);
    if(!running&&(filter==='ignored'?!ignored:ignored))continue;
    if(running&&filter==='ignored')continue;
    if(!taskVisible({...item,failed:failureCount},filter||'all',running?item.id:'',stored.collectorDismissedTasks||{}))continue;
    const heading=document.createElement('div');heading.className='task-heading';
    const title=document.createElement('h3');title.className='task-name';title.dataset.userContent='';title.textContent=item.name||item.title||item.source||'采集任务';
    const state=document.createElement('span');state.className='task-status';state.dataset.state=running?'running':failureCount?'failed':'paused';state.textContent=running?'进行中':ignored?'已忽略':failureCount?(item.saved?'部分完成':'失败'):'已暂停';heading.append(title,state);row.append(heading);
    line(row,'{count} 篇 · 失败 {failures}',{count:item.total??item.done??'—',failures:failureCount}).className='task-count';
    if(item.directory){const p=document.createElement('p');p.className='task-path';p.dataset.userContent='';p.textContent=item.directory;row.append(p);}
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='逐项结果';details.append(summary);
    let loaded=false,loading=false;
    details.addEventListener('toggle',async()=>{
      if(!details.open||loaded||loading)return;loading=true;
      const content=document.createElement('div');content.textContent='正在读取逐项结果…';details.append(content);
      try{
        const full=await taskDetail(item);content.replaceChildren();
        const records=Object.values(full.records||{});
        if(!records.length)line(content,'暂无逐项结果');
        for(const r of records){const p=document.createElement('p');UI.message(p,'{state} · {url} · {reason}',{state:{ui:({saved:'成功',completed:'成功',failed:'失败',partial:'部分完成',skipped:'已跳过',planned:'待保存',stopped:'已停止'})[r.status]||r.status},url:(r.url||'').replace(/([?&](?:token|xsec_token|signature)=)[^&#]*/gi,'$1[hidden]'),reason:r.reason||''});content.append(p);const diagnostic=DiagnosticsView.id(r.reason);if(diagnostic)content.append(button('查看本次诊断',()=>DiagnosticsView.open(diagnostic)));}
        loaded=true;
      }catch(error){content.textContent='详情读取失败，重新展开可重试：'+error.message;}
      finally{loading=false;if(!loaded)details.addEventListener('toggle',()=>content.remove(),{once:true});}
    });
    row.append(details);
    if(item.localOnly){row.append(button('打开原页重试',()=>chrome.tabs.create({url:item.source})));}
    if(!item.localOnly&&!running&&!item.completed)row.append(button('回原页续采',()=>restore(item,false)));
    if(!item.localOnly&&!item.error&&!running&&failureCount)row.append(button('只重试失败项',()=>restore(item,true)));
    if(!running&&item.id){
      const choose=document.createElement('input');choose.type='checkbox';choose.dataset.taskId=item.id;choose.setAttribute('aria-label','选择任务：'+title.textContent);heading.prepend(choose);
      row.append(button(ignored?'恢复到待处理':'不再处理（保留文件）',()=>dismissTasks([item.id],!ignored)));
    }
    const actions=document.createElement('div');actions.className='task-buttons';for(const b of row.querySelectorAll(':scope > button'))actions.append(b);if(actions.childElementCount)row.append(actions);
    rows.push({row,running,updated:item.updated||0});
  }
  rows.sort((a,b)=>Number(b.running)-Number(a.running)||b.updated-a.updated);
  const pages=Math.max(1,Math.ceil(result.total/pageSize));
  for(const entry of rows)q('#task-list').append(entry.row);
  globalThis.ManageLayout?.counts({tasks:rows.length});
  if(!rows.length)line(q('#task-list'),'暂无符合筛选条件的任务');
  pager(q('#task-list'),taskPage,pages,result.total,async page=>{taskPage=page;await tasks();});
  selectionChanged();
}
async function restore(item,retry){
  const state=await chrome.storage.local.get(['liblibActiveJob']);if(state.liblibActiveJob)throw new Error('请先停止当前任务');
  item=await taskDetail(item);
  if(retry&&!Object.values(item.records||{}).some(r=>['failed','partial'].includes(r.status)))throw new Error('没有失败项');
  const checkpoint=structuredClone(item);checkpoint.completed=false;delete checkpoint.error;
  if(retry)checkpoint.image_used=0;
  if(retry){checkpoint.retryKeys=Object.entries(checkpoint.records).filter(([,r])=>['failed','partial'].includes(r.status)).map(([k])=>k);for(const key of checkpoint.retryKeys)delete checkpoint.records[key];}
  await TaskStore.save(checkpoint);await chrome.storage.local.set({collectorResumeRequested:true});await chrome.tabs.create({url:checkpoint.source});notice('已恢复任务。打开原页采集面板，确认继续上次任务后开始。');
}
async function approval(){const {collectorApproval:a}=await chrome.storage.local.get(['collectorApproval']);q('#approval').hidden=!a||a.state!=='pending';globalThis.ManageLayout?.approval(Boolean(a&&a.state==='pending'));if(a)UI.feedback(q('#approval-text'),a.message,'等待下载确认');}
q('#approve').onclick=guard(async()=>{await chrome.runtime.sendMessage({type:'APPROVE_DOWNLOAD',approve:true});await approval();});
q('#reject').onclick=guard(async()=>{await chrome.runtime.sendMessage({type:'APPROVE_DOWNLOAD',approve:false});await approval();});
let savedDefaults=null;
const defaultsState=document.createElement('p');defaultsState.id='defaults-state';defaultsState.setAttribute('role','status');if(q('#defaults-state-slot'))q('#defaults-state-slot').append(defaultsState);else q('#defaults-form').before(defaultsState);
const undoDefaults=button('撤销更改',()=>{if(savedDefaults)paintDefaults(savedDefaults);});undoDefaults.type='button';undoDefaults.className='ghost';undoDefaults.disabled=true;(q('#defaults-actions')||q('#defaults-form')).prepend(undoDefaults);
function paintDefaults(values){
  savedDefaults=structuredClone(values);
  for(const [key,value] of Object.entries(values)){const input=q('#defaults-form').elements.namedItem(key);if(input)input.type==='checkbox'?input.checked=value:input.value=value;}
  for(const fieldset of q('#defaults-form').querySelectorAll('fieldset'))fieldset.disabled=false;
  globalThis.refreshSelects?.();document.dispatchEvent(new Event('defaults-painted'));
  q('#defaults-form').querySelector('[type=submit]').disabled=true;undoDefaults.disabled=true;
  UI.message(defaultsState,'默认设置已保存 · 仅影响之后的新任务');
}
function defaultsChanged(){const changed=Boolean(savedDefaults)&&[...q('#defaults-form').elements].some(input=>input.name&&(input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value)!==savedDefaults[input.name]);undoDefaults.disabled=!changed;q('#defaults-form').querySelector('[type=submit]').disabled=!changed;UI.message(defaultsState,changed?'有尚未保存的更改':'默认设置已保存 · 仅影响之后的新任务');}
q('#defaults-form').addEventListener('input',defaultsChanged);q('#defaults-form').addEventListener('change',defaultsChanged);
q('#defaults-form').onsubmit=guard(async e=>{
  e.preventDefault();const data={};for(const input of e.target.elements){if(!input.name)continue;data[input.name]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;}
  const submit=e.target.querySelector('[type=submit]');submit.disabled=true;
  try{const current=await Hub.defaults();const saved=await Hub.api('/settings/defaults',{...current,...data,min_free_mb:0,include_images:true});await Hub.invalidateOptions();paintDefaults(saved);notice('默认设置已保存；正在运行和恢复的任务保留原设置。');}finally{submit.disabled=undoDefaults.disabled;}
});
q('#query').addEventListener('input',()=>{historyRequest++;});
q('#history-category').onchange=q('#history-platform').onchange=guard(async()=>{historyPage=1;await history();});
q('#task-state').onchange=guard(async()=>{taskPage=1;await tasks();});
q('#search-form').onsubmit=guard(async e=>{e.preventDefault();historyPage=1;await history();});
q('#resolver-diagnostics').onclick=()=>DiagnosticsView.load();
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
q('#defaults-form').querySelector('[type=submit]').disabled=true;
for(const fieldset of q('#defaults-form').querySelectorAll('fieldset'))fieldset.disabled=true;
// Independent blocks settle independently: history errors must not hide defaults or approval.
const initializeBlock=async(action,target)=>{try{await action();}catch(error){UI.feedback(target,error.message);}};
Promise.allSettled([
  Hub.api('/health').then(h=>globalThis.ManageLayout?.connection(h)).catch(e=>globalThis.ManageLayout?.connection(null,e)),
  initializeBlock(async()=>paintDefaults(await Hub.defaults()),defaultsState),
  initializeBlock(history,q('#history-list')),
  initializeBlock(tasks,q('#task-list')),
  initializeBlock(approval,q('#approval-text')),
  initializeBlock(async()=>{q('#diagnostic-text').textContent='';},q('#diagnostic-text'))
]);
