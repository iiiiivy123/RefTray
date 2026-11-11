/* Own only native folder requests; collecting tasks keep their existing owner. */
const FolderChooser=(()=>{
 const active=new Map(),base='http://127.0.0.1:8766/settings/choose-folder';
 async function api(path,token,post=false){
  const response=await fetch(base+path,{method:post?'POST':'GET',headers:{'X-Collector-Token':token},signal:AbortSignal.timeout(5000)});
  const value=await response.json();if(!response.ok)throw Error(reftrayApiError(response,value,'/settings/choose-folder'+path));return value;
 }
 async function choose(requestId){
  const state={cancelled:false};state.finished=new Promise(resolve=>state.finish=resolve);active.set(requestId,state);
  try{
   const health=await reftrayHealth('http://127.0.0.1:8766/health').then(r=>r.json());state.token=health.settings_token;
   const job=await api('',health.settings_token,true);state.job=job.id;
   for(let n=0;n<500;n++){
    const {collectorPopupDraft:d}=await chrome.storage.local.get(['collectorPopupDraft']);
    if(state.cancelled||!d||d.requestId!==requestId){
     if(!state.cancelSent){await api('/'+encodeURIComponent(job.id)+'/cancel',health.settings_token,true);state.cancelSent=true;}
    }
    const value=await api('/'+encodeURIComponent(job.id),health.settings_token);
    if(value.state==='failed')throw Error(value.error);
    if(value.state==='done'){
     const {collectorPopupDraft:latest}=await chrome.storage.local.get(['collectorPopupDraft']);
     const cancelled=Boolean(value.cancelled||state.cancelled);
     if(latest?.requestId===requestId&&!state.cancelled)await chrome.storage.local.set({collectorPopupDraft:{...latest,picking:false,options:{...latest.options,...(!cancelled?{destination:value.directory}:{})}}});
     state.done=true;return {ok:true,...value,cancelled};
    }
    await new Promise(resolve=>setTimeout(resolve,250));
   }
   await api('/'+encodeURIComponent(job.id)+'/cancel',health.settings_token,true);
   throw Error('选择文件夹超时，原目录未改变');
  }finally{
   try{if(state.job&&!state.done&&!state.cancelSent)await api('/'+encodeURIComponent(state.job)+'/cancel',state.token,true);}
   finally{active.delete(requestId);state.finish();}
  }
 }
 async function cancel(requestId){const state=active.get(requestId);if(state){state.cancelled=true;await state.finished;}return {ok:true};}
 return {choose,cancel};
})();
