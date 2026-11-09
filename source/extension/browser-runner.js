/* MCP execution belongs to the worker, never to popup lifetime. */
const BrowserRunner=(()=>{
 const alarm='reftray-browser-requests';
 let receiving=false,heartbeat=null,beating=false,health,client,active=null;
 const identity=value=>{
  const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,'');
  if(['x.com','twitter.com','mobile.twitter.com'].includes(host)&&/\/status\/(\d+)/.test(u.pathname))return 'x:'+u.pathname.match(/\/status\/(\d+)/)[1];
  if(host==='youtu.be'||host==='youtube.com'||host==='m.youtube.com'){
   const id=host==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|live)\/([^/]+)/)?.[1];
   if(id)return 'youtube:'+id;
  }
  u.hash='';for(const k of [...u.searchParams.keys()])if(/^(xsec_token|xsec_source|utm_.+|igsh|igshid|fbclid)$/i.test(k))u.searchParams.delete(k);
  u.searchParams.sort();return u.href.replace(/\/(?=\?|$)/,'');
 };
 async function api(path,value){
  const response=await fetch('http://127.0.0.1:8766'+path,{method:value===undefined?'GET':'POST',
   headers:{'Content-Type':'application/json','X-Collector-Token':health.settings_token},
   ...(value===undefined?{}:{body:JSON.stringify(value)}),signal:AbortSignal.timeout(10000)});
  const data=await response.json();if(!response.ok){const e=new Error(typeof data.detail==='string'?data.detail:'Chrome 采集连接失败');e.status=response.status;throw e;}return data;
 }
 async function beat(){
  if(!active||active.finishing||beating)return;beating=true;const currentRun=active,controlVersion=active.controlVersion||0;
  try{
   const state=await chrome.storage.local.get(['liblibProgress','collectorBackendPending']);
   const current=taskContext.bridgeId===active.id;
   const progress=current&&taskContext.id&&state.liblibProgress?.context?.id===taskContext.id?state.liblibProgress:{stage:'opening',message:'正在读取目标网页'};
   const result=await api('/browser/progress/'+active.id,{...client,
    child_id:current?(taskContext.batch?.id||taskContext.id):null,
    backend_job:current&&state.collectorBackendPending?.taskId===taskContext.id?state.collectorBackendPending||null:null,progress});
   if(active!==currentRun||currentRun.finishing||controlVersion!==(active.controlVersion||0))return;
   await chrome.storage.local.set({liblibControl:result.action,collectorBrowserConnection:{state:'connected',updated:Date.now()}});
   active.lastSeen=Date.now();
  }catch(error){
   if(active!==currentRun||currentRun.finishing)return;
   await chrome.storage.local.set({collectorBrowserConnection:{state:'error',message:error.message,updated:Date.now()}});
   if(error.status===409||Date.now()-active.lastSeen>60000){
    active.lost=true;await chrome.storage.local.set({liblibControl:'stopped'});
   }
  }finally{beating=false;}
 }
 async function target(url,scope){
  const wanted=identity(url),tabs=await chrome.tabs.query({});
  let tab=scope==='single'?tabs.find(t=>/^https?:/.test(t.url||'')&&identity(t.url)===wanted):null;
  // Batch navigates through works: give it its own tab, preserving the user's page.
  if(!tab)tab=await chrome.tabs.create({url,active:false});
  await waitForTab(tab.id);
  tab=await chrome.tabs.get(tab.id);
  if(identity(tab.url)!==wanted)throw new Error('网页跳转到登录或其他页面，请在 Chrome 完成登录后重试');
  return tab;
 }
 async function receive(){
  if(receiving||taskRunning||scanInProgress)return;
  receiving=true;let owns=false,item;
  try{
   health=await reftrayHealth('http://127.0.0.1:8766/health').then(r=>r.json());
   const state=await chrome.storage.local.get(['collectorBrowserClient','collectorBrowserRun','collectorBrowserResult']);
   const id=state.collectorBrowserClient||crypto.randomUUID();
   client={client_id:id,release:chrome.runtime.getManifest().version};
   if(!state.collectorBrowserClient)await chrome.storage.local.set({collectorBrowserClient:id});
   if(state.collectorBrowserResult){
    try{await api('/browser/result/'+state.collectorBrowserResult.id,{...state.collectorBrowserResult.payload,...client});}
    catch(error){if(error.status!==409)throw error;}
    await chrome.storage.local.remove('collectorBrowserResult');
   }
   if(state.collectorBrowserRun){
    // Only recover our own worker marker; never clear a manually started task.
    const {liblibActiveJob:old}=await chrome.storage.local.get('liblibActiveJob');
    if(old?.bridgeId===state.collectorBrowserRun.id)await chrome.storage.local.remove(['liblibActiveJob','liblibControl']);
    await chrome.storage.local.remove('collectorBrowserRun');
   }
   // Manual capture may have started while health/outbox requests were pending.
   if(taskRunning||scanInProgress)return;
   taskRunning=true;owns=true;
   ({item}=await api('/browser/claim',client));
   await chrome.storage.local.set({collectorBrowserConnection:{state:'connected',updated:Date.now()}});
   if(!item)return;
   active={id:item.id,lastSeen:Date.now()};
   await chrome.storage.local.set({collectorBrowserRun:{id:item.id},liblibControl:'running'});
   heartbeat=setInterval(()=>beat(),5000);await beat();
   const request=item.request,tab=await target(request.url,request.scope);
   await controlPoint();
   if(active.lost)throw new Error('Chrome 与后台连接中断，已停止本次执行');
   let result;
   if(request.operation!=='capture')taskContext={bridgeId:item.id,options:{}};
   if(request.operation==='preview'){
    result=await previewCollection(tab.id,tab.url,true);
   }else if(request.operation==='scan'){
    result=await scanLoadedPage(tab.id,tab.url,true);
   }else{
    let options=CaptureOptions.browser(request);
    if(item.checkpoint){
     await TaskStore.save(item.checkpoint);
     options={...options,resume:true};
    }
    let mode=request.scope==='single'?(request.mode==='video'?(options.extract_frames?'download-frames':'download'):'current'):
      request.scope==='board'&&/(^|\.)pinterest\.(com|cn)$/.test(new URL(tab.url).hostname)?'board':'author';
    result=await collect(mode,8766,options,{id:tab.id,url:tab.url,bridgeId:item.id});
   }
   const status=request.operation==='capture'?TaskProgress.resultStatus(result):'completed';
   if(taskContext.bridgeId===item.id)await reportProgress({status,percent:100,message:result.message||'采集完成',directory:result.directory});
   await finish(item,status,result.message||'已完成',result);
  }catch(error){
   if(item){
    const stopped=error.message==='USER_STOPPED';
    const status=active?.lost?'interrupted':stopped?'stopped':'failed';
    const message=stopped?'已停止，已保存文件保留':String(error.message).replace(/https?:\/\/[^\s"<>]+/g,'[链接]').slice(0,1000);
    if(taskContext.bridgeId===item.id)await reportProgress({status,message}).catch(()=>{});
    await finish(item,status,message,taskContext.bridgeId===item.id?taskContext.stopResult||{}:{}).catch(()=>{});
   }else await chrome.storage.local.set({collectorBrowserConnection:{state:'error',message:error.message,updated:Date.now()}}).catch(()=>{});
  }finally{
   clearInterval(heartbeat);heartbeat=null;active=null;
   if(owns){taskRunning=false;await chrome.storage.local.remove('collectorBrowserRun');}
   receiving=false;
  }
 }
 async function finish(item,status,message,result){
  // Stop the heartbeat before committing a terminal state; retain delivery across restart.
  if(active)active.finishing=true;
  clearInterval(heartbeat);
  const payload={...client,status,message,result,child_id:taskContext.bridgeId===item.id?(taskContext.batch?.id||taskContext.id):null};
  await chrome.storage.local.set({collectorBrowserResult:{id:item.id,payload}});
  try{
   await api('/browser/result/'+item.id,payload);
   await chrome.storage.local.remove('collectorBrowserResult');
  }catch(error){
   await chrome.storage.local.set({collectorBrowserConnection:{state:'error',message:'结果待同步：'+error.message,updated:Date.now()}});
  }
 }
 async function start(){
  if(!await chrome.alarms.get(alarm))await chrome.alarms.create(alarm,{periodInMinutes:.5});
  void receive();
 }
 async function control(action){
  if(!['running','paused','stopped'].includes(action))throw new Error('无效的任务操作');
  if(active){
   active.controlVersion=(active.controlVersion||0)+1;
   await api('/browser/control/'+active.id,{action:{running:'resume',paused:'pause',stopped:'stop'}[action]});
  }
  taskContext.control=action;
  await chrome.storage.local.set({liblibControl:action});
 }
 if(chrome.alarms){
  chrome.alarms.onAlarm.addListener(a=>{if(a.name===alarm)void receive();});
  chrome.runtime.onStartup.addListener(()=>void start());
  chrome.runtime.onInstalled.addListener(()=>void start());
  void start();
 }
 return {receive,identity,target,control};
})();
if(typeof module!=='undefined')module.exports=BrowserRunner;
