/* Layout from the user's original v3 reference. Existing controls own all data/actions. */
(() => {
 const q=s=>document.querySelector(s),make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
 const glyphs={settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/>',records:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',tasks:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',tools:'<path d="m14 5 5 5M13 6l4-3 4 4-3 4-2-1-7 8-3-3 8-7Z"/><path d="m3 21 3-6"/>',image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',video:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 5 4-5 4Z"/>'};
 function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=glyphs[name]||glyphs.image;return svg;}
 const settings=q('#defaults'),records=q('#history'),tools=q('#tools'),form=q('#defaults-form'),library=q('.destination');
 const originalHeader=q('body>header'),oldNav=q('body>nav'),language=q('#ui-language');
 const shell=make('div','shell'),sidebar=make('aside','sidebar'),workspace=make('div','workspace'),main=make('main','main');main.id='manage-main';main.tabIndex=-1;
 const mark=make('div','wordmark','RefTray');mark.append(make('span',null,'管理'));sidebar.append(mark);
 const nav=make('nav','nav');nav.setAttribute('aria-label','主导航');
 const names={defaults:'设置',history:'采集记录',tasks:'任务',tools:'工具与帮助'},navButtons={};
 for(const [key,label] of Object.entries(names)){
  const b=make('button',null);b.type='button';b.dataset.view=key;
  b.append(icon(({defaults:'settings',history:'records',tasks:'tasks',tools:'tools'})[key]),make('span',null,label));
  if(key==='history'||key==='tasks'){const count=make('span','count','…');count.id='nav-'+key+'-count';b.append(count);}
  navButtons[key]=b;nav.append(b);
 }
 sidebar.append(nav);
 const bottom=make('div','sidebar-bottom'),connection=make('div','connection'),connectionLine=make('div','connection-line');
 const dot=make('span','status-dot');dot.id='connection-dot';const connectionText=make('span',null,'正在连接本地后台…');connectionText.id='connection-state';connectionLine.append(dot,connectionText);
 const detail=make('button','text-button','查看连接与诊断 ↗');detail.type='button';detail.onclick=()=>showView('tools');
 const version=make('div','version');version.id='manage-version';connection.append(connectionLine,make('p',null,'本地服务 · 素材保存在你的文件夹'),detail);bottom.append(connection,version);sidebar.append(bottom);
 const topbar=make('header','topbar'),breadcrumb=make('div','breadcrumb');breadcrumb.append(document.createTextNode('RefTray'),make('span',null,'/'));const breadcrumbName=make('strong',null,'设置');breadcrumb.append(breadcrumbName);
 const actions=make('div','top-actions'),approvalButton=make('button','approval-button','下载确认 · 0');approvalButton.type='button';approvalButton.disabled=true;approvalButton.onclick=()=>{q('#approval').hidden=false;q('#approval').scrollIntoView({block:'center'});};actions.append(approvalButton,language);topbar.append(breadcrumb,actions);
 language.hidden=true;
 const languages=make('div','languages');
 for(const lang of ['zh','en']){const b=make('button',null,lang==='zh'?'中':'EN');b.type='button';b.dataset.language=lang;b.onclick=()=>{language.value=lang;language.dispatchEvent(new Event('change',{bubbles:true}));};if(lang==='en')languages.append(make('span',null,'/'));languages.append(b);}
 actions.append(languages);
 const syncLanguage=()=>{for(const b of languages.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.language===language.value));};
 document.addEventListener('uilanguage',syncLanguage);syncLanguage();
 main.append(q('#notice'),q('#approval'),settings,records,tools);workspace.append(topbar,main);shell.append(sidebar,workspace);document.body.prepend(shell);originalHeader.remove();oldNav.remove();
 for(const section of [settings,records,tools])section.classList.add('workspace-page');
 const title=make('div','page-title');title.append(make('h1',null,'设置'));settings.querySelector(':scope>h2').replaceWith(title);
 const subnav=make('nav','subnav');subnav.setAttribute('aria-label','设置分类');const tabs={};
 for(const [key,label] of [['capture','采集默认值'],['library','素材库位置'],['advanced','视频与保护']]){const b=make('button',null,label);b.type='button';tabs[key]=b;subnav.append(b);b.onclick=()=>showSettings(key);}
 const context=make('div','settings-context','默认值只影响未来新任务，续采保留原参数。');title.after(subnav,context);
 const layout=make('div','settings-layout');context.after(layout);layout.append(library,form);
 const capture=make('div'),advanced=make('div');capture.dataset.settingsPanel='capture';advanced.dataset.settingsPanel='advanced';
 const fieldsets=[...form.querySelectorAll('fieldset')];form.prepend(capture,advanced);capture.append(fieldsets[0]);advanced.append(...fieldsets.slice(1));
 for(const p of [...settings.children].filter(el=>el.tagName==='P'))p.remove();
 const hints={duplicate_policy:'补齐缺失，不删除已有文件。',limit:'1–500 篇',max_images:'0 表示不限 · 图片与 GIF 合计，重复与失败项也占额度。',video_action:'网页抽帧从采集弹窗开始。',skip_gifs:'不保存 GIF / LIVE 动图内容。',include_comments:'保存已加载直接回复的文字和静态图片；评论GIF尚未接入。',ocr_enabled:'本地 OCR',strategy:'分段合并相近画面；定时按间隔取图。',interval:'0.5–60 秒 · 每次增加 0.5 秒',max_video_mb:'单次源文件总量上限，分轨合计；不是画质或整批总量。'};
 function field(label){
  const input=label.querySelector('input,select');if(!input)return label;
  const captions={duplicate_policy:'遇到已保存内容',limit:'默认采集篇数',skip_gifs:'跳过动图',include_comments:'包含已加载评论',ocr_enabled:'图片文字识别',interval:'采样间隔'};
  const text=captions[input.name]||[...label.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ');input.id ||= 'setting-'+input.name;input.setAttribute('aria-label',text);
  label.textContent=text;label.htmlFor=input.id;
  if(input.type==='checkbox'){
   const row=make('div','toggle-row'),copy=make('div','toggle-copy'),toggle=make('label','switch');toggle.htmlFor=input.id;
   copy.append(label,make('p',null,hints[input.name]||''));toggle.append(input,make('span'));row.append(copy,toggle);return row;
  }
  const row=make('div','field');let control=input;
  if(input.type==='number'){control=make('div','field-unit');control.append(input,make('span','unit',({limit:'篇',max_images:'张',interval:'秒',max_video_mb:'MB'})[input.name]||''));}
  row.append(label,control,make('span','field-hint',hints[input.name]||''));return row;
 }
 for(const fs of fieldsets){
  const labels=[...fs.querySelectorAll(':scope>label')],body=make('div','panel-body');
  const heading=make('div','panel-heading');heading.append(make('h2',null,fs.querySelector('legend').textContent));
  fs.querySelector('legend').className='sr-only';for(const p of [...fs.querySelectorAll(':scope>p')])p.remove();
  fs.append(heading,body);fs.className='panel';for(const label of labels)body.append(field(label));
 }
 fieldsets[0].querySelector('.panel-heading h2').textContent='批量采集';
 const preferences=make('fieldset','panel'),legend=make('legend','sr-only','内容偏好'),prefHeading=make('div','panel-heading'),prefBody=make('div','panel-body');prefHeading.append(make('h2',null,'内容偏好'));preferences.append(legend,prefHeading,prefBody);
 prefBody.append(...fieldsets[0].querySelectorAll('.toggle-row'));capture.append(preferences);
 fieldsets[2].querySelector('.panel-heading h2').textContent='下载保护';fieldsets[2].querySelector('.panel-body').append(make('p','inline-note','不检查或预留磁盘空间；未知大小的下载同样受单个文件上限限制。'));
 library.classList.add('panel');const libraryHeading=make('div','panel-heading');libraryHeading.append(q('#library-title'));library.prepend(libraryHeading);const libraryBody=make('div','panel-body');libraryBody.append(...[...library.children].filter(el=>el!==libraryHeading));library.append(libraryBody);q('#save-path').classList.add('path-box','mono');
 q('.layout-settings').classList.add('library-layout-options');q('.layout-settings').prepend(make('h2',null,'目录组织方式'));
 const savebar=make('div','savebar'),savebarInner=make('div','savebar-inner'),stateSlot=make('div','save-state'),saveActions=make('div','save-actions');stateSlot.id='defaults-state-slot';saveActions.id='defaults-actions';const submit=form.querySelector('[type=submit]');submit.className='primary';saveActions.append(submit);savebarInner.append(stateSlot,saveActions);savebar.append(savebarInner);form.append(savebar);
 q('.record-tabs').hidden=true;
 const recordTitle=make('div','page-title'),recordHeading=make('h1',null,'采集记录'),importButton=make('button','primary','导入旧目录');importButton.type='button';recordTitle.append(recordHeading,importButton);records.prepend(recordTitle);
 function dialog(title){const d=make('dialog'),head=make('div','dialog-header'),close=make('button',null,'×'),body=make('div','dialog-body');close.type='button';close.setAttribute('aria-label','关闭');head.append(make('h2',null,title),close);d.append(head,body);document.body.append(d);close.onclick=()=>d.close();return {element:d,body,close};}
 const importDetails=q('#import-directory').closest('details'),importDialog=dialog('导入或重新关联旧采集目录');importDetails.classList.add('import-panel');importDetails.querySelector('summary').hidden=true;importDetails.open=true;importDialog.body.append(importDetails);importButton.onclick=()=>{importDialog.element.showModal();q('#import-directory').focus();};q('#search-form').classList.add('toolbar');q('#query').classList.add('search-input');q('#history-list').classList.add('panel');q('#task-list').classList.add('panel');
 const pathEditor=q('#path-editor'),pathDialog=dialog('素材库位置');pathDialog.body.append(pathEditor);pathDialog.close.onclick=()=>q('#cancel-path').click();pathDialog.element.addEventListener('cancel',e=>{e.preventDefault();q('#cancel-path').click();});
 const pathNote=make('p','hint');pathNote.setAttribute('role','status');pathDialog.body.prepend(pathNote);new MutationObserver(()=>{pathNote.textContent=q('#path-message').textContent;}).observe(q('#path-message'),{childList:true,subtree:true,characterData:true});
 new MutationObserver(()=>{if(pathEditor.hidden){if(pathDialog.element.open)pathDialog.element.close();}else if(!pathDialog.element.open)pathDialog.element.showModal();}).observe(pathEditor,{attributes:true,attributeFilter:['hidden']});
 const toolsTitle=make('div','page-title');toolsTitle.append(make('h1',null,'工具与帮助'));tools.querySelector(':scope>h2').replaceWith(toolsTitle);
 const toolsGrid=make('div','tools-grid');toolsTitle.after(toolsGrid);
 for(const [selector,label,desc] of [['#local-video','本地视频抽帧','打开本地视频工具；不上传视频。']]){const card=make('section','panel tool-card'),symbol=make('div','tool-symbol');symbol.append(icon('video'));card.append(symbol,make('h2',null,label),make('p',null,desc),q(selector));toolsGrid.append(card);}
 q('#live-test').remove();q('#tools>details').classList.add('panel','diagnostics-panel');
 for(const [format,label,desc] of [['gif','视频转 GIF','选择本地视频，转换为动图。'],['audio','提取音频','从本地视频提取 M4A 音频。']]){const card=make('section','panel tool-card'),b=make('button',null,label);b.type='button';b.onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('media-tools.html')+'#'+format});card.append(make('h2',null,label),make('p',null,desc),b);toolsGrid.append(card);}
 function showSettings(key){
  capture.hidden=key!=='capture';advanced.hidden=key!=='advanced';library.hidden=key!=='library';form.hidden=key==='library';
  for(const [name,b] of Object.entries(tabs)){b.classList.toggle('active',name===key);b.setAttribute('aria-current',name===key?'page':'false');}
 }
 function showView(key){
  if(!names[key])key='defaults';settings.hidden=key!=='defaults';records.hidden=!['history','tasks'].includes(key);tools.hidden=key!=='tools';
  breadcrumbName.textContent=names[key];recordHeading.textContent=key==='tasks'?'任务':'采集记录';importButton.hidden=key!=='history';
  for(const [name,b] of Object.entries(navButtons)){b.classList.toggle('active',name===key);b.setAttribute('aria-current',name===key?'page':'false');}
  if(key==='history')q('#records-tab').click();if(key==='tasks')q('#pending-tab').click();
 }
 for(const [key,b] of Object.entries(navButtons))b.onclick=()=>{if(location.hash.slice(1)===key)showView(key);else location.hash=key;};
 form.addEventListener('invalid',e=>{showView('defaults');showSettings(e.target.closest('[data-settings-panel]')?.dataset.settingsPanel||'capture');},true);
 globalThis.ManageLayout={icon,counts(data){if(data.history!==undefined)q('#nav-history-count').textContent=data.history;if(data.tasks!==undefined)UI.message(q('#nav-tasks-count'),'{count} 本页',{count:data.tasks});},approval(pending){approvalButton.disabled=!pending;UI.message(approvalButton,'下载确认 · {count}',{count:pending?1:0});},connection(health,error){connectionText.textContent=error?'后台连接失败':'本地后台已连接';dot.classList.toggle('connected',!error);UI.message(version,health?'扩展 {extension} · 后台 {backend}':'扩展 {extension}',{extension:chrome.runtime.getManifest().version,backend:health?.release});}};
 showSettings('capture');showView('defaults');window.addEventListener('hashchange',()=>showView(location.hash.slice(1)));document.addEventListener('DOMContentLoaded',()=>showView(location.hash.slice(1)||'defaults'));
})();
