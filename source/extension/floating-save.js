(() => {
 function summary(r={}) {
  if(r.status==='stopped')return {text:'已停止保存',kind:'warning'};
  if(r.status==='failed')return {text:'保存失败，请查看详情',kind:'error'};
  if(r.partial||r.status==='partial'||r.failed_images)return {text:'部分已保存，请查看详情',kind:'warning'};
  if(r.skipped||r.status==='skipped')return {text:'已按设置跳过',kind:'warning'};
  if(['paused','awaiting_approval'].includes(r.status))return {text:'等待继续，请查看记录',kind:'warning'};
  if((r.new_images??r.images)>0)return {text:`已保存 ${r.new_images??r.images} 张图片`,kind:'success'};
  if((r.new_videos??r.videos)>0)return {text:`已保存 ${r.new_videos??r.videos} 个媒体文件`,kind:'success'};
  if(r.documents>0)return {text:'文字内容已保存',kind:'success'};
  if(r.duplicate_images>0||r.duplicate_videos>0)return {text:'已保存过，无需重复',kind:'success'};
  return {text:'保存完成',kind:'success'};
 }
 function bounds(x,y,w,h,vw,vh) {
  const limit=(v,max)=>Math.max(Math.min(12,max),Math.min(Number.isFinite(v)?v:max-24,Math.max(0,max-12)));
  return {x:limit(x,Math.max(0,vw-w)),y:limit(y,Math.max(0,vh-h))};
 }
 if(typeof module==='object'&&module.exports){module.exports={summary,bounds};return;}
 if(window.top!==window||!document.body||document.querySelector('[data-reftray-float]'))return;
 const host=document.createElement('div');host.setAttribute('data-reftray-float','');
 const shadow=host.attachShadow({mode:'closed'});
 shadow.innerHTML=`<style>
 :host([hidden]){display:none!important}
 :host{all:initial;position:fixed;right:24px;bottom:32px;z-index:2147483646;font:15px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#17233b;color-scheme:light}
 *{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;cursor:pointer;border:0}button:focus-visible{outline:3px solid #f6ac21;outline-offset:3px}
 .bar{display:flex;align-items:stretch;height:56px;border-radius:16px;background:#2456d6;color:white;box-shadow:0 4px 20px #10254d44;border:1px solid #ffffff88;user-select:none}
 .bar button{background:transparent;color:inherit;padding:0;touch-action:none}.bar button:hover{background:#ffffff20}.bar button:disabled{cursor:wait}
 #grip{width:28px;cursor:grab;border-radius:15px 0 0 15px;font-size:22px;letter-spacing:-4px;padding-right:4px}.dragging #grip{cursor:grabbing}
 #save{display:flex;gap:10px;align-items:center;justify-content:center;min-width:128px;padding:0 12px;font-weight:650;text-align:left}
 #save svg{width:25px;height:25px;flex:none}#save strong{display:block;font-size:17px;line-height:21px}#save small{display:block;font-size:10px;letter-spacing:.8px;opacity:.85;line-height:15px}
 #more{width:44px;border-left:1px solid #ffffff40;border-radius:0 15px 15px 0;font-size:24px}
 .panel{position:absolute;right:0;bottom:calc(100% + 12px);width:min(300px,calc(100vw - 24px));padding:14px;background:#fff;border:1px solid #d9e2f3;border-radius:14px;box-shadow:0 6px 24px #10254d30;overflow:auto;max-height:calc(100vh - 90px)}
 .below{top:calc(100% + 12px);bottom:auto}.left{left:0;right:auto}
 #result{font-weight:650;font-size:15px;margin:0;color:#147345}#notice[data-kind=error] #result{color:#b3261e}#notice[data-kind=warning] #result{color:#8c5100}
 .links{display:flex;gap:14px;align-items:center;margin-top:6px}.links button{background:none;color:#2456b6;padding:5px 0;font-size:13px}.links .dismiss{margin-left:auto;color:#647087}
 #detail{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 system-ui;margin:10px 0 0;max-height:160px;overflow:auto;border-top:1px solid #e6eaf1;padding-top:10px}
 #menu{padding:6px;width:224px}#menu button{display:block;background:white;width:100%;text-align:left;padding:12px;border-radius:8px;color:#17233b}#menu button:hover{background:#edf3ff}.hint{font-size:12px;color:#637087;margin:4px 12px 8px}
 </style>
 <section class="panel" id="notice" hidden aria-label="保存结果"><p id="result" role="status" aria-live="polite"></p><div class="links"><button id="details" aria-expanded="false">详情</button><button id="records">采集记录 ↗</button><button id="dismiss" class="dismiss" aria-label="关闭保存提示">关闭</button></div><pre id="detail" hidden tabindex="0"></pre></section>
 <section class="panel" id="menu" hidden aria-label="更多操作"><button id="history">采集记录 ↗</button><button id="settings">保存设置 ↗</button><button id="reset">恢复默认位置</button><button id="hide">本页暂时隐藏</button><p class="hint">拖动左侧圆点可移动<br>刷新网页后恢复显示</p></section>
 <div class="bar"><button id="grip" title="拖动移动；方向键微调，Home复位" aria-label="移动悬浮保存；方向键微调，Home复位">⠿</button><button id="save" title="按默认设置保存当前页；按住也可拖动" aria-label="保存当前页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg><span><strong>保存</strong><small>RefTray</small></span></button><button id="more" aria-label="更多操作" aria-expanded="false">⋯</button></div>`;
 const q=s=>shadow.querySelector(s),save=q('#save'),label=q('#save strong'),grip=q('#grip'),more=q('#more'),menu=q('#menu'),notice=q('#notice'),detail=q('#detail'),details=q('#details');
 let position,drag,changedPosition=false,suppressClick=false,busy=false,autoHide,hideSuccess=false;
 function place(x,y){
  const r=host.getBoundingClientRect();position=bounds(x,y,r.width,r.height,innerWidth,innerHeight);
  Object.assign(host.style,{left:position.x+'px',top:position.y+'px',right:'auto',bottom:'auto'});
  const above=position.y-12,below=innerHeight-position.y-r.height-12;
  for(const panel of [menu,notice]){panel.classList.toggle('below',below>above);panel.classList.toggle('left',position.x<300);panel.style.maxHeight=Math.max(48,Math.max(above,below)-12)+'px';}
 }
 function closeMenu(focus=false){menu.hidden=true;more.setAttribute('aria-expanded','false');if(focus)more.focus();}
 function dismiss(focus=false){clearTimeout(autoHide);notice.hidden=true;detail.hidden=true;details.setAttribute('aria-expanded','false');if(focus)save.focus();}
 function armHide(){clearTimeout(autoHide);if(hideSuccess&&detail.hidden&&!notice.matches(':hover')&&!notice.matches(':focus-within'))autoHide=setTimeout(()=>dismiss(),5000);}
 function show(text,kind,full=''){
  clearTimeout(autoHide);closeMenu();notice.hidden=false;notice.dataset.kind=kind;q('#result').textContent=text;
  detail.textContent=full;detail.hidden=true;details.hidden=!full;details.textContent='详情';details.setAttribute('aria-expanded','false');
  hideSuccess=kind==='success';place(position?.x,position?.y);armHide();
 }
 async function remember(){
  changedPosition=true;
  try{await chrome.storage.local.set({reftrayFloatingPosition:{x:position.x/Math.max(1,innerWidth-host.offsetWidth),y:position.y/Math.max(1,innerHeight-host.offsetHeight)}});}
  catch(_){show('位置已移动，但未能记住','warning','扩展可能已更新。请刷新网页后再试。');}
 }
 function reset(){place(undefined,undefined);void remember();closeMenu(true);}
 function restore(saved){const valid=Number.isFinite(saved?.x)&&Number.isFinite(saved?.y);place(valid?saved.x*(innerWidth-host.offsetWidth):undefined,valid?saved.y*(innerHeight-host.offsetHeight):undefined);}
 document.body.append(host);place(undefined,undefined);
 chrome.storage.local.get(['reftrayFloatingEnabled','reftrayFloatingPosition']).then(values=>{host.hidden=values.reftrayFloatingEnabled===false;if(!changedPosition&&!drag)restore(values.reftrayFloatingPosition);}).catch(()=>show('请刷新网页后使用','error','扩展连接已失效，请刷新此网页。'));
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.reftrayFloatingEnabled){host.hidden=changes.reftrayFloatingEnabled.newValue===false;if(!host.hidden)place(position?.x,position?.y);}});
 window.addEventListener('resize',()=>{if(!host.hidden)place(position?.x,position?.y);});
 for(const target of [grip,save]){
  target.addEventListener('pointerdown',event=>{
   if(event.button!==0||!event.isPrimary)return;
   suppressClick=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,origin:{...position},moved:false,target};target.setPointerCapture(event.pointerId);
  });
  target.addEventListener('pointermove',event=>{
   if(!drag||event.pointerId!==drag.id)return;
   const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
   if(!drag.moved&&Math.hypot(dx,dy)<6)return;
   drag.moved=true;host.classList.add('dragging');dismiss();closeMenu();place(drag.origin.x+dx,drag.origin.y+dy);event.preventDefault();
  });
  const end=event=>{
   if(!drag||event.pointerId!==drag.id)return;
   const current=drag;drag=null;host.classList.remove('dragging');
   if(current.target.hasPointerCapture(current.id))current.target.releasePointerCapture(current.id);
   suppressClick=current.moved||event.type==='pointercancel';
   if(event.type==='pointercancel')place(current.origin.x,current.origin.y);else if(current.moved)void remember();
  };
  target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end);target.addEventListener('lostpointercapture',end);
 }
 grip.addEventListener('keydown',event=>{
  const shifts={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]};
  if(event.key==='Home'){event.preventDefault();reset();return;}
  if(!shifts[event.key])return;event.preventDefault();const [x,y]=shifts[event.key];place(position.x+x,position.y+y);void remember();
 });
 save.onclick=async event=>{
  if(event.detail!==0&&suppressClick){suppressClick=false;return;}if(busy)return;
  busy=true;save.disabled=true;save.setAttribute('aria-busy','true');label.textContent='保存中';dismiss();closeMenu();
  try{
   const reply=await chrome.runtime.sendMessage({type:'REFTRAY_QUICK_SAVE'});if(!reply?.ok)throw new Error(reply?.error||'保存未完成');
   const value=summary(reply.result),full=[reply.result?.message,reply.result?.details,...(reply.result?.warnings||[])].filter(Boolean).join('\n');show(value.text,value.kind,full||'请在采集记录中查看文件和保存位置。');
  }catch(error){const text=String(error.message||error);show(/invalidated|receiving end|context/i.test(text)?'请刷新网页后重试':'保存未完成，请查看详情','error',text);}
  finally{busy=false;save.disabled=false;save.removeAttribute('aria-busy');label.textContent='保存';}
 };
 more.onclick=()=>{const open=menu.hidden;dismiss();menu.hidden=!open;more.setAttribute('aria-expanded',String(open));if(open){place(position?.x,position?.y);q('#history').focus();}};
 details.onclick=()=>{detail.hidden=!detail.hidden;details.setAttribute('aria-expanded',String(!detail.hidden));details.textContent=detail.hidden?'详情':'收起详情';clearTimeout(autoHide);if(detail.hidden)armHide();};
 q('#dismiss').onclick=()=>dismiss(true);
 for(const event of ['pointerenter','focusin'])notice.addEventListener(event,()=>clearTimeout(autoHide));
 for(const event of ['pointerleave','focusout'])notice.addEventListener(event,()=>setTimeout(armHide,0));
 const openManage=async section=>{
  try{const reply=await chrome.runtime.sendMessage({type:'REFTRAY_OPEN_MANAGE',section});if(!reply?.ok)throw new Error(reply?.error||'无法打开管理页');closeMenu(true);}
  catch(error){show('无法打开，请刷新网页后重试','error',error.message);}
 };
 q('#history').onclick=q('#records').onclick=()=>openManage('history');q('#settings').onclick=()=>openManage('defaults');
 q('#reset').onclick=reset;q('#hide').onclick=()=>{dismiss();closeMenu();host.hidden=true;};
 shadow.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!menu.hidden)closeMenu(true);else if(!notice.hidden)dismiss(true);event.stopPropagation();}});
 document.addEventListener('pointerdown',event=>{if(!event.composedPath().includes(host))closeMenu();},true);
})();
