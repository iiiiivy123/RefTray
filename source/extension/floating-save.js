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
  return {x:limit(x,Math.max(0,vw-w)),y:limit(Number.isFinite(y)?y:96,Math.max(0,vh-h))};
 }
 function progressView(p={},samples=[],lastAdvance=Date.now(),now=Date.now()){
  const transfer=p.transfer||{},downloading=p.stage==='downloading',stopping=p.status==='stopping';
  const percent=downloading&&Number.isFinite(p.percent)?Math.max(0,Math.min(100,p.percent)):null;
  const waiting=!stopping&&(now-(p.updatedAt||lastAdvance)>=20000 || ['downloading','connecting','checking','resolving'].includes(p.stage)&&now-lastAdvance>=20000);
  const stage=stopping?'停止中':p.status==='paused'?'已暂停':downloading?'下载':p.stage==='resolving'?'识别中':p.stage==='connecting'||p.stage==='checking'?'连接中':p.stage==='saving'||p.status==='completed'?'保存记录':p.stage==='processing'?(/合并/.test(p.message||'')?'合并中':/字幕|Markdown/.test(p.message||'')?'生成字幕':'整理中'):'识别中';
  const size=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':(n/1048576).toFixed(1)+' MB';
  const bytes=Number.isFinite(transfer.bytes)?transfer.bytes:p.bytes,total=Number.isFinite(transfer.total)?transfer.total:p.total;
  const amount=downloading&&Number.isFinite(bytes)?size(bytes)+(Number.isFinite(total)&&total>0?' / '+size(total):' · 总大小未知'):'';
  const recent=samples.filter(s=>now-s.time<=6000),first=recent[0],last=recent.at(-1);
  const speed=downloading&&!waiting&&first&&last&&last.time>first.time&&last.bytes>=first.bytes?(last.bytes-first.bytes)/((last.time-first.time)/1000):null;
  return {label:waiting?'等待响应':stage+(percent!==null?' '+Math.floor(percent)+'%':''),stage,percent,amount,
   speed:Number.isFinite(speed)?size(speed)+'/s':'',waiting,
   detail:waiting?'暂时没有新进展，正在等待响应':stopping?'正在结束当前操作，已保存文件保留':transfer.tracks>1?`当前轨道 ${transfer.track}/${transfer.tracks}`:p.stage==='processing'?'下载完成，正在处理文件':p.stage==='saving'?'正在写入来源和采集记录':''};
 }
 if(typeof module==='object'&&module.exports){module.exports={summary,bounds,progressView};return;}
 if(window.top!==window||!document.body||document.querySelector('[data-reftray-float]'))return;
 const host=document.createElement('div');host.setAttribute('data-reftray-float','');
 const shadow=host.attachShadow({mode:'closed'});
 shadow.innerHTML=`<style>
:host([hidden]){display:none!important}:host{all:initial;position:fixed;right:24px;top:96px;z-index:2147483646;font:13px/1.6 system-ui,"Microsoft YaHei",sans-serif;color:#242424;color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}button,select{font:inherit;color:inherit}button{cursor:pointer}button:focus-visible,select:focus-visible{outline:2px solid #4f6052;outline-offset:2px}svg{display:block;width:16px;height:16px;flex:none}
.bar{width:112px;height:48px;user-select:none}#save{width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:9px;background:#242424;color:#fff;border:1px solid #242424;border-radius:3px;padding:0 15px;box-shadow:0 2px 7px #00000014;touch-action:none}#save:hover{background:#40403d}#save strong{font-size:14px;font-weight:550;white-space:nowrap;letter-spacing:.025em}#save .mark{width:18px;height:21px}#save[aria-busy=true]{cursor:progress}.dragging #save{cursor:grabbing}
.ring{width:20px;height:20px;transform:rotate(-90deg)}.ring circle{fill:none;stroke:currentColor;stroke-width:1.5}.ring .track{opacity:.25}.ring .value{stroke-linecap:round;stroke-dasharray:50.27;transition:stroke-dashoffset .2s}.indeterminate{animation:turn 1s linear infinite}.indeterminate .value{stroke-dasharray:15 36}@keyframes turn{to{transform:rotate(270deg)}}
.panel{position:absolute;right:0;bottom:calc(100% + 6px);max-width:calc(100vw - 24px);background:#f1f0ec;border:1px solid #d2d0c9;border-radius:3px;box-shadow:0 2px 7px #00000014;max-height:calc(100vh - 72px);overflow:auto}.below{top:calc(100% + 6px);bottom:auto}.left{left:0;right:auto}#menu{width:240px}.context{padding:9px 12px 7px;color:#696864;font-size:11px}.context strong{font-weight:500}.context span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}
.row{display:flex;align-items:center;gap:8px;border:0;border-top:1px solid #d7d5cf;background:none;width:100%;min-height:38px;padding:7px 12px;text-align:left;font-size:12px}.row:hover,.subnav button:hover{background:#e5e4df}.subnav{border-top:1px solid #d7d5cf;display:flex;align-items:center;justify-content:space-between;padding:3px 8px;gap:6px}.subnav span{font-size:10px;color:#696864}.subnav button{background:none;border:0;font-size:15px;padding:2px 8px}.empty{font-size:11px;color:#696864;padding:7px 12px;margin:0;border-top:1px solid #d7d5cf}#tools .row{min-height:34px;font-size:11px}#grip{cursor:move;touch-action:none}#options-panel{border-top:1px solid #d7d5cf;padding:12px}#options-panel label{display:grid;gap:7px;font-size:12px}select{background:#fff;border:1px solid #d7d5cf;border-radius:2px;padding:7px;width:100%}.actions{display:flex;justify-content:flex-end;gap:7px;margin-top:12px}.actions button{border:1px solid #d7d5cf;background:#fff;border-radius:3px;padding:6px 10px}.actions .go{background:#242424;border-color:#242424;color:#fff}
#notice{width:max-content;min-width:112px;max-width:min(330px,calc(100vw - 24px))}.status-row{display:flex;align-items:center;flex-wrap:wrap;gap:0}#result{font-size:12px;font-weight:500;padding:8px 10px;margin:0;overflow-wrap:anywhere}#notice[data-kind=error] #result{color:#793f38}#notice[data-kind=warning] #result{color:#795b2e}.status-row button{background:none;border:0;border-left:1px solid #d7d5cf;min-height:36px;padding:6px 9px;font-size:12px}.status-row button:hover{background:#e5e4df}#current{display:flex;align-items:center;gap:5px}#dismiss{margin-left:auto;color:#696864}.links{display:flex;gap:12px;padding:0 10px 7px}.links button{background:none;border:0;font-size:11px;padding:0;color:#696864}#detail{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 system-ui;margin:0;padding:10px;max-height:180px;overflow:auto;border-top:1px solid #d7d5cf}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
#save[aria-busy=true]{padding:0 9px;gap:6px}#save[aria-busy=true] strong{font-size:12px}#progress-panel{width:240px;padding:12px}.progress-heading{display:flex;justify-content:space-between;align-items:center;font-size:12px}.progress-heading button{border:0;background:none;color:#696864;padding:0 0 0 10px}#progress-bar{display:block;width:100%;height:5px;margin:10px 0;accent-color:#4f6052}#progress-amount{font-size:12px;font-variant-numeric:tabular-nums}#progress-detail{font-size:11px;color:#696864;min-height:18px;margin:4px 0 0}#stop{width:100%;margin-top:9px;padding:6px;background:transparent;border:1px solid #c9c6be;border-radius:2px;font-size:12px}#stop:disabled{cursor:wait;color:#777}
</style>
<section class="panel" id="progress-panel" hidden aria-label="保存进度"><div class="progress-heading"><strong id="progress-stage" role="status" aria-live="polite">识别中</strong><button id="close-progress" aria-label="收起保存进度">×</button></div><progress id="progress-bar" max="100" aria-label="当前下载进度"></progress><div id="progress-amount"></div><p id="progress-detail"></p><button id="stop">停止保存</button></section>
<section class="panel" id="notice" hidden aria-label="保存结果"><div class="status-row"><p id="result" role="status" aria-live="polite"></p><button id="current" hidden title="打开本次保存文件夹">打开文件夹</button><button id="retry" hidden>重试</button><button id="dismiss" aria-label="关闭保存提示">×</button></div><div class="links" id="result-links" hidden><button id="details" aria-expanded="false">详情</button><button id="records">采集记录 ↗</button></div><pre id="detail" hidden tabindex="0"></pre></section>
<section class="panel" id="menu" hidden aria-label="保存选项"><div class="context"><strong id="context-mode">自动识别 · 默认设置</strong><span id="context-folder">正在读取保存位置…</span></div><div id="menu-actions"><button class="row" id="options"><svg viewBox="0 0 20 20"><path d="M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-5 1v4" fill="none" stroke="currentColor" stroke-width="1.25"/></svg>本次保存选项…</button><button class="row" id="recent" hidden><svg viewBox="0 0 20 20"><path d="M2.5 5.5h6l1.8 2h7.2v9h-15z" fill="none" stroke="currentColor"/></svg>打开最近保存的文件夹</button><p class="empty" id="empty">还没有保存记录</p><div class="subnav"><span>拖动按钮可移动 · 记住位置</span><button id="more" aria-label="更多操作" aria-expanded="false">⋯</button></div><div id="tools" hidden><button class="row" id="history">采集记录 ↗</button><button class="row" id="settings">默认设置 ↗</button><button class="row" id="library">打开素材库 ↗</button><button class="row" id="grip" title="方向键移动，Home恢复右上方">移动位置 · 方向键微调</button><button class="row" id="reset">恢复右上方位置</button><button class="row" id="hide">本页暂时隐藏</button></div></div><div id="options-panel" hidden><label>本次保存内容<select id="choice"><option value="auto">自动识别（默认）</option><option value="text">图文笔记</option><option value="images">仅图片 / GIF</option><option value="plain">仅正文</option><option value="video">视频</option></select></label><div class="actions"><button id="cancel-options">取消</button><button id="save-options" class="go">按本次选项保存</button></div></div></section>
<div class="bar"><button id="save" title="保存当前页 · 拖动移动 · ↓ 打开选项" aria-label="保存当前页"><svg class="mark" id="brand" viewBox="0 0 29 32" aria-hidden="true"><path d="m14.5 2 12 7.5v3L14.5 20l-12-7.5v-3zM2.5 20l12 7.5 12-7.5M2.5 20v3l12 7.5 12-7.5v-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg><svg id="ring" class="ring indeterminate" viewBox="0 0 20 20" hidden aria-hidden="true"><circle class="track" cx="10" cy="10" r="8"/><circle id="ring-value" class="value" cx="10" cy="10" r="8"/></svg><strong>保存</strong></button></div>`;
 const q=s=>shadow.querySelector(s),save=q('#save'),label=q('#save strong'),grip=q('#grip'),more=q('#more'),menu=q('#menu'),notice=q('#notice'),detail=q('#detail'),details=q('#details');
 let position,drag,changedPosition=false,suppressClick=false,busy=false,autoHide,hideSuccess=false,hoverOpen,hoverClose,pinned=false,contextLoading=false;
 let floatingEnabled=true,floatingSites={};
 let currentId=null,recentId=null,lastChoice='auto',retrySave=false,requestId=null,sequence=0;
 let progress={},samples=[],lastAdvance=0,progressKey='',progressTimer,stopRequested=false,controlError='';
 const progressPanel=q('#progress-panel');
 function renderProgress(){
  const view=progressView(progress,samples,lastAdvance);label.textContent=view.label;save.setAttribute('aria-label',view.label+'，点击查看进度');
  q('#ring').classList.toggle('indeterminate',view.percent===null);if(view.percent!==null)q('#ring-value').style.strokeDashoffset=50.27*(1-view.percent/100);
  q('#progress-stage').textContent=view.label;q('#progress-amount').textContent=[view.amount,view.speed].filter(Boolean).join(' · ');q('#progress-detail').textContent=controlError||view.detail;
  if(view.percent===null)q('#progress-bar').removeAttribute('value');else q('#progress-bar').value=view.percent;
 }
 function receiveProgress(p){
  const now=Date.now(),transfer=p.transfer||{},bytes=Number.isFinite(transfer.bytes)?transfer.bytes:p.bytes;
  const key=JSON.stringify([p.stage,bytes,p.percent,transfer.track,p.message,p.status]);if(key!==progressKey){lastAdvance=now;progressKey=key;}
  if(p.stage!==progress.stage||transfer.track!==progress.transfer?.track||bytes<(samples.at(-1)?.bytes??0))samples=[];
  if(p.stage==='downloading'&&Number.isFinite(bytes)){samples.push({time:now,bytes});samples=samples.filter(s=>now-s.time<=6000).slice(-12);}
  progress=stopRequested?{...p,status:'stopping'}:p;renderProgress();
 }
 function openProgress(keep=false){clearTimeout(hoverClose);closeMenu();progressPanel.hidden=false;pinned=keep;renderProgress();place(position?.x,position?.y);}
 function watchProgress(){if(!busy)return;renderProgress();progressTimer=setTimeout(watchProgress,1000);}
 function place(x,y){
  const r=host.getBoundingClientRect();position=bounds(x,y,r.width,r.height,innerWidth,innerHeight);
  Object.assign(host.style,{left:position.x+'px',top:position.y+'px',right:'auto',bottom:'auto'});
  const above=position.y-12,below=innerHeight-position.y-r.height-12;
  for(const panel of [menu,notice,progressPanel]){panel.classList.toggle('below',below>above);const width=panel.offsetWidth||Math.min(240,innerWidth-24),left=Math.max(12,Math.min(position.x+r.width-width,innerWidth-width-12));panel.style.left=(left-position.x)+'px';panel.style.right='auto';panel.style.maxHeight=Math.max(48,Math.max(above,below)-12)+'px';}
 }
 function closeMenu(focus=false){clearTimeout(hoverOpen);clearTimeout(hoverClose);pinned=false;menu.hidden=true;q('#tools').hidden=true;q('#options-panel').hidden=true;q('#menu-actions').hidden=false;more.setAttribute('aria-expanded','false');if(focus)save.focus();}
 async function openMenu(focus=false,keep=false){
  clearTimeout(hoverClose);if(drag)return;if(busy){openProgress(keep);return;}if(!keep&&!notice.hidden)return;
  if(keep)dismiss();menu.hidden=false;pinned=keep;place(position?.x,position?.y);if(focus)q('#options').focus();
  if(contextLoading)return;contextLoading=true;
  q('#context-mode').textContent='正在读取保存方式…';q('#context-folder').textContent='';q('#context-folder').title='';
  recentId=null;q('#recent').hidden=true;q('#empty').hidden=true;
  try{const reply=await chrome.runtime.sendMessage({type:'REFTRAY_FLOATING_CONTEXT'});if(!reply?.ok)throw new Error(reply?.error||'扩展连接已失效，请刷新网页');
   q('#context-mode').textContent=reply.context.mode;const path=reply.context.directory||'';q('#context-folder').textContent='素材库：'+(path.split(/[\\/]/).filter(Boolean).pop()||'尚未设置');q('#context-folder').title=path;
   recentId=reply.context.latest?.id||null;q('#recent').hidden=!recentId;q('#empty').hidden=Boolean(recentId);q('#recent').title=reply.context.latest?.directory||'';
  }catch(error){q('#context-mode').textContent='暂时无法读取保存方式';q('#context-folder').textContent=error.message.slice(0,160);q('#context-folder').title=error.message;}
  finally{contextLoading=false;}
 }
 function dismiss(focus=false){clearTimeout(autoHide);notice.hidden=true;detail.hidden=true;details.setAttribute('aria-expanded','false');if(!busy){label.textContent='保存';retrySave=false;}if(focus)save.focus();}
 function armHide(){clearTimeout(autoHide);if(hideSuccess&&detail.hidden&&!notice.matches(':hover')&&!notice.matches(':focus-within'))autoHide=setTimeout(()=>dismiss(),5000);}
 function show(text,kind,full=''){
  clearTimeout(autoHide);closeMenu();notice.hidden=false;notice.dataset.kind=kind;q('#result').textContent=text;
  detail.textContent=full;detail.hidden=true;details.hidden=!full;details.textContent='详情';details.setAttribute('aria-expanded','false');
  q('#result-links').hidden=kind==='success';q('#current').hidden=true;q('#retry').hidden=true;
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
 const visibility=()=>{host.hidden=!floatingEnabled||floatingSites[location.origin]===false;if(host.hidden){dismiss();closeMenu();}else place(position?.x,position?.y);};
 chrome.storage.local.get(['reftrayFloatingEnabled','reftrayFloatingPosition','reftrayFloatingSites']).then(values=>{floatingEnabled=values.reftrayFloatingEnabled!==false;floatingSites=values.reftrayFloatingSites||{};visibility();if(!changedPosition&&!drag)restore(values.reftrayFloatingPosition);}).catch(()=>show('请刷新网页后使用','error','扩展连接已失效，请刷新此网页。'));
 chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.reftrayFloatingEnabled)floatingEnabled=changes.reftrayFloatingEnabled.newValue!==false;if(changes.reftrayFloatingSites)floatingSites=changes.reftrayFloatingSites.newValue||{};if(changes.reftrayFloatingEnabled||changes.reftrayFloatingSites)visibility();const p=changes.liblibProgress?.newValue;if(busy&&requestId&&p?.context?.quickRequestId===requestId)receiveProgress(p);});
 host.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;clearTimeout(hoverClose);if(menu.hidden&&!drag&&notice.hidden)hoverOpen=setTimeout(()=>openMenu(),350);});
 host.addEventListener('pointerleave',()=>{clearTimeout(hoverOpen);if(!pinned)hoverClose=setTimeout(()=>{if(!menu.matches(':focus-within')&&!progressPanel.matches(':focus-within')){closeMenu();progressPanel.hidden=true;}},250);});
 window.addEventListener('resize',()=>{if(!host.hidden)place(position?.x,position?.y);});
 for(const target of [grip,save]){
  target.addEventListener('pointerdown',event=>{
   if(event.button!==0||!event.isPrimary)return;
   clearTimeout(hoverOpen);clearTimeout(hoverClose);
   suppressClick=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,origin:{...position},moved:false,target};target.setPointerCapture(event.pointerId);
  });
  target.addEventListener('pointermove',event=>{
   if(!drag||event.pointerId!==drag.id)return;
   const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
   if(!drag.moved&&Math.hypot(dx,dy)<6)return;
   drag.moved=true;host.classList.add('dragging');dismiss();closeMenu();progressPanel.hidden=true;place(drag.origin.x+dx,drag.origin.y+dy);event.preventDefault();
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
 async function runSave(choice='auto'){
  if(busy){openProgress(true);return;}
  busy=true;lastChoice=choice;requestId='quick-'+Date.now()+'-'+(++sequence);save.setAttribute('aria-busy','true');label.textContent='识别中';q('#brand').hidden=true;q('#ring').hidden=false;q('#ring').classList.add('indeterminate');dismiss();closeMenu();currentId=null;
  progressPanel.hidden=true;samples=[];stopRequested=false;controlError='';q('#stop').disabled=false;q('#stop').textContent='停止保存';progressKey='';lastAdvance=Date.now();receiveProgress({stage:'resolving'});watchProgress();
  try{
   const reply=await chrome.runtime.sendMessage({type:'REFTRAY_QUICK_SAVE',choice,requestId});if(!reply?.ok)throw new Error(reply?.error||'保存未完成');
   const value=summary(reply.result),full=[reply.result?.message,reply.result?.details,reply.result?.folderWarning,...(reply.result?.warnings||[])].filter(Boolean).join('\n');show(value.text,value.kind,full||'请在采集记录中查看文件和保存位置。');
   currentId=reply.result?.captureId||null;q('#current').hidden=!currentId;retrySave=value.kind==='error';q('#retry').hidden=!retrySave;label.textContent=retrySave?'重试':value.kind==='success'?'已保存':'保存';
   if(reply.result?.folderWarning)q('#result-links').hidden=false;
   place(position?.x,position?.y);
  }catch(error){const text=String(error.message||error),stopped=text==='USER_STOPPED';show(stopped?'已停止保存':/invalidated|receiving end|context/i.test(text)?'请刷新网页后重试':'保存失败',stopped?'warning':'error',stopped?'已保存文件保留。':text);retrySave=!stopped;q('#retry').hidden=stopped;label.textContent=stopped?'保存':'重试';}
  finally{busy=false;clearTimeout(progressTimer);progressPanel.hidden=true;save.removeAttribute('aria-busy');save.setAttribute('aria-label','保存当前页');q('#brand').hidden=false;q('#ring').hidden=true;}
 }
 q('#close-progress').onclick=()=>{progressPanel.hidden=true;pinned=false;save.focus();};
 q('#stop').onclick=async()=>{
  if(!busy||stopRequested)return;stopRequested=true;controlError='';q('#stop').disabled=true;q('#stop').textContent='正在停止…';receiveProgress({...progress,status:'stopping'});
  try{const reply=await chrome.runtime.sendMessage({type:'REFTRAY_QUICK_STOP',requestId});if(!reply?.ok)throw Error(reply?.error||'停止请求未送达');}
  catch(error){stopRequested=false;progress={...progress,status:'running'};controlError=String(error.message||error);q('#stop').disabled=false;q('#stop').textContent='重试停止';renderProgress();}
 };
 save.onclick=event=>{
  if(event.detail!==0&&suppressClick){suppressClick=false;return;}return runSave(retrySave?lastChoice:'auto');
 };
 save.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();void openMenu(true,true);}});
 more.onclick=()=>{if(menu.hidden){void openMenu(true,true);return;}q('#tools').hidden=!q('#tools').hidden;pinned=!q('#tools').hidden;more.setAttribute('aria-expanded',String(pinned));place(position?.x,position?.y);};
 q('#options').onclick=()=>{pinned=true;q('#menu-actions').hidden=true;q('#options-panel').hidden=false;q('#choice').value='auto';q('#choice').focus();place(position?.x,position?.y);};
 q('#cancel-options').onclick=()=>{q('#options-panel').hidden=true;q('#menu-actions').hidden=false;q('#options').focus();};
 q('#save-options').onclick=()=>runSave(q('#choice').value);q('#retry').onclick=()=>runSave(lastChoice);
 details.onclick=()=>{detail.hidden=!detail.hidden;details.setAttribute('aria-expanded',String(!detail.hidden));details.textContent=detail.hidden?'详情':'收起详情';clearTimeout(autoHide);if(detail.hidden)armHide();};
 q('#dismiss').onclick=()=>dismiss(true);
 for(const event of ['pointerenter','focusin'])notice.addEventListener(event,()=>clearTimeout(autoHide));
 for(const event of ['pointerleave','focusout'])notice.addEventListener(event,()=>setTimeout(armHide,0));
 const openManage=async section=>{
  try{const reply=await chrome.runtime.sendMessage({type:'REFTRAY_OPEN_MANAGE',section});if(!reply?.ok)throw new Error(reply?.error||'无法打开管理页');closeMenu(true);}
  catch(error){show('无法打开，请刷新网页后重试','error',error.message);}
 };
 q('#history').onclick=q('#records').onclick=()=>openManage('history');q('#settings').onclick=()=>openManage('defaults');
 q('#library').onclick=async()=>{try{const reply=await chrome.runtime.sendMessage({type:'REFTRAY_OPEN_LIBRARY'});if(!reply?.ok)throw new Error(reply?.error||'素材库未打开');closeMenu(true);}catch(e){show('未能打开素材库','error',e.message);}};
 const openSaved=async id=>{try{const reply=await chrome.runtime.sendMessage({type:'REFTRAY_OPEN_SAVED',captureId:id});if(!reply?.ok)throw new Error(reply?.error||'保存目录未打开');closeMenu(true);}catch(e){show('未能打开保存目录','error',e.message);}};
 q('#recent').onclick=()=>openSaved(recentId);q('#current').onclick=()=>openSaved(currentId);
 q('#reset').onclick=reset;q('#hide').onclick=()=>{dismiss();closeMenu();host.hidden=true;};
 shadow.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!progressPanel.hidden){progressPanel.hidden=true;pinned=false;save.focus();}else if(!menu.hidden)closeMenu(true);else if(!notice.hidden)dismiss(true);event.stopPropagation();}});
 document.addEventListener('pointerdown',event=>{if(!event.composedPath().includes(host)){closeMenu();progressPanel.hidden=true;}},true);
})();
