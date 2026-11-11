(() => {
 const get=id=>document.getElementById(id);
 let ready=false,layoutReady=false,busy=false,picking=false,saving=false,configured=true,savedLayout='organized';
 const error=e=>{UI.feedback(get('path-message'),e.message);get('diagnostic-text').textContent=e.message;};
 function sync(){const pending=busy||picking||saving;get('directory-layout').disabled=!layoutReady||pending;get('save-layout').disabled=!layoutReady||pending;get('save-layout').hidden=!configured;get('change-path').disabled=!ready||pending;get('save-path-button').disabled=!ready||pending;get('cancel-path').disabled=saving;get('open-path').disabled=!ready||!configured;get('use-recommended').disabled=!ready||pending;undoLayout.disabled=!layoutReady||pending||get('directory-layout').value===savedLayout;globalThis.refreshSelects?.();}
 function preview(){const root=get('path-input').value.replace(/[\\/]+$/,'');const flat=get('directory-layout').value==='organized_flat';get('layout-preview').textContent=root+'\\图文\\'+(flat?'小红书-图文-笔记标题':'小红书\\图文-笔记标题');}
 function show(h){configured=h.library_configured!==false;get('save-path').textContent=h.inbox;get('path-input').value=h.inbox;get('use-recommended').hidden=configured;UI.message(get('library-title'),configured?'当前素材库':'首次使用：选择素材库位置');const normalize=p=>String(p||'').replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();get('library-state-note').hidden=!h.root||!(normalize(h.root)===normalize(h.inbox)||normalize(h.root).startsWith(normalize(h.inbox)+'/'));preview();ready=true;sync();}
 async function save(){
  const state=await chrome.storage.local.get(['liblibActiveJob']);if(state.liblibActiveJob)throw new Error('请先停止采集，再修改保存目录。');
  saving=true;sync();UI.message(get('path-message'),'正在保存位置并核对已有文件…');
  try{
   const result=await Hub.api('/settings/directory',{directory:get('path-input').value,...(layoutReady?{layout:get('directory-layout').value}:{})});
   show(result);get('path-editor').hidden=true;savedLayout=get('directory-layout').value;await Hub.invalidateOptions();
   UI.message(get('path-message'),result.library_relink_error||(result.library_relink_pending?'位置已保存，已关联 {count} 条，另有 {pending} 条待核对。可在采集记录中导入搬后的目录。':result.library_relinked?'位置已保存，已关联 {count} 条搬库记录。':'素材库位置已保存。'),{count:result.library_relinked,pending:result.library_relink_pending});
  }finally{saving=false;sync();}
 }
 get('change-path').onclick=async()=>{
  picking=true;sync();UI.message(get('path-message'),'正在打开系统目录窗口…');
  try{
   const r=await chrome.runtime.sendMessage({type:'CHOOSE_TASK_FOLDER'});if(!r?.ok)throw new Error(r?.error||'无法选择文件夹');
   if(!r.cancelled){get('path-input').value=r.directory;preview();get('path-editor').hidden=false;UI.message(get('path-message'),'请确认：只改变以后保存的位置，不搬迁旧文件。');}
   else UI.message(get('path-message'),'已取消选择，原目录保留。');
  }catch(e){get('path-editor').hidden=false;error(e);}finally{picking=false;sync();}
 };
 get('cancel-path').onclick=()=>{get('path-input').value=get('save-path').textContent;get('path-editor').hidden=true;preview();};
 get('save-path-button').onclick=()=>save().catch(error);
 get('use-recommended').onclick=()=>save().catch(error);
 get('open-path').onclick=()=>Hub.api('/settings/open',{}).catch(error);
 chrome.storage.local.get(['liblibActiveJob']).then(s=>{busy=!!s.liblibActiveJob;sync();});
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.liblibActiveJob){busy=!!changes.liblibActiveJob.newValue;sync();}});
 get('directory-layout').onchange=preview;get('path-input').oninput=preview;
 const undoLayout=document.createElement('button');undoLayout.type='button';undoLayout.textContent='还原未保存选择';undoLayout.disabled=true;get('save-layout').after(undoLayout);
 undoLayout.onclick=()=>{get('directory-layout').value=savedLayout;preview();sync();UI.message(get('path-message'),'已还原当前选择。');};
 get('directory-layout').onchange=()=>{preview();sync();UI.message(get('path-message'),'分类方式尚未保存。');};
 get('save-layout').onclick=async()=>{try{const state=await chrome.storage.local.get(['liblibActiveJob']);if(state.liblibActiveJob)throw new Error('请先停止采集，再修改保存目录。');saving=true;sync();const d=await Hub.defaults();await Hub.api('/settings/defaults',{...d,layout:get('directory-layout').value});savedLayout=get('directory-layout').value;await Hub.invalidateOptions();UI.message(get('path-message'),'分类方式已保存，仅用于新作品。');}catch(e){get('directory-layout').value=savedLayout;preview();error(e);}finally{saving=false;sync();}};
 sync();Promise.allSettled([
  Hub.api('/health').then(show).catch(error),
  Hub.defaults().then(d=>{savedLayout=d.layout==='organized_flat'?'organized_flat':'organized';get('directory-layout').value=savedLayout;layoutReady=true;preview();sync();}).catch(e=>{get('layout-help').hidden=false;get('layout-help').textContent='分类方式读取失败：'+e.message;})
 ]);
})();
