/* Web actions share the existing collector and its immutable task parameters. */
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(!['REFTRAY_QUICK_SAVE','REFTRAY_FULL_PAGE'].includes(message.type))return false;
 const quick=message.type==='REFTRAY_QUICK_SAVE';
 if(sender.id!==chrome.runtime.id||(quick?(!sender.tab||sender.frameId!==0):sender.url!==chrome.runtime.getURL('popup.html'))){respond({ok:false,error:'无效的网页保存入口'});return false;}
 if(taskRunning||scanInProgress){respond({ok:false,error:'已有任务正在运行，请稍候'});return false;}
 taskRunning=true;const previous=taskContext;
 (async()=>{
  const tab=quick?sender.tab:await chrome.tabs.get(message.tabId);
  if(!/^https?:\/\//.test(tab?.url||''))throw new Error('请打开普通网页');
  const healthResponse=await reftrayHealth('http://127.0.0.1:8766/health');
  const health=await healthResponse.json();
  if(!healthResponse.ok)throw new Error(reftrayApiError(healthResponse,health,'/health'));
  if(health.release!==chrome.runtime.getManifest().version)throw new Error('扩展与后台版本不一致，请重新加载本次安装的扩展');
  if(health.busy)throw new Error('后台正在处理其他任务，请稍候');
  const api=(path,body)=>downloadApi(8766,health.settings_token,path,body);
  if(!quick)return await FullPageCapture.capture(tab,{api,progress:message=>chrome.storage.local.set({reftraySnapshotProgress:{message,updatedAt:Date.now()}})});
  const defaults=await api('/settings/defaults');
  const options=CaptureOptions.normalize({...defaults,destination:null,capture_scope:'single'});
  const site=CollectorSite.context(tab.url);
  if(!site.single)throw new Error(site.reason||'请打开一篇作品详情');
  const mode=site.mode==='video'?(options.video_action==='frames'?'download-frames':'download'):'current';
  const result=await collect(mode,8766,options,{id:tab.id,url:tab.url});
  await reportProgress({percent:100,status:TaskProgress.resultStatus(result),message:result.message||`保存完成，新增 ${result.new_images} 张`,directory:result.directory,details:result.details||result.warnings?.join('\n')});
  return result;
 })().then(result=>respond({ok:true,result})).catch(async error=>{
  try{
   if(quick&&taskContext!==previous)await reportProgress({status:error.message==='USER_STOPPED'?'stopped':'failed',message:error.message});
   if(!quick)await chrome.storage.local.set({reftraySnapshotProgress:{message:error.message,status:'failed',updatedAt:Date.now()}});
  }finally{respond({ok:false,error:error.message});}
 }).finally(()=>{taskRunning=false;});
 return true;
});
