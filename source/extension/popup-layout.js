/* Adapt existing controls to the approved prototype; IDs retain their behavior. */
(() => {
 const q=s=>document.querySelector(s),make=(tag,id,cls)=>{const e=document.createElement(tag);if(id)e.id=id;if(cls)e.className=cls;return e;};
 const main=q('#main-options'),advanced=make('details','advanced-options','advanced-options');
 const summary=make('summary');summary.innerHTML='<span>更多选项</span><small id="advanced-summary">自动去重补齐</small><span aria-hidden="true">⌄</span>';
 const body=make('div',null,'advanced-body');advanced.append(summary,body);
 const duplicate=q('#duplicate-policy').closest('label');duplicate.hidden=false;
 for(const selector of ['#quality-row','#quality-help','#subtitle-row','#subtitle-help','#trim-options'])body.append(q(selector));
 body.append(duplicate,q('#duplicate-help'),q('#secondary-options'));main.append(advanced);
 const images=make('label','include-images-option');images.innerHTML='<input id="include-images" type="checkbox" checked>正文图片';q('#text-options').prepend(images);
 const limit=make('label','download-limit-row','field');limit.innerHTML='<span>单个下载上限</span><span class="number-unit"><input id="download-limit" type="number" min="0.001" max="1048576" step="any" value="512" aria-label="单个下载上限"><select id="download-unit" aria-label="下载上限单位"><option value="MB">MB</option><option value="GB">GB</option></select></span>';body.prepend(limit);
 const range=make('div','batch-range');range.innerHTML='<label class="field"><span>跳过前几篇</span><input id="skip-posts" type="number" min="0" max="499" value="0"></label><p class="hint">按当前列表顺序，0 从第一篇开始；跳过项不占采集额度。</p><div id="duration-filter"><label class="field"><span>最短时长（秒）</span><input id="min-duration" type="number" min="0" max="86400" value="0"></label><label class="field"><span>最长时长（秒）</span><input id="max-duration" type="number" min="0" max="86400" value="0"></label><p class="hint">0 表示不限；设置范围后，无法确认时长的媒体会跳过并记录原因。</p></div>';body.prepend(range);
 const filters=make('div','filters-row','field');filters.innerHTML='<span>媒体过滤</span><div class="checks"><label id="skip-video-option"><input id="skip-video" type="checkbox" checked><span>跳过视频</span></label></div>';
 const gif=q('#skip-gifs-option');gif.childNodes.forEach(n=>{if(n.nodeType===3)n.textContent='跳过 GIF';});filters.querySelector('.checks').append(gif);q('#limit-row').before(filters);
 body.append(q('#attachment-row'),q('#mode-help'),q('#quota-help'),q('#more-options'),q('#collect-video'));
 const textRow=make('div','text-attachments-row','field');textRow.innerHTML='<span>附带内容</span>';textRow.append(q('#text-options'));filters.after(textRow);
 const ocr=q('#ocr-enabled').parentElement;body.append(ocr);
 const defaultButton=q('#default-path');defaultButton.remove();const card=q('.save-card');card.className='field destination-field';const path=q('#save-path');path.tagName==='P'&&(path.style.margin='0');
 const choose=q('#choose-folder');choose.className='path-button';choose.textContent='';choose.innerHTML='<svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 5h6l2 2h8v10H2Z" fill="none" stroke="currentColor"/></svg>';choose.append(path);choose.insertAdjacentHTML('beforeend','<span aria-hidden="true">›</span>');
 card.replaceChildren();const label=make('span');label.textContent='保存位置';card.append(label,choose);body.append(defaultButton);
 // Preserve path handlers and status elements without taking space in the primary form.
 const stash=make('div','path-secondary');stash.hidden=true;stash.innerHTML='<small id="destination-label"></small>';body.append(stash);
 const open=make('button','open-path','text-button');open.type='button';open.textContent='打开文件夹';body.append(open);
 const brand=q('.brand');brand.innerHTML='<img src="reftray-a.svg" width="28" height="28" alt=""><div class="brand-wordmark"><strong>RefTray</strong><span>灵感采集</span></div>';
 const version=make('small','version');version.hidden=true;brand.append(version);
 const picker=q('#ui-language');picker.hidden=true;const languages=make('div',null,'languages');languages.innerHTML='<button type="button" id="lang-zh" aria-pressed="true">中</button><span>/</span><button type="button" id="lang-en" aria-pressed="false">EN</button>';picker.after(languages);
 for(const lang of ['zh','en'])q('#lang-'+lang).onclick=()=>{picker.value=lang;picker.dispatchEvent(new Event('change',{bubbles:true}));};
 document.addEventListener('uilanguage',()=>{for(const lang of ['zh','en'])q('#lang-'+lang).setAttribute('aria-pressed',String(picker.value===lang));});
 q('#scope-current').textContent='当前作品';q('#scope-bulk').textContent='批量采集';
 const footer=q('.start-bar'),status=q('.status-card');footer.append(status);
 const ring=make('div','task-ring','task-ring');ring.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="ring-track" cx="32" cy="32" r="28"/><circle id="ring-value" cx="32" cy="32" r="28"/></svg><div><strong id="ring-number">—</strong><small>处理进度</small></div>';status.prepend(ring);
 const content=make('div',null,'result-body');const title=make('h2','result-title');content.append(title);
 const aggregate=make('p','result-aggregate'),counts=make('p','result-counts'),current=make('p','result-current');current.dataset.userContent='';content.append(aggregate,counts,current);
 const actions=make('div',null,'result-actions');const retry=make('button','retry-failed','text-button');retry.type='button';retry.textContent='重试失败项';retry.hidden=true;actions.append(retry);actions.append(q('#open-result'),q('#task-details'));content.append(actions,q('#result-context'),q('#status'),q('#progress'));status.append(content);q('#status').hidden=true;q('#result-context').hidden=true;
 const logs=make('details','task-log-drawer');const logSummary=make('summary');logSummary.innerHTML='<span>☷</span><span>任务记录与日志</span>';const count=make('small','task-log-count');logSummary.append(count);logs.append(logSummary,q('#recent-tasks'));footer.append(logs);
 const raw=q('#diagnostic-text'),diagnostics=make('details','raw-diagnostics');const rawTitle=make('summary');rawTitle.textContent='原始日志';raw.before(diagnostics);diagnostics.append(rawTitle,raw);
 const taskSummary=make('pre','task-result-summary');diagnostics.before(taskSummary);
 const copyLog=make('button','copy-task-log','text-button');copyLog.type='button';copyLog.textContent='复制脱敏日志';diagnostics.append(copyLog);
 copyLog.onclick=async()=>{const text=raw.textContent.replace(/([?&](?:token|xsec_token|signature|auth)[^=]*=)[^\s&#]+/gi,'$1[已隐藏]').replace(/(?:Cookie|Authorization):[^\r\n]*/gi,'[已隐藏]');try{await navigator.clipboard.writeText(text);copyLog.textContent='已复制';}catch(_){copyLog.textContent='复制失败，可手动选择文本';}};
 q('#scroll-content').tabIndex=0;document.documentElement.classList.add('popup-redesign');
 globalThis.PopupPresentation={
  paint(p,active){
   const t=s=>globalThis.UI?.t(s)||s,b=p?.batch;const states={completed:'已完成',partial:'部分完成',failed:'保存失败',stopped:'已停止',paused:'已暂停',stopping:'正在收尾'};
   q('#retry-failed').hidden=active||!['partial','failed','stopped'].includes(p?.status);
   q('#task-result-summary').textContent=[p?.context?.title,p?.context?.id?'任务 '+p.context.id:'',p?.message,...(p?.details||'').split('\n').filter(line=>line&&!/Traceback|File \"|^\s+at |^\s+\^/.test(line)).slice(0,20)].filter(Boolean).join('\n');
   q('#result-title').textContent=t(states[p?.status]||(active?'处理中':'待开始'));
   q('#result-aggregate').textContent=b?(UI.language==='en'?`Processed ${b.processed}${b.total?' / '+b.total:''} · Limit ${b.limit}`:`已处理 ${b.processed}${b.total?' / '+b.total:''} 篇${b.total?'':' · 本轮最多 '+b.limit+' 篇'}`):'';
   q('#result-counts').textContent=b?[b.saved?`${t('保存')} ${b.saved}`:'',b.skipped?`${t('跳过')} ${b.skipped}`:'',b.failed?`${t('失败')} ${b.failed}`:''].filter(Boolean).join(' · '):'';
   q('#result-current').textContent=active?(p?.current?.message||p?.message||t('等待开始')).split('\n')[0]+(typeof p?.current?.percent==='number'?' · '+Math.round(p.current.percent)+'%':''):(!b?p?.message||t('选择采集内容后开始'):'');
   const percent=b?(b.total?b.processed/b.total*100:null):p?.percent,known=typeof percent==='number'&&Number.isFinite(percent),n=known?Math.min(100,Math.max(0,percent)):0;
   q('#ring-number').textContent=known?Math.round(n)+'%':'—';q('#ring-value').style.strokeDashoffset=String(175.93*(1-n/100));
  },
  count(n){q('#task-log-count').textContent=n+' '+(globalThis.UI?.language==='en'?'tasks':'条');}
 };
})();
