(() => {
 const get=id=>document.getElementById(id);
 let ready=false,layoutReady=false,busy=false,picking=false,configured=true,savedLayout='organized';
 const error=e=>{UI.feedback(get('path-message'),e.message);get('diagnostic-text').textContent=e.message;};
 function sync(){get('directory-layout').disabled=!layoutReady||busy||picking;get('save-layout').disabled=!layoutReady||busy||picking;get('save-layout').hidden=!configured;get('change-path').disabled=!ready||busy||picking;get('save-path-button').disabled=!ready||busy||picking;get('open-path').disabled=!ready||!configured;get('use-recommended').disabled=!ready||busy||picking;globalThis.refreshSelects?.();}
 function preview(){const root=get('path-input').value.replace(/[\\/]+$/,'');const flat=get('directory-layout').value==='organized_flat';get('layout-preview').textContent=root+'\\图片\\'+(flat?'小红书-帖子名称':'小红书\\帖子名称');}
 function show(h){configured=h.library_configured!==false;get('save-path').textContent=h.inbox;get('path-input').value=h.inbox;get('use-recommended').hidden=configured;UI.message(get('library-title'),configured?'素材库位置':'首次使用：选择素材库位置');preview();ready=true;sync();}
 async function save(){
  const state=await chrome.storage.local.get(['liblibActiveJob']);if(state.liblibActiveJob)throw new Error('请先停止采集，再修改保存目录。');
  show(await Hub.api('/settings/directory',{directory:get('path-input').value,...(layoutReady?{layout:get('directory-layout').value}:{})}));get('path-editor').hidden=true;
  savedLayout=get('directory-layout').value;await Hub.invalidateOptions();UI.message(get('path-message'),'当前素材库：'+get('save-path').textContent+'。之后的新任务使用此处；旧文件保留原位置。');
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
 const undoLayout=document.createElement('button');undoLayout.type='button';undoLayout.textContent='撤销目录方式修改';undoLayout.disabled=true;get('save-layout').after(undoLayout);
 undoLayout.onclick=()=>{get('directory-layout').value=savedLayout;undoLayout.disabled=true;preview();globalThis.refreshSelects?.();};
 get('directory-layout').onchange=()=>{preview();undoLayout.disabled=get('directory-layout').value===savedLayout;UI.message(get('path-message'),'目录方式尚未保存；新任务仍使用已保存的方式。');};
 get('save-layout').onclick=async()=>{try{const state=await chrome.storage.local.get(['liblibActiveJob']);if(state.liblibActiveJob)throw new Error('请先停止采集，再修改保存目录。');const d=await Hub.defaults();await Hub.api('/settings/defaults',{...d,layout:get('directory-layout').value});savedLayout=get('directory-layout').value;undoLayout.disabled=true;await Hub.invalidateOptions();UI.message(get('path-message'),'当前目录方式：'+(savedLayout==='organized_flat'?'直接展示作品':'按平台分类')+'。只影响新任务，续采和旧文件保留原位置。');}catch(e){get('directory-layout').value=savedLayout;preview();globalThis.refreshSelects?.();error(e);}};
 sync();Promise.allSettled([
  Hub.api('/health').then(show).catch(error),
  Hub.defaults().then(d=>{savedLayout=d.layout==='organized_flat'?'organized_flat':'organized';get('directory-layout').value=savedLayout;layoutReady=true;preview();sync();}).catch(e=>{get('layout-help').textContent='目录方式读取失败：'+e.message;})
 ]);
})();
