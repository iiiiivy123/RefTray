const BUILD=Hub.BUILD,q=s=>document.querySelector(s),t=s=>globalThis.UI?.t(s)||s;
let defaults,site,currentTab,defaultPath='',active=false,ready=false,videoMode='download',control='running',resumeOptions=null,checkpoint=null,secondary=false,approval=false,picking=false,folderBefore='',requestedPolicy=null;
const error=e=>{if(!ready)q('#version').textContent=t('后台核验未完成');UI.feedback(q('#status'),e.message||String(e));q('#status').dataset.state='failed';q('#diagnostic-text').textContent=e.message||String(e);if(q('#task-result-summary'))q('#task-result-summary').textContent=e.message||String(e);globalThis.PopupPresentation?.paint({status:'failed',message:e.message||String(e)},false);};
const guarded=fn=>async(...args)=>{try{await fn(...args);}catch(e){error(e);}};
const isVideo=()=>['video','audio'].includes(q('#collection-mode').value);
const isAudio=()=>q('#collection-mode').value==='audio';
let modePreferences={},defaultsGeneration=0,manualSelection=0;
function showSecondary(value){secondary=false;q('#advanced-options').open=value;render();if(value)q('#frame-options').scrollIntoView({block:'nearest'});}
function render(){
 if(!defaults||!site)return;
 if(!resumeOptions&&site.mode==='video'&&!isVideo())q('#collection-mode').value='video';
 if(!resumeOptions&&site.mode==='text'&&isVideo())q('#collection-mode').value='text';
 for(const option of q('#collection-mode').options){option.disabled=site.mode==='video'?!['video','audio'].includes(option.value):site.mode==='text'&&['video','audio'].includes(option.value);option.hidden=option.disabled;}
 const video=isVideo(),plain=q('#collection-mode').value==='plain',text=plain||q('#collection-mode').value==='text';
 q('#quality-row').hidden=q('#quality-help').hidden=!video||isAudio()||!['B站','YouTube'].includes(site.site);q('#subtitle-row').hidden=!video||isAudio();q('#trim-options').hidden=!video;
 if(isAudio())videoMode='download';
 if(video&&q('#subtitle-mode').value==='only')videoMode='download';
 const allowed=Boolean(site.bulk)&&(!text||['小红书','X','Instagram','B站','ArtStation'].includes(site.site))&&(!video||['小红书','X','Instagram','Pinterest','B站','YouTube'].includes(site.site));
 if(!resumeOptions){
   if(!allowed)q('#scope').value='current';
   else if(site.single===false)q('#scope').value='bulk';
 }
 const bulk=q('#scope').value==='bulk';
 for(const option of q('#collection-mode').options)if(['video','audio'].includes(option.value))option.textContent=t((bulk?'仅':'')+(option.value==='video'?'视频':'音频'));
 q('#subtitle-help').hidden=!video||isAudio()||q('#subtitle-mode').value==='none';
 q('#subtitle-language-row').hidden=site.site!=='YouTube';
 q('#scope-bulk').disabled=!allowed||Boolean(resumeOptions);q('#scope-current').disabled=site.single===false||Boolean(resumeOptions);
 for(const s of ['current','bulk'])q('#scope-'+s).setAttribute('aria-pressed',String(q('#scope').value===s));
 q('#main-options').hidden=false;q('#secondary-options').hidden=false;
 q('#quota-help').textContent=site.site==='YouTube'?t('按当前列表顺序处理；重复和失败条目也计入本次数量。'):t('按视频计数；图片帖跳过。重复和失败的视频占额度；最多扫描500篇。');
 q('#video-tools').hidden=!video||isAudio();q('#limit-row').hidden=!bulk;q('#quota-help').hidden=!video||!bulk;
 q('#text-options').hidden=!text;q('#skip-gifs-option').hidden=video||plain;q('#filters-row').hidden=video||plain;q('#text-attachments-row').hidden=!text||plain;q('#attachment-row').hidden=(!bulk&&site.site!=='Instagram')||video||plain||(site.site==='B站'&&site.mode==='text');
 q('#skip-video-option').hidden=q('#attachment-row').hidden; q('#skip-video').checked=q('#video-action').value==='skip';
 q('#include-comments').parentElement.hidden=plain;q('#ocr-enabled').parentElement.hidden=plain;q('#plain-comments-option').hidden=!plain;
 q('#frame-options').hidden=plain|| (video?videoMode==='download':q('#video-action').value!=='frames');
 q('#more-options').hidden=q('#frame-options').hidden;
 q('#batch-range').hidden=!bulk;q('#duration-filter').hidden=!bulk||!video;q('#download-limit-row').hidden=plain;
 q('#include-images-option').hidden=!text||plain;
 q('#collect-video').hidden=!video||isAudio()||bulk||site.site==='B站';
 q('#limit-label').textContent=t(video?'视频数量上限':'本次最多处理');
 q('#mode-help').textContent=bulk?site.site+' · '+t(site.hint||''):t(text?'正文与图片文字整理为 Markdown':video?'只处理视频，不保存图片帖':'保存当前作品图片');
 q('#task-options').disabled=!ready||active;
 for(const input of q('#task-options').querySelectorAll('input,select'))input.disabled=Boolean(resumeOptions);
 q('#save-video').disabled=Boolean(resumeOptions);q('#download-frames').disabled=Boolean(resumeOptions)||q('#subtitle-mode').value==='only';
 q('#choose-folder').disabled=Boolean(resumeOptions);q('#choose-folder-more').disabled=Boolean(resumeOptions)||picking;
 q('#default-path').disabled=q('#collect-video').disabled=Boolean(resumeOptions);
 q('#save-video').setAttribute('aria-pressed',String(videoMode==='download'));
 q('#download-frames').setAttribute('aria-pressed',String(videoMode==='download-frames'));
 q('#controls').hidden=!active||approval;q('#pause').textContent=t(control==='paused'?'继续':'暂停');
 q('#pause').disabled=q('#stop').disabled=control==='stopped';
 q('#reset').hidden=!active;q('#start').hidden=active||approval;
 const unsupported=bulk?!site.bulk:site.single===false;
 q('#start').disabled=!ready||active||picking||unsupported;
 q('#only-cover').hidden=site.site!=='B站'||site.mode!=='video'||!site.single||bulk;q('#only-cover').disabled=!ready||active||picking||Boolean(resumeOptions);
 if(unsupported)q('#mode-help').textContent=t(site.reason||'此处无法采集，请打开作品详情页或作者列表。');
 q('#start').textContent=t(secondary?'返回采集':resumeOptions?'继续未完成任务':video?(bulk?'扫描视频并估算大小':videoMode==='video'?'仅抽帧':'检查视频并估算大小'):'开始采集');
 if(plain)q('#mode-help').textContent=t('只保存 MD；不下载图片、视频或识别图片文字');
 if(isAudio())q('#mode-help').textContent='只提取音频（M4A），不生成字幕或 MD。';
 if(isAudio()&&!active)q('#start').textContent=secondary?'返回采集':resumeOptions?'继续未完成任务':'检查音轨并估算大小';
 const kind=plain?t('纯文字 · Markdown'):video?t(videoMode==='download'?'视频':videoMode==='video'?'仅抽帧':'视频抽帧'):t(text?'图文笔记':'图片');
 const summary=[bulk?t('批量保存'):t('保存此页'),isAudio()?'音频':kind,...(bulk?[q('#batch-limit').value+' '+t(video?'个视频':'篇')]:[])].join(' · ');
 q('#summary').textContent=summary;q('#summary').title=summary;
 const policy={fill:'自动去重补齐',skip:'跳过已有',refresh:'重新读取原帖'}[q('#duplicate-policy').value];
 q('#options-summary').textContent=[t(policy),...(text?[t(q('#ocr-enabled').checked?'OCR 开':'OCR 关'),t(q('#include-comments').checked?'评论 开':'评论 关')]:[]),...(video&&videoMode==='download-frames'?[t('抽帧参数可调整')]:[])].join(' · ');
 q('#duplicate-help').textContent=t({fill:'检查本地文件并补齐缺失；相同内容不重复保存。',skip:'旧任务沿用跳过已有策略。',refresh:'重新读取原帖；同一目录复用，保留手动编辑内容。'}[q('#duplicate-policy').value]);
 q('#advanced-summary').textContent=t(policy);
 const destination=effectiveFolder();q('#save-path').textContent=destination;q('#save-path').title=destination;
 q('#default-path').hidden=!q('#task-destination').value.trim();
 q('#destination-label').textContent=t(q('#task-destination').value.trim()?'仅本次另存':'使用默认目录');
 q('#recovery').hidden=active||!checkpoint||checkpoint.completed;q('#resume-help').hidden=!resumeOptions;q('#resume-task').disabled=active;
 globalThis.refreshSelects?.();
}
function effectiveFolder(){
 const root=q('#task-destination').value.trim()||defaultPath;
 const category=q('#scope').value==='bulk'?'批量':isVideo()?'视频':['text','plain'].includes(q('#collection-mode').value)?'图文':'图片';
 const flat=q('#scope').value!=='bulk'&&defaults?.layout==='organized_flat';
 return root.replace(/[\\/]+$/,'')+'\\'+category+(flat?'':'\\'+(site?.site==='网页'?'其他网页':site?.site||'其他网页'));
}
function options(){
 if(resumeOptions)return {...resumeOptions,resume:true};
 const video=isVideo(),plain=q('#collection-mode').value==='plain',bulk=q('#scope').value==='bulk',frames=!plain&&(video?videoMode!=='download':q('#video-action').value==='frames');
 const attachment=(bulk||site.site==='Instagram')&&!(site.site==='B站'&&site.mode==='text')?q('#video-action').value:'skip';
 const limit=bulk?Number(q('#batch-limit').value):defaults.limit,interval=frames?Number(q('#video-interval').value):defaults.interval;
 if(bulk&&(!Number.isInteger(limit)||limit<1||limit>500)){showSecondary(false);q('#batch-limit').focus();throw new Error('数量请填写 1–500。');}
 if(frames&&(!Number.isFinite(interval)||interval<0.5||interval>60)){showSecondary(true);q('#video-interval').focus();throw new Error('采样间隔应为 0.5–60 秒');}
 const trim_start=video?Number(q('#trim-start').value):0,trim_end=video?Number(q('#trim-end').value):0;
 if([trim_start,trim_end].some(n=>!Number.isFinite(n)||n<0||n>86400))throw new Error('剪裁时间请填写0–86400秒');
 const max_video_mb=Math.ceil(Number(q('#download-limit').value)*(q('#download-unit').value==='GB'?1024:1));
 const skip_posts=bulk?Number(q('#skip-posts').value):0,min_duration=bulk&&video?Number(q('#min-duration').value):0,max_duration=bulk&&video?Number(q('#max-duration').value):0;
 if(!Number.isFinite(max_video_mb)||max_video_mb<1||max_video_mb>1048576)throw new Error('单个下载上限应为1 MB–1024 GB');
 if(!Number.isInteger(skip_posts)||skip_posts<0||skip_posts>499)throw new Error('跳过篇数请填写0–499');
 if([min_duration,max_duration].some(n=>!Number.isFinite(n)||n<0||n>86400)||max_duration&&min_duration>max_duration)throw new Error('时长范围请填写0–86400秒，最短不能大于最长');
 const comment_limit=Number(q('#comment-limit').value);if(!Number.isInteger(comment_limit)||comment_limit<1||comment_limit>100)throw new Error('评论条数请填写1–100');
 return Hub.options({...defaults,comment_limit,max_video_mb,min_free_mb:0,skip_posts,min_duration,max_duration,max_images:defaults.max_images||0,output_format:isAudio()?'audio':'original',trim_start,trim_end,skip_gifs:q('#skip-gifs').checked,video_quality:['B站','YouTube'].includes(site.site)?q('#video-quality').value:'best',subtitle_language:'auto',subtitle_mode:isAudio()?'none':video?q('#subtitle-mode').value:attachment==='skip'?'none':'with_video',md_only:plain,collection_mode:plain?'text':video?'images':q('#collection-mode').value,video_only:video&&bulk,limit,video_action:video?(videoMode==='download'?'save':'frames'):attachment,capture_scope:bulk?'batch':'single',capture_kind:plain?'text':video?'video':q('#collection-mode').value,duplicate_policy:requestedPolicy||q('#duplicate-policy').value,include_images:!video&&!plain&&(q('#collection-mode').value!=='text'||q('#include-images').checked),include_comments:plain?q('#plain-comments').checked:!video&&q('#include-comments').checked,plain_comments:q('#plain-comments').checked,ocr_enabled:!plain&&q('#ocr-enabled').checked,strategy:q('#video-strategy').value,interval,destination:q('#task-destination').value.trim()||null,resume:false});
}
async function start(coverOnly=false){
 if(!ready||active||q('#start').disabled)return;const now=await chrome.tabs.get(currentTab.id);if(now.url!==currentTab.url)throw new Error('页面已切换，请重新打开采集弹窗后开始');const value=options();if(secondary){await remember();showSecondary(false);return;}
 const mode=coverOnly?'current':q('#scope').value==='bulk'?site.bulk:isVideo()?videoMode:'current';
 if(coverOnly)Object.assign(value,{capture_scope:'single',capture_kind:'images',collection_mode:'images',include_images:true,include_videos:false,video_action:'skip',video_only:false,subtitle_mode:'none',extract_frames:false});
 if(!mode)throw new Error('此页面不支持所选采集方式');
 if(isVideo()&&videoMode==='video'&&q('#scope').value!=='bulk'){value.include_videos=false;value.extract_frames=false;}
 if(!coverOnly)await remember();active=true;render();await chrome.storage.local.remove('collectorPopupDraft');
 UI.message(q('#status'),value.include_videos?'正在检查本次媒体…':'开始采集…');
 chrome.runtime.sendMessage({type:'COLLECT_V2',build:BUILD,mode,options:value,port:8766},response=>{active=false;resumeOptions=null;q('#task-destination').value='';q('#resume-task').checked=false;render();if(chrome.runtime.lastError||!response?.ok)error(new Error(response?.error||chrome.runtime.lastError?.message||'任务未完成'));update().catch(error);});
}
async function update(){
 const s=await chrome.storage.local.get(['liblibActiveJob','liblibProgress','collectorApproval','liblibControl','collectorCheckpoint']);
 active=Boolean(s.liblibActiveJob);control=s.liblibControl||'running';checkpoint=s.collectorCheckpoint;const p=s.liblibProgress;
 q('#open-result').hidden=!p?.directory;
 q('#open-result').dataset.directory=p?.directory||'';
 q('#detail-open-result').hidden=!p?.directory;
 q('#result-context').hidden=!p;
 globalThis.PopupPresentation?.paint(p,active);
 if(p&&['completed','partial'].includes(p.status))await chrome.storage.local.set({collectorFirstSave:{taskId:p.context?.id,at:Date.now(),status:p.status}});
 if(p){const source=p.context?.title||p.context?.url?.split('?')[0]||t('来源未记录');UI.message(q('#result-context'),active?'正在执行 · {source}':'上次任务 · {source} · {time}',{source,time:p.updatedAt?new Date(p.updatedAt).toLocaleString():t('时间未记录')});UI.feedback(q('#status'),(p.message||'').split('\n')[0],'任务状态已更新，请查看详情。');q('#diagnostic-text').textContent=[...new Set([p.message,p.details].filter(Boolean))].join('\n');}
 else{UI.message(q('#status'),'等待开始');q('#diagnostic-text').textContent='';}
 q('#progress').hidden=!active;q('#progress').value=p?.percent||0;
 q('#status').dataset.state=p?.status||'';
 approval=s.collectorApproval?.state==='pending';q('#approval').hidden=!approval;if(approval)UI.feedback(q('#approval-text'),s.collectorApproval.message,'等待下载确认');render();await recentTasks();
}
async function recentTasks(){
 const {collectorTaskJournal:journal={},liblibControl}=await chrome.storage.local.get(['collectorTaskJournal','liblibControl']);
 globalThis.PopupPresentation?.count(Object.keys(journal).length);
 const entries=Object.values(journal).sort((a,b)=>b.updated-a.updated).slice(0,10);
 q('#recent-list').replaceChildren();
 for(const entry of entries){
   const row=document.createElement('p'),state=entry.status==='running'&&liblibControl==='paused'?'paused':entry.status;
   row.dataset.state=state;const type=entry.options?.output_format==='audio'?'音频':({images:'图片/GIF',text:'图文',video:'视频'})[entry.options?.capture_kind]||'采集';
   UI.message(row,'{time} · {platform} / {kind} · {state} · {title}',{time:new Date(entry.updated).toLocaleTimeString(),platform:{ui:CollectorSite.context(entry.source||'').site},kind:{ui:type},state:{ui:{completed:'成功',failed:'失败',partial:'部分成功',paused:'暂停',running:'处理中',stopped:'已停止'}[state]||'未完成'},title:entry.name||'未记录标题'});row.title=row.textContent;row.tabIndex=0;const details=()=>{q('#diagnostic-text').textContent=[entry.name,entry.source,'任务 '+entry.id,new Date(entry.updated).toLocaleString(),...Object.values(entry.records||{}).map(r=>[r.url,r.status,r.reason].filter(Boolean).join(' · '))].filter(Boolean).join('\n');q('#task-result-summary').textContent=PopupPresentation.resultSummary({context:{title:entry.name},status:entry.status,message:entry.message,records:entry.records});q('#task-dialog').showModal();};row.onclick=details;row.onkeydown=e=>{if(e.key==='Enter')details();};q('#recent-list').append(row);
 }
 if(!entries.length)q('#recent-list').textContent='暂无任务';
}
q('#recent-all').onclick=()=>chrome.runtime.openOptionsPage();
function showOptions(d){
 q('#subtitle-mode').value=resumeOptions||d.subtitle_output_schema==='video-srt-md-v1'?(d.subtitle_mode||'with_video'):'with_video';
 q('#trim-start').value=d.trim_start||0;q('#trim-end').value=d.trim_end||0;
 q('#include-images').checked=d.include_images!==false;
 q('#skip-posts').value=d.skip_posts||0;q('#min-duration').value=d.min_duration||0;q('#max-duration').value=d.max_duration||0;
 const mb=d.max_video_mb||512;q('#download-unit').value=mb>=1024?'GB':'MB';q('#download-limit').value=mb>=1024?mb/1024:mb;
 q('#subtitle-language').value='auto';q('#skip-gifs').checked=Boolean(d.skip_gifs);q('#video-quality').value=d.video_quality||'best';
 for(const [id,key]of [['collection-mode','collection_mode'],['batch-limit','limit'],['duplicate-policy','duplicate_policy'],['video-strategy','strategy'],['video-interval','interval']])q('#'+id).value=(key==='duplicate_policy'&&d[key]==='skip'&&!resumeOptions)?'fill':d[key]??defaults[key];
 if(d.video_only)q('#collection-mode').value='video';
 if(d.output_format==='audio')q('#collection-mode').value='audio';
 if(d.md_only)q('#collection-mode').value='plain';
 q('#comment-limit').value=d.comment_limit??defaults.comment_limit??10;
 q('#plain-comments').checked=Boolean(d.plain_comments??(d.md_only&&d.include_comments));
 q('#video-action').value=d.batch_video_action||d.video_action||(d.include_videos?'save':'skip');
 if(!['skip','save','frames'].includes(q('#video-action').value))q('#video-action').value='skip';
 videoMode=d.extract_frames||d.video_action==='frames'?'download-frames':'download';q('#task-destination').value=d.destination||'';
 for(const [id,key]of [['include-comments','include_comments'],['ocr-enabled','ocr_enabled']])q('#'+id).checked=d[key]??defaults[key];
}
q('#task-options').addEventListener('change',guarded(async event=>{
 if(event.target.id==='collection-mode'){manualSelection++;
   const kind=event.target.value;showOptions({...CaptureOptions.resolve({defaults,modePreferences,mode:kind,generation:defaultsGeneration}),destination:q('#task-destination').value});q('#collection-mode').value=kind;
 }
 render();if(ready&&!resumeOptions)await remember();
}));q('#start').onclick=guarded(()=>start());
const coverButton=document.createElement('button');coverButton.type='button';coverButton.className='text-button';coverButton.id='only-cover';coverButton.hidden=true;coverButton.textContent='仅保存本视频封面';q('#video-tools').after(coverButton);coverButton.onclick=guarded(()=>start(true));
for(const s of ['current','bulk'])q('#scope-'+s).onclick=guarded(async()=>{q('#scope').value=s;if(s==='bulk'&&videoMode==='video')videoMode='download';render();await remember();await identify();});
q('#save-video').onclick=guarded(async()=>{videoMode='download';render();await remember();});q('#download-frames').onclick=guarded(async()=>{videoMode='download-frames';render();await remember();});
q('#collect-video').onclick=()=>{videoMode='video';render();};
q('#more-options').onclick=()=>showSecondary(true);
q('#manage').onclick=()=>chrome.runtime.openOptionsPage();q('#open-path').onclick=guarded(()=>Hub.api('/settings/open',{directory:effectiveFolder()}));
q('#open-result').onclick=guarded(()=>Hub.api('/settings/open',{directory:q('#open-result').dataset.directory}));
 q('#detail-open-result').onclick=q('#open-result').onclick;
q('#task-details').onclick=()=>q('#task-dialog').showModal();q('#close-task').onclick=()=>q('#task-dialog').close();
q('#resume-task').addEventListener('change',()=>q('#task-dialog').close());
q('#default-path').onclick=guarded(async()=>{q('#task-destination').value='';await chrome.storage.local.remove('collectorPopupDraft');render();});

async function remember(){
 if(resumeOptions)return;
 const value=options();value.duplicate_policy='fill';value.destination=null;
 value.batch_video_action=q('#video-action').value;
 value.subtitle_output_schema='video-srt-md-v1';
 const kind=q('#collection-mode').value;
 modePreferences[kind]=CaptureOptions.stamp(value,{defaults,generation:defaultsGeneration});
 if(!isVideo())modePreferences[kind].options.video_action=q('#video-action').value;
 await chrome.storage.local.set({collectorModePreferences:modePreferences,collectorLastOptions:CaptureOptions.stamp(value,{defaults,generation:defaultsGeneration,kind,scope:q('#scope').value,videoMode})});
}
q('#restore-defaults').onclick=guarded(async()=>{await chrome.storage.local.remove(['collectorLastOptions','collectorPopupDraft','collectorModePreferences','collectorDefaultsGeneration']);modePreferences={};showOptions(defaults);q('#scope').value='current';render();});
async function chooseFolder(){
 if(picking)return;
 const value=options();
 picking=true;render();UI.message(q('#folder-status'),'正在打开系统窗口；若未出现，可直接输入路径。');
 const requestId=crypto.randomUUID();
 await chrome.storage.local.set({collectorPopupDraft:{generation:defaultsGeneration,defaultsSignature:CaptureOptions.signature(defaults),source:currentTab.url,requestId,tabId:currentTab.id,picking:true,options:value,scope:q('#scope').value,kind:q('#collection-mode').value,videoMode,expires:Date.now()+15*60000}});
 try{const r=await chrome.runtime.sendMessage({type:'CHOOSE_TASK_FOLDER',requestId});if(!r?.ok)throw new Error(r?.error||'无法选择文件夹');const state=await chrome.storage.local.get(['collectorPopupDraft']);if(state.collectorPopupDraft?.requestId!==requestId)return;if(!r.cancelled){q('#task-destination').value=r.directory;}q('#folder-dialog').close();}
 catch(e){UI.message(q('#folder-status'),'系统选择未完成，请直接输入路径后使用。');q('#diagnostic-text').textContent=e.message;}
 finally{picking=false;render();}
}
q('#choose-folder').onclick=guarded(async()=>{folderBefore=q('#task-destination').value;q('#folder-dialog').showModal();await chooseFolder();});
q('#choose-folder-more').onclick=guarded(chooseFolder);
q('#folder-apply').onclick=guarded(async()=>{const path=q('#task-destination').value.trim();if(path&&!/^(?:[a-z]:[\\/]|\\\\)/i.test(path))throw new Error('请填写完整的绝对路径');await chrome.storage.local.set({collectorPopupDraft:{generation:defaultsGeneration,defaultsSignature:CaptureOptions.signature(defaults),source:currentTab.url,tabId:currentTab.id,picking:false,options:options(),scope:q('#scope').value,kind:q('#collection-mode').value,videoMode,expires:Date.now()+15*60000}});picking=false;await remember();q('#folder-dialog').close();render();});
q('#folder-cancel').onclick=guarded(async()=>{q('#task-destination').value=folderBefore;await chrome.storage.local.remove('collectorPopupDraft');picking=false;q('#folder-dialog').close();render();});
q('#folder-dialog').addEventListener('cancel',guarded(async()=>{q('#task-destination').value=folderBefore;await chrome.storage.local.remove('collectorPopupDraft');picking=false;render();}));
q('#pause').onclick=guarded(async()=>{await chrome.runtime.sendMessage({type:'CONTROL_COLLECTOR',action:control==='paused'?'running':'paused'});await update();});
q('#stop').onclick=guarded(async()=>{await chrome.runtime.sendMessage({type:'CONTROL_COLLECTOR',action:'stopped'});await update();});
q('#approve').onclick=()=>chrome.runtime.sendMessage({type:'APPROVE_DOWNLOAD',approve:true});q('#reject').onclick=()=>chrome.runtime.sendMessage({type:'APPROVE_DOWNLOAD',approve:false});
q('#reset').onclick=guarded(async()=>{const r=await chrome.runtime.sendMessage({type:'RESET_COLLECTOR'});if(!r?.ok)throw new Error(r?.error||'任务未完成');await update();UI.message(q('#status'),r.stopping?'已请求停止；若仍无响应，请在扩展管理页重新加载。已保存文件和批量断点保留。':'已解除卡住状态');});
q('#end-task').onclick=guarded(async()=>{const r=await chrome.runtime.sendMessage({type:'END_BATCH'});if(!r?.ok)throw new Error(r?.error);resumeOptions=null;q('#resume-task').checked=false;await update();});
q('#resume-task').onchange=guarded(async()=>{if(q('#resume-task').checked){if(!checkpoint||checkpoint.completed)throw new Error('没有未完成任务，请在管理页选择历史任务。');resumeOptions={...checkpoint.options,...(checkpoint.options.destination||checkpoint.root?{destination:checkpoint.options.destination||checkpoint.root}:{})};showOptions(resumeOptions);q('#scope').value='bulk';}else{resumeOptions=null;showOptions(defaults);}render();});
document.addEventListener('uilanguage',render);
chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;const d=changes.collectorPopupDraft?.newValue;if(d?.tabId===currentTab?.id&&d.expires>Date.now()){picking=Boolean(d.picking);q('#task-destination').value=d.options.destination||'';render();if(d.error)error(new Error(d.error));}if(['liblibActiveJob','liblibProgress','collectorApproval','liblibControl','collectorCheckpoint'].some(k=>k in changes))update().catch(error);});
guarded(async()=>{
 [currentTab]=await chrome.tabs.query({active:true,currentWindow:true});site=CollectorSite.context(currentTab?.url||'');
 if(site.site==='ArtStation'&&site.bulk){
   const [{result}]=await chrome.scripting.executeScript({target:{tabId:currentTab.id},files:['artstation-list.js']});
   if(result?.error||!result?.urls?.length)site={...site,bulk:null,reason:result?.error||'请进入明确的作品图片列表'};
 }
 if(site.site==='B站'&&site.bulk&&site.mode==='text'){
   const [{result}]=await chrome.scripting.executeScript({target:{tabId:currentTab.id},files:['bilibili.js']});
   if(result?.error||!result?.urls?.length)site={...site,bulk:null,reason:result?.error||'请进入具体文集或文章后保存。'};
 }
 const health=await Hub.api('/health'),hello=await chrome.runtime.sendMessage({type:'COLLECTOR_HELLO'});
 if(health.version!==BUILD||hello?.build!==BUILD)throw new Error('扩展或保存服务版本不一致，请更新并重新加载扩展');
 defaults=await Hub.defaults();defaultPath=health.inbox;showOptions(defaults);q('#version').textContent=chrome.runtime.getManifest().version+' · '+t('后台已连接');
 const s=await chrome.storage.local.get(['collectorNextAction','collectorResumeRequested','collectorCheckpoint','collectorPopupDraft','collectorLastOptions','collectorModePreferences','collectorDefaultsGeneration']);
 modePreferences=s.collectorModePreferences||{};defaultsGeneration=s.collectorDefaultsGeneration||0;
 const last=s.collectorLastOptions,d=s.collectorPopupDraft;
 const kind=site.mode==='video'&&last?.kind==='audio'?'audio':site.mode||last?.kind||defaults.collection_mode;
 const initial=CaptureOptions.resolve({defaults,modePreferences,last,draft:d,mode:kind,generation:defaultsGeneration,tabId:currentTab.id,source:currentTab.url});
 const currentDraft=d?.tabId===currentTab.id&&d.source===currentTab.url&&d.expires>Date.now()&&d.generation===defaultsGeneration;
 showOptions(site.mode==='images'&&!currentDraft?{...initial,collection_mode:'images',md_only:false,video_only:false,output_format:'original',extract_frames:false}:initial);
 if(last){q('#scope').value=last.scope||'current';videoMode=last.videoMode||videoMode;}
 if(d?.tabId===currentTab.id&&d.expires>Date.now()&&d.generation===defaultsGeneration){q('#scope').value=d.scope;videoMode=d.videoMode;picking=Boolean(d.picking)&&d.expires>Date.now()+12*60000;}
 await TaskStore.reconcile().catch(()=>{});
 if(s.collectorNextAction?.url?.split('?')[0]===currentTab?.url?.split('?')[0]){requestedPolicy='refresh';q('#duplicate-policy').value='refresh';await chrome.storage.local.remove('collectorNextAction');}
 if(s.collectorResumeRequested&&s.collectorCheckpoint&&!s.collectorCheckpoint.completed){resumeOptions={...s.collectorCheckpoint.options,...(s.collectorCheckpoint.options.destination||s.collectorCheckpoint.root?{destination:s.collectorCheckpoint.options.destination||s.collectorCheckpoint.root}:{})};showOptions(resumeOptions);q('#resume-task').checked=true;q('#scope').value='bulk';await chrome.storage.local.remove('collectorResumeRequested');}
 if(health.library_configured===false){
  const prior=(await chrome.storage.local.get('collectorOnboarding')).collectorOnboarding;
  const hint=prior?.directory
   ? t('此后台尚未设置素材库。上次保存位置：')+prior.directory+'。'+t('升级后遇到此提示，请先核对原后台。')
   : t('首次使用请点右上角设置选择素材库。升级后遇到此提示，请先核对原后台。');
  globalThis.PopupPresentation?.paint({status:'needs_library',message:hint},false);return;
 }
 const library=await Hub.api('/settings/library/check');if(!library.writable)throw new Error('素材目录不可写，请在设置中重新选择');
 await chrome.storage.local.set({collectorOnboarding:{connected:true,directory:library.directory,writable:true,checkedAt:Date.now(),firstSave:'optional'}});
 ready=true;await update();identify().catch(()=>{});if(d?.tabId===currentTab.id&&d.expires>Date.now()&&d.error)error(new Error(d.error));
})();

q('#skip-video').onchange=guarded(async()=>{q('#video-action').value=q('#skip-video').checked?'skip':'save';render();await remember();});
const identifyButton=document.createElement('button');identifyButton.type='button';identifyButton.className='text-button';identifyButton.textContent='重新识别当前页';q('#advanced-options .advanced-body').append(identifyButton);
const identifyStatus=document.createElement('p');identifyStatus.id='identify-status';identifyStatus.className='hint';identifyStatus.setAttribute('role','status');q('#collection-mode').closest('label').after(identifyStatus);
async function identify(){
 if(q('#scope').value==='bulk'){UI.message(identifyStatus,'批量只扫描画板链接，开始后显示本轮数量；不逐个预读媒体。');return;}
 if(active||resumeOptions)return;
 const token=manualSelection;UI.message(identifyStatus,'正在识别已加载正文…');
 try{const [{result}]=await chrome.scripting.executeScript({target:{tabId:currentTab.id},files:['page-identify.js']});
 if(result?.url!==currentTab.url||token!==manualSelection||q('#scope').value==='bulk'||active||resumeOptions)return;
 if(result?.state==='ready'){
 UI.message(identifyStatus,'已确认图片 {images} · GIF {gifs} · 视频 {videos}',{images:result.images,gifs:result.gifs||0,videos:result.videos});
 if(!site.mode&&result.kind&&!manualSelection){q('#collection-mode').value=result.kind;render();}
 }else UI.message(identifyStatus,result?.reason||'正文仍在加载，可重新识别或手动选择。');
 }catch(error){UI.message(identifyStatus,'未能识别，可手动选择采集内容。');}
}
identifyButton.onclick=guarded(identify);

q('#retry-failed').onclick=guarded(async()=>{
 if(checkpoint?.mode&&checkpoint.mode!=='current'){
 const copy=structuredClone(checkpoint);for(const r of Object.values(copy.records||{}))if(['failed','partial'].includes(r.status))r.status='pending';copy.completed=false;delete copy.error;
 await TaskStore.save(copy);await chrome.storage.local.set({collectorResumeRequested:true});
 if(copy.source!==currentTab.url){await chrome.tabs.create({url:copy.source});return;}
 checkpoint=copy;resumeOptions=CaptureOptions.resolve({resume:copy});showOptions(resumeOptions);q('#scope').value='bulk';render();await start();
 }else await start();
});
