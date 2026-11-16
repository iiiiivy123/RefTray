(() => {
 if(window.top!==window||!document.body||document.querySelector('[data-reftray-float]'))return;
 const host=document.createElement('div');host.setAttribute('data-reftray-float','');
 const shadow=host.attachShadow({mode:'closed'});
 shadow.innerHTML='<style>:host([hidden]){display:none!important}:host{all:initial;position:fixed;right:18px;bottom:24px;z-index:2147483646;font:13px system-ui;color:#302e29}button{font:inherit;border:1px solid #d8d5cc;background:#faf9f5;color:#302e29;border-radius:22px;padding:11px 15px;cursor:pointer;box-shadow:0 3px 14px #0002}button:disabled{opacity:.65;cursor:wait}p{max-width:260px;padding:10px;background:#faf9f5;border:1px solid #d8d5cc;border-radius:10px;white-space:pre-wrap;box-shadow:0 3px 14px #0002}p:empty{display:none}</style><p role="status" aria-live="polite"></p><button title="按默认设置保存当前页">↓ RefTray</button>';
 const button=shadow.querySelector('button'),status=shadow.querySelector('p');
 const paint=values=>{host.hidden=values.reftrayFloatingEnabled===false;};
 chrome.storage.local.get('reftrayFloatingEnabled').then(paint);
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.reftrayFloatingEnabled)paint({reftrayFloatingEnabled:changes.reftrayFloatingEnabled.newValue});});
 button.onclick=async()=>{
  button.disabled=true;status.textContent='正在按默认设置保存…';
  try{const reply=await chrome.runtime.sendMessage({type:'REFTRAY_QUICK_SAVE'});if(!reply?.ok)throw new Error(reply?.error||'保存未完成');status.textContent=reply.result.message||'已保存，可在采集记录中查看。';}
  catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 };
 document.body.append(host);
})();
