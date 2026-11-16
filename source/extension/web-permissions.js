/* Optional per-site access; never asks for all websites at install time. */
const WebPermissions=(()=>{
 const id='reftray-floating-save';
 async function sync(){
  const {origins=[]}=await chrome.permissions.getAll();
  const matches=origins.filter(p=>/^https?:\/\//.test(p)&&!/(127\.0\.0\.1|localhost|pinimg|twimg|hdslb|xhscdn|hbimg|fbcdn|cdninstagram)/.test(p));
  const exists=(await chrome.scripting.getRegisteredContentScripts({ids:[id]})).length;
  if(!matches.length){if(exists)await chrome.scripting.unregisterContentScripts({ids:[id]});return;}
  const config={id,matches,js:['floating-save.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true};
  if(exists)await chrome.scripting.updateContentScripts([config]);else await chrome.scripting.registerContentScripts([config]);
 }
 if(chrome.permissions?.onAdded){chrome.permissions.onAdded.addListener(()=>sync().catch(console.error));chrome.permissions.onRemoved.addListener(()=>sync().catch(console.error));}
 chrome.runtime.onInstalled.addListener(()=>sync().catch(console.error));chrome.runtime.onStartup.addListener(()=>sync().catch(console.error));
 return {sync};
})();
