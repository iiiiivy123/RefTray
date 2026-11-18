(() => {
 const section=document.querySelector('#floating-settings');
 section.innerHTML=`<fieldset class="panel"><legend class="sr-only">悬浮保存默认设置</legend><div class="panel-heading"><h2>悬浮保存默认设置</h2></div><div class="panel-body">
 <div class="toggle-row"><div class="toggle-copy"><label for="floating-enabled">显示悬浮保存按钮</label><p class="hint">在已授权的网站显示。其他网站可在扩展弹窗中启用。</p></div><label class="switch"><input id="floating-enabled" type="checkbox" disabled><span></span></label></div>
 <p id="floating-toggle-status" role="status"></p>
 <form id="floating-defaults-form"><div class="field"><label for="floating-video-output">视频帖保存内容</label><select id="floating-video-output" disabled>
 <option value="original">仅视频（含原声音）</option><option value="subtitles">视频 + 字幕 + 文字稿</option><option value="text">仅文字稿（MD）</option><option value="audio">仅提取音频</option><option value="frames">视频抽帧</option></select></div>
 <p class="hint">默认不额外提取字幕或文字稿，原画面里的字幕会保留。点击仍直接保存，拖动只移动。</p>
 <p class="hint">仅用于下一次悬浮保存；素材库位置、图片和评论偏好、下载上限沿用采集设置。弹窗和 MCP 的选择保持独立。</p>
 <button type="submit" class="primary" disabled>保存悬浮默认值</button><button id="floating-retry" type="button" hidden>重新读取</button><p id="floating-defaults-status" role="status" aria-live="polite"></p></form>
 </div></fieldset>`;
 const q=selector=>section.querySelector(selector),toggle=q('#floating-enabled'),toggleStatus=q('#floating-toggle-status'),form=q('#floating-defaults-form'),output=q('#floating-video-output'),submit=q('[type="submit"]'),status=q('#floating-defaults-status'),retry=q('#floating-retry');
 let ready=false;
 const sync=()=>globalThis.refreshSelects?.();
 async function loadToggle(){
  try{const value=await chrome.storage.local.get('reftrayFloatingEnabled');toggle.checked=value.reftrayFloatingEnabled!==false;toggle.disabled=false;toggleStatus.textContent='';}
  catch(e){toggleStatus.textContent='悬浮开关读取失败：'+e.message;retry.hidden=false;}
 }
 toggle.onchange=async()=>{
  const selected=toggle.checked;toggle.disabled=true;
  try{await chrome.storage.local.set({reftrayFloatingEnabled:selected});toggleStatus.textContent='已保存';}
  catch(e){toggle.checked=!selected;toggleStatus.textContent='开关未保存：'+e.message;}
  finally{toggle.disabled=false;}
 };
 async function load(){
  ready=false;output.disabled=true;submit.disabled=true;retry.hidden=true;status.textContent='正在读取…';sync();
  try{const value=await Hub.api('/settings/floating-defaults');output.value=value.video_output;if(!output.value)throw new Error('保存内容无效');ready=true;status.textContent='';}
  catch(e){status.textContent='默认值读取失败：'+e.message;retry.hidden=false;}
  finally{output.disabled=!ready;submit.disabled=!ready;sync();}
 }
 form.onsubmit=async event=>{
  event.preventDefault();if(!ready||submit.disabled)return;
  output.disabled=true;submit.disabled=true;status.textContent='正在保存…';sync();
  try{const value=await Hub.api('/settings/floating-defaults',{video_output:output.value});if(value.video_output!==output.value)throw new Error('后台未确认所选内容');status.textContent='已保存，下次悬浮保存生效';}
  catch(e){status.textContent='默认值未保存：'+e.message;}
  finally{output.disabled=false;submit.disabled=false;sync();}
 };
 retry.onclick=()=>{load();loadToggle();};loadToggle();load();
})();
