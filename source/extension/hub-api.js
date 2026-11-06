const Hub = (() => {
  let health;
  async function handshake(){
    const response=await reftrayHealth('http://127.0.0.1:8766/health',localFetch);
    if(!response.ok)throw new Error('保存服务不可用');
    return response.json();
  }
  async function localFetch(url, options) {
    try { return await fetch(url, options); }
    catch (error) {
      health = undefined;
      if (error.name === 'TimeoutError' || error.name === 'AbortError')
        throw new Error('本地后台响应超时。请查看任务记录确认结果，避免重复开始采集。');
      throw new Error('连接不到本地后台。请从 Windows 开始菜单打开“灵感采集”，确认右下角托盘有图标，再重新打开扩展。关闭 Chrome 不会启动后台。');
    }
  }
  async function api(path, value) {
    health ||= await handshake();
    const release=chrome.runtime.getManifest().version;
    if(health.release&&health.release!==release)throw new Error(`扩展版本 ${release} 与后台版本 ${health.release} 不一致。请打开 chrome://extensions，找到「灵感采集」点重新加载，然后刷新作品网页；若仍不一致，请确认加载的是本次安装目录中的 extension 文件夹。`);
    if(path==='/health')return health;
    for(let attempt=0;attempt<2;attempt++){
      const response=await localFetch('http://127.0.0.1:8766'+path,{method:value===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Collector-Token':health.settings_token},...(value===undefined?{}:{body:JSON.stringify(value)}),signal:AbortSignal.timeout(15000)});
      let body;try{body=await response.json();}catch{throw new Error('本地服务返回了无法识别的响应；请查看任务记录后再操作。');}
      // This exact authorization error is raised before endpoint execution.
      const notExecuted=typeof body.detail==='string'&&body.detail.startsWith('扩展未通过后台校验。');
      if(response.status===403&&attempt===0&&(value===undefined||notExecuted)){
        health=undefined;health=await handshake();
        if(health.release&&health.release!==release)throw new Error('扩展与后台版本不一致，请重新加载扩展。');
        continue;
      }
      if(!response.ok)throw new Error(typeof body.detail==='string'?body.detail:'本地服务请求失败');
      if(path==='/settings/directory')health=body;
      return body;
    }
  }
  function options(d) {return {...d,...(d.md_only?{collection_mode:'text',include_images:false,ocr_enabled:false,video_action:'skip'}:{}),layout:d.layout==='organized_flat'?'organized_flat':'organized',include_videos:!d.md_only&&d.video_action!=='skip',extract_frames:!d.md_only&&d.video_action==='frames',directory_schema:'function-platform-v2'};}
  async function defaults(){
    let d=await api('/settings/defaults');
    if(!d._configured){
      const {collectorPreferences:p={},collectionMode}=await chrome.storage.local.get(['collectorPreferences','collectionMode']);
      const limit=p.limit==='all'?500:Number(p.limit==='custom'?p.custom:p.limit||20);
      d=await api('/settings/defaults',{...d,layout:['flat','organized_flat'].includes(p.layout)?'organized_flat':'organized',limit:Number.isInteger(limit)&&limit>=1&&limit<=500?limit:20,collection_mode:collectionMode==='text'?'text':'images',video_action:p.videos?(p.frames?'frames':'save'):'skip'});
    }
    return d;
  }
  const size=n=>n==null?'未知':(n/1048576).toFixed(1)+' MB';
  async function invalidateOptions(){
    const {collectorDefaultsGeneration=0}=await chrome.storage.local.get(['collectorDefaultsGeneration']);
    await chrome.storage.local.set({collectorDefaultsGeneration:collectorDefaultsGeneration+1});
    await chrome.storage.local.remove(['collectorPopupDraft','collectorLastOptions','collectorModePreferences']);
  }
  return {api,options,size,defaults,invalidateOptions,BUILD:'0.5.0'};
})();
