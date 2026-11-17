(() => {
 const enable=document.createElement('button');enable.id='enable-site';enable.type='button';enable.textContent='悬浮';enable.disabled=true;enable.setAttribute('aria-pressed','false');
 document.querySelector('.header-actions').prepend(enable);
 const message=document.createElement('p');message.id='web-action-message';message.setAttribute('role','status');document.querySelector('.app-header').after(message);
 let tab,origin,siteKey,enabled=false;
 const paint=value=>{enabled=value;enable.setAttribute('aria-pressed',String(value));enable.title=value?'已在此网站启用悬浮保存，点击关闭':'在此网站启用悬浮保存';enable.setAttribute('aria-label',enable.title);};
 const refresh=async()=>{const values=await chrome.storage.local.get(['reftrayFloatingEnabled','reftrayFloatingSites']);const granted=await chrome.permissions.contains({origins:[origin]});paint(granted&&values.reftrayFloatingEnabled!==false&&values.reftrayFloatingSites?.[siteKey]!==false);};
 chrome.tabs.query({active:true,currentWindow:true}).then(async tabs=>{
  tab=tabs[0];const u=new URL(tab?.url);if(!/^https?:$/.test(u.protocol))throw new Error('请打开普通网页后使用悬浮保存。');siteKey=u.origin;origin=siteKey+'/*';await refresh();enable.disabled=false;
 }).catch(e=>{enable.title=e.message;});
 enable.onclick=async()=>{
  if(!origin)return;
  const next=!enabled;
  // Request synchronously from the gesture; turning off never revokes capture access.
  const permission=next?chrome.permissions.request({origins:[origin]}):Promise.resolve(true);
  enable.disabled=true;
  try{
   if(!await permission){message.textContent='未授权，此网站的悬浮保存未启用。';return;}
   const {reftrayFloatingSites:sites={}}=await chrome.storage.local.get('reftrayFloatingSites');
   await chrome.storage.local.set({reftrayFloatingSites:{...sites,[siteKey]:next},...(next?{reftrayFloatingEnabled:true}:{})});
   if(next)await chrome.scripting.executeScript({target:{tabId:tab.id},files:['floating-save.js']});
   await refresh();message.textContent=next?'已启用，按钮默认在网页右上方；拖动后会记住位置。':'已在此网站关闭悬浮保存。';
  }catch(e){message.textContent=e.message;}finally{enable.disabled=false;}
 };
 chrome.storage.onChanged.addListener((changes,area)=>{if(origin&&area==='local'&&(changes.reftrayFloatingEnabled||changes.reftrayFloatingSites))refresh().catch(e=>message.textContent=e.message);});
})();
