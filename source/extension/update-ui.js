// Only observes an update explicitly requested by the user. Closing this page does not cancel Setup.
(() => {
 const active=new Set(['downloading','ready','installing','restarting','rolling_back']);
 let release=null,timer=null,started=0,reloading=false;
 const panel=document.createElement('section');panel.id='update-panel';
 panel.innerHTML='<h2>RefTray</h2><p id="update-connections" class="update-version"></p><p id="update-message" role="status">检查正式新版</p><div class="update-actions"><button type="button" id="check-update">检查更新</button><button type="button" id="install-update" hidden>下载并更新</button><button type="button" id="restore-update" hidden>恢复上一版程序</button></div><p class="update-preservation">更新和恢复会保留素材、设置与采集记录。</p><details class="update-details"><summary>连接与恢复说明</summary><p id="update-recovery"></p><p>更新包含后台、Chrome 扩展和 MCP。更新后重新连接 AI 中的 RefTray 接口；扩展版本不一致时，在 chrome://extensions 重新加载 RefTray，再刷新作品网页。</p></details>';
 const settings=document.querySelector('#about-settings');
 if(settings)settings.append(panel);
 else{panel.hidden=true;document.body.append(panel);}
 const message=panel.querySelector('#update-message'),check=panel.querySelector('#check-update'),install=panel.querySelector('#install-update');
 const restore=panel.querySelector('#restore-update'),connections=panel.querySelector('#update-connections'),recovery=panel.querySelector('#update-recovery');
 const notice=document.querySelector('#release-notice');
 const quick=notice?.querySelector('[data-update]'),quickMessage=notice?.querySelector('[data-update-status]');
 function say(text){message.textContent=text;if(quickMessage)quickMessage.textContent=text;}
 function enable(busy){check.disabled=install.disabled=restore.disabled=Boolean(busy);if(quick)quick.disabled=Boolean(busy);}
 function recoveryHelp(info){if(info?.available)recovery.textContent='可恢复到 '+info.version+'；当前素材、设置与记录保留。后台打不开时，双击 '+info.directory+'\\RefTrayRestore.exe。';}
 chrome.storage.local.get(['reftrayRecovery']).then(saved=>recoveryHelp(saved.reftrayRecovery));
 async function observe(){
  try{
   const status=await Hub.api('/updates/status');
   const busy=active.has(status.phase);enable(busy);
   const extension=chrome.runtime.getManifest().version;
   connections.textContent='后台 '+(status.current||status.version||'')+' 已连接 · 此扩展 '+extension+(status.current&&status.current!==extension?'，请重新加载':'');
   restore.hidden=!status.recovery?.available;
   if(status.recovery?.available){recoveryHelp(status.recovery);await chrome.storage.local.set({reftrayRecovery:status.recovery});}
   if(['completed','rolled_back'].includes(status.phase)&&status.current&&status.version!==status.current)say('当前版本 '+status.current);
   else if(status.phase!=='idle')say(status.message+(status.total?' '+Math.floor(status.received/status.total*100)+'%':''));
   const loadedVersion=status.current||status.version;
   if(['completed','rolled_back'].includes(status.phase)&&loadedVersion&&loadedVersion!==extension&&!reloading){
    const saved=await chrome.storage.local.get(['reftrayUpdateReload']);
    if(saved.reftrayUpdateReload===loadedVersion){say('后台已更新，当前扩展尚未加载新版；请在扩展管理页检查加载目录。');return;}
    reloading=true;await chrome.storage.local.set({reftrayUpdateReload:loadedVersion});say('程序已就绪，正在刷新扩展…');
    chrome.runtime.reload();return;
   }
   if(busy){if(!started)started=Date.now();schedule();}
   else{started=0;clearTimeout(timer);}
  }catch(error){
   connections.textContent='后台暂未连接；更新和恢复期间会短暂断开。';
   if(started){say('正在等待更新结果；安装期间后台会暂时断开。');schedule();}
   else if(settings)say(error.message);
  }
 }
 function schedule(){
  clearTimeout(timer);
  if(Date.now()-started>30*60*1000){say('暂未收到更新结果，请检查后台或重新打开此页。');enable(false);return;}
  timer=setTimeout(observe,1500);
 }
 async function begin(number){
  enable(true);say('正在开始更新…');
  try{await Hub.api('/updates/install',{version:number.replace(/^v/,'')});started=Date.now();await observe();}
  catch(error){enable(false);say(error.message);}
 }
 check.onclick=async()=>{
  enable(true);say('正在检查正式新版…');
  try{release=await Hub.api('/updates/check');install.hidden=!release.available;say(release.available?'发现新版 '+release.version+' · 更新会保留素材和设置':'当前已是最新正式版，或正在使用更新的预发布版。');}
  catch(error){say(error.message);}finally{enable(false);}
 };
 install.onclick=()=>begin(release.version);
 restore.onclick=async()=>{enable(true);say('正在启动旧版恢复…');try{await Hub.api('/updates/restore',{});started=Date.now();await observe();}catch(error){enable(false);say(error.message);}};
 if(quick)quick.onclick=()=>begin(quick.dataset.version);
 // A completed update can be picked up when the popup was closed during installation.
 observe();
})();
