(() => {
 const section=document.createElement('section');
 section.innerHTML='<h2>网页悬浮保存</h2><label><input type="checkbox">在已授权的网站显示 RefTray 悬浮按钮</label><p>点击一次，按设置页默认值保存当前页。其他网站可在扩展弹窗中单独启用。</p><p role="status"></p>';
 document.querySelector('#tools').before(section);
 const toggle=section.querySelector('input'),status=section.querySelector('[role="status"]');
 toggle.disabled=true;
 chrome.storage.local.get('reftrayFloatingEnabled').then(value=>{toggle.checked=value.reftrayFloatingEnabled!==false;toggle.disabled=false;}).catch(e=>{status.textContent=e.message;});
 toggle.onchange=async()=>{try{await chrome.storage.local.set({reftrayFloatingEnabled:toggle.checked});status.textContent='已保存';}catch(e){status.textContent='设置未保存：'+e.message;}};
})();
