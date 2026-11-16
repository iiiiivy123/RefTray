(() => {
 const panel=document.createElement('section');panel.className='inline-actions';panel.style.cssText='padding:8px 16px;flex-wrap:wrap';
 panel.innerHTML='<button type="button" id="enable-site">在此网站启用悬浮保存</button><button type="button" id="page-screenshot">保存整页长截图</button><p id="web-action-message" role="status" style="width:100%;white-space:pre-wrap"></p>';
 document.querySelector('main').append(panel);
 const message=panel.querySelector('p'),enable=panel.querySelector('#enable-site'),shot=panel.querySelector('#page-screenshot');
 let tab,origin;enable.disabled=shot.disabled=true;
 chrome.tabs.query({active:true,currentWindow:true}).then(tabs=>{
  tab=tabs[0];const u=new URL(tab.url);if(!/^https?:$/.test(u.protocol))throw new Error('请打开普通网页后使用。');origin=u.origin+'/*';enable.disabled=shot.disabled=false;
 }).catch(e=>{enable.disabled=shot.disabled=true;message.textContent=e.message;});
 enable.onclick=async()=>{
  if(!origin)return;
  try{
   // Call synchronously from the explicit user gesture; no permission prompt on load.
   const granted=await chrome.permissions.request({origins:[origin]});
   if(!granted){message.textContent='未授权，此网站不显示悬浮按钮。';return;}
   await chrome.scripting.executeScript({target:{tabId:tab.id},files:['floating-save.js']});
   message.textContent='已启用。之后在此网站点击 RefTray 即可按默认设置保存。';
  }catch(e){message.textContent=e.message;}
 };
 shot.onclick=async()=>{
  shot.disabled=true;message.textContent='正在保存整页。请保持此网页在前台，不要滚动或切换标签；关闭弹窗仍会继续。';
  try{const r=await chrome.runtime.sendMessage({type:'REFTRAY_FULL_PAGE',tabId:tab.id});if(!r?.ok)throw new Error(r?.error||'截图未完成');message.textContent=r.result.message;}
  catch(e){message.textContent=e.message;}finally{shot.disabled=false;}
 };
})();
