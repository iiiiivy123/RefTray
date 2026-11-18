/* Web actions share the existing collector and its immutable task parameters. */
let activeQuickSave=null;
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message.type==='REFTRAY_QUICK_STOP'){
  const owner=activeQuickSave;
  if(sender.id!==chrome.runtime.id||sender.frameId!==0||!owner||!owner.requestId||sender.tab?.id!==owner.tabId||message.requestId!==owner.requestId){respond({ok:false,error:'这次保存已结束或不属于当前页面'});return false;}
  owner.stopped=true;
  (async()=>{if(taskContext.quickRequestId===owner.requestId)await chrome.storage.local.set({liblibControl:'stopped'});return {ok:true};})().then(respond).catch(error=>respond({ok:false,error:error.message}));
  return true;
 }
 if(['REFTRAY_FLOATING_CONTEXT','REFTRAY_OPEN_LIBRARY','REFTRAY_OPEN_SAVED'].includes(message.type)){
  if(sender.id!==chrome.runtime.id||!sender.tab||sender.frameId!==0){respond({ok:false,error:'无效的悬浮入口'});return false;}
  (async()=>{
   const response=await reftrayHealth('http://127.0.0.1:8766/health'),health=await response.json();
   if(!response.ok)throw new Error('后台未连接');
   if(health.release!==chrome.runtime.getManifest().version)throw new Error('请重新加载扩展后刷新网页');
   if(message.type==='REFTRAY_OPEN_LIBRARY'){await downloadApi(8766,health.settings_token,'/settings/open',{directory:health.inbox});return {};}
   if(message.type==='REFTRAY_OPEN_SAVED'){
    if(!Number.isSafeInteger(message.captureId)||message.captureId<1)throw new Error('保存记录无效');
    await downloadApi(8766,health.settings_token,`/history/${message.captureId}/open`,{});return {};
   }
   const defaults=await downloadApi(8766,health.settings_token,'/settings/defaults');
   const floating=await downloadApi(8766,health.settings_token,'/settings/floating-defaults');
   const history=await downloadApi(8766,health.settings_token,'/history?page_size=1');
   const latest=history.items?.[0];
   const tab=await chrome.tabs.get(sender.tab.id);
   return {mode:CaptureOptions.floatingHint(defaults,CollectorSite.context(tab.url),floating),directory:health.inbox,latest:latest?{id:latest.id,title:latest.title,directory:latest.directory}:null};
  })().then(context=>respond({ok:true,context})).catch(error=>respond({ok:false,error:error.message}));
  return true;
 }
 if(message.type==='REFTRAY_OPEN_MANAGE'){
  if(sender.id!==chrome.runtime.id||!sender.tab||sender.frameId!==0||!['history','defaults'].includes(message.section)){respond({ok:false,error:'无效的管理页入口'});return false;}
  chrome.tabs.create({url:chrome.runtime.getURL('manage.html#'+message.section)}).then(()=>respond({ok:true})).catch(error=>respond({ok:false,error:error.message}));
  return true;
 }
 if(!['REFTRAY_QUICK_SAVE','REFTRAY_FULL_PAGE'].includes(message.type))return false;
 const quick=message.type==='REFTRAY_QUICK_SAVE';
 if(sender.id!==chrome.runtime.id||(quick?(!sender.tab||sender.frameId!==0):sender.url!==chrome.runtime.getURL('popup.html'))){respond({ok:false,error:'无效的网页保存入口'});return false;}
 if(taskRunning||scanInProgress){respond({ok:false,error:'已有任务正在运行，请稍候'});return false;}
 taskRunning=true;const previous=taskContext;
 const requestId=typeof message.requestId==='string'&&/^[\w-]{1,64}$/.test(message.requestId)?message.requestId:null;
 const owner=quick?{tabId:sender.tab.id,requestId,stopped:false}:null;
 if(owner)activeQuickSave=owner;
 const snapshot={tabId:message.tabId,context:{}};
 (async()=>{
  const tab=quick?sender.tab:await chrome.tabs.get(message.tabId);
  if(!/^https?:\/\//.test(tab?.url||''))throw new Error('请打开普通网页');
  if(!quick){snapshot.context={url:tab.url,title:tab.title};await chrome.storage.local.set({reftraySnapshotProgress:{...snapshot,status:'running',message:'正在准备整页截图',updatedAt:Date.now()}});}
  const healthResponse=await reftrayHealth('http://127.0.0.1:8766/health');
  const health=await healthResponse.json();
  if(!healthResponse.ok)throw new Error(reftrayApiError(healthResponse,health,'/health'));
  if(health.release!==chrome.runtime.getManifest().version)throw new Error('扩展与后台版本不一致，请重新加载本次安装的扩展');
  if(health.busy)throw new Error('后台正在处理其他任务，请稍候');
  const api=(path,body)=>downloadApi(8766,health.settings_token,path,body);
  if(!quick)return await FullPageCapture.capture(tab,{api,progress:message=>chrome.storage.local.set({reftraySnapshotProgress:{...snapshot,status:'running',message,updatedAt:Date.now()}})});
  const defaults=await api('/settings/defaults');
  const floating=await api('/settings/floating-defaults');
  if(owner.stopped)throw new Error('USER_STOPPED');
  const site=CollectorSite.context(tab.url);
  if(!site.single)throw new Error(site.reason||'请打开一篇作品详情');
  await ensureBackendIdle();
  await chrome.storage.local.remove('liblibControl');
  const preview=await previewCollection(tab.id,tab.url,true);
  if(owner.stopped)throw new Error('USER_STOPPED');
  if(preview?.url!==tab.url)throw new Error('页面已切换，请重新保存');
  const {mode,options}=CaptureOptions.quick(defaults,site,preview,message.choice??'auto',floating);
  const result=await collect(mode,8766,options,{id:tab.id,url:tab.url,quickSave:true,quickRequestId:requestId,quickControl:owner});
  await reportProgress({percent:100,status:TaskProgress.resultStatus(result),message:result.message||`保存完成，新增 ${result.new_images} 张`,directory:result.directory,details:result.details||result.warnings?.join('\n')});
  let captureId=null,folderWarning='';
  if(result.directory)try{
   const {item}=await api('/history/lookup',{url:tab.url,required:[]});
   const normalized=value=>String(value||'').replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();
   if(item&&normalized(item.directory)===normalized(result.directory))captureId=item.id;
  }catch(_){folderWarning='保存位置暂时无法读取，请在采集记录中查看。';}
  return {...result,captureId,folderWarning,status:TaskProgress.resultStatus(result)};
 })().then(async result=>{if(!quick)await chrome.storage.local.set({reftraySnapshotProgress:{...snapshot,status:'completed',message:result.message,directory:result.directory,updatedAt:Date.now()}});return {ok:true,result};}).catch(async error=>{
  try{
   if(quick&&taskContext!==previous)await reportProgress({status:error.message==='USER_STOPPED'?'stopped':'failed',message:error.message});
   if(!quick)await chrome.storage.local.set({reftraySnapshotProgress:{...snapshot,message:error.message,status:'failed',updatedAt:Date.now()}});
  }catch(persistError){return {ok:false,error:error.message+'；状态保存失败：'+persistError.message};}
  return {ok:false,error:error.message};
 }).then(response=>{if(activeQuickSave===owner)activeQuickSave=null;taskRunning=false;respond(response);});
 return true;
});
