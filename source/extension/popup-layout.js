/* Adapt existing controls to the approved prototype; IDs retain their behavior. */
(() => {
 const q=s=>document.querySelector(s),make=(tag,id,cls)=>{const e=document.createElement(tag);if(id)e.id=id;if(cls)e.className=cls;return e;};
 const main=q('#main-options'),advanced=make('details','advanced-options','advanced-options');
 const summary=make('summary');summary.innerHTML='<span>更多选项</span><small id="advanced-summary" hidden>自动去重补齐</small><span class="control-arrow" aria-hidden="true"></span>';
 const body=make('div',null,'advanced-body');advanced.append(summary,body);
 const comments=make('label',null,'field');comments.innerHTML='<span>评论条数</span><input id="comment-limit" type="number" min="1" max="100" value="10">';body.append(comments);const commentHelp=make('p',null,'hint');commentHelp.textContent='按目标数量加载直接回复，保存文字、原图和 GIF；不足时会显示原因。';body.append(commentHelp);
 const duplicate=q('#duplicate-policy').closest('label');duplicate.hidden=false;
 for(const selector of ['#quality-row','#quality-help','#subtitle-row','#subtitle-help','#trim-options'])body.append(q(selector));
 body.append(duplicate,q('#duplicate-help'),q('#secondary-options'));main.append(advanced);
 const images=make('label','include-images-option');images.innerHTML='<input id="include-images" type="checkbox" checked>正文图片';q('#text-options').prepend(images);
 const limit=make('label','download-limit-row','field');limit.innerHTML='<span>单个下载上限</span><span class="number-unit"><input id="download-limit" type="number" min="0.001" max="1048576" step="any" value="512" aria-label="单个下载上限"><select id="download-unit" aria-label="下载上限单位"><option value="MB">MB</option><option value="GB">GB</option></select></span>';body.prepend(limit);
 const range=make('div','batch-range');range.innerHTML='<label class="field"><span>跳过前几篇</span><input id="skip-posts" type="number" min="0" max="499" value="0"></label><p id="batch-range-help" class="hint" aria-live="polite">按当前列表顺序，0 从第一篇开始；跳过项不占采集额度。</p><div id="duration-filter"><label class="field"><span>最短时长（秒）</span><input id="min-duration" type="number" min="0" max="86400" value="0"></label><label class="field"><span>最长时长（秒）</span><input id="max-duration" type="number" min="0" max="86400" value="0"></label><p class="hint">0 表示不限；设置范围后，无法确认时长的媒体会跳过并记录原因。</p></div>';body.prepend(range);
 const filters=make('div','filters-row','field');filters.innerHTML='<span>媒体过滤</span><div class="checks"><label id="skip-video-option"><input id="skip-video" type="checkbox" checked><span>跳过视频</span></label></div>';
 const gif=q('#skip-gifs-option');gif.childNodes.forEach(n=>{if(n.nodeType===3)n.textContent='跳过 GIF';});filters.querySelector('.checks').append(gif);q('#limit-row').before(filters);
 body.append(q('#attachment-row'),q('#mode-help'),q('#quota-help'),q('#more-options'),q('#collect-video'));
 const textRow=make('div','text-attachments-row','field');textRow.innerHTML='<span>采集选项</span>';textRow.append(q('#text-options'));filters.after(textRow);
 // OCR stays beside comments in the capture options row.
 const defaultButton=q('#default-path');defaultButton.remove();const card=q('.save-card');card.className='field destination-field';const path=q('#save-path');path.tagName==='P'&&(path.style.margin='0');
 const choose=q('#choose-folder');choose.className='path-button';choose.textContent='';choose.innerHTML='<svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 5h6l2 2h8v10H2Z" fill="none" stroke="currentColor"/></svg>';choose.append(path);choose.insertAdjacentHTML('beforeend','<span class="control-arrow arrow-right" aria-hidden="true"></span>');
 card.replaceChildren();const label=make('span');label.textContent='保存位置';card.append(label,choose);body.append(defaultButton);
 // Preserve path handlers and status elements without taking space in the primary form.
 const stash=make('div','path-secondary');stash.hidden=true;stash.innerHTML='<small id="destination-label"></small>';body.append(stash);
 const open=make('button','open-path','text-button');open.type='button';open.textContent='打开文件夹';open.hidden=true;stash.append(open);
 const brand=q('.brand');brand.innerHTML='<img src="reftray-a.svg" width="28" height="28" alt=""><div class="brand-wordmark"><strong>RefTray</strong><span>灵感采集</span></div>';
 const version=make('small','version');version.hidden=true;brand.append(version);
 const picker=q('#ui-language');picker.hidden=true;const languages=make('div',null,'languages');languages.innerHTML='<button type="button" id="lang-zh" aria-pressed="true">中</button><span>/</span><button type="button" id="lang-en" aria-pressed="false">EN</button>';picker.after(languages);
 for(const lang of ['zh','en'])q('#lang-'+lang).onclick=()=>{picker.value=lang;picker.dispatchEvent(new Event('change',{bubbles:true}));};
 document.addEventListener('uilanguage',()=>{for(const lang of ['zh','en'])q('#lang-'+lang).setAttribute('aria-pressed',String(picker.value===lang));});
 q('#scope-current').textContent='当前作品';q('#scope-bulk').textContent='批量采集';
 const footer=q('.start-bar'),status=q('.status-card');footer.append(status);
 const ring=make('div','task-ring','task-ring');ring.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="ring-track" cx="32" cy="32" r="28"/><circle id="ring-value" cx="32" cy="32" r="28"/></svg><div><strong id="ring-number">—</strong><small>处理进度</small></div>';status.prepend(ring);
 const content=make('div',null,'result-body');const title=make('h2','result-title');content.append(title);
 const stages=make('div','result-stages','result-stages');stages.hidden=true;for(const label of ['解析','下载','处理','保存']){const step=make('span');step.textContent=label;stages.append(step);}
 const aggregate=make('p','result-aggregate'),counts=make('p','result-counts'),current=make('p','result-current');current.dataset.userContent='';content.append(stages,aggregate,counts,current);
 const actions=make('div',null,'result-actions');const retry=make('button','retry-failed','text-button');retry.type='button';retry.textContent='重试失败项';retry.hidden=true;actions.append(retry);actions.append(q('#open-result'),q('#task-details'));content.append(actions,q('#result-context'),q('#status'),q('#progress'));status.append(content);q('#status').hidden=true;q('#result-context').hidden=true;
 const logs=make('details','task-log-drawer');const logSummary=make('summary');logSummary.innerHTML='<span>☷</span><span>任务记录与日志</span>';const count=make('small','task-log-count');logSummary.append(count);logs.append(logSummary,q('#recent-tasks'));footer.append(logs);
 const raw=q('#diagnostic-text'),diagnostics=make('details','raw-diagnostics');const rawTitle=make('summary');rawTitle.textContent='原始日志';raw.before(diagnostics);diagnostics.append(rawTitle,raw);
 const taskSummary=make('pre','task-result-summary');diagnostics.before(taskSummary);
 const copyLog=make('button','copy-task-log','text-button');copyLog.type='button';copyLog.textContent='复制脱敏日志';diagnostics.append(copyLog);
 const openDiagnostic=make('button','open-task-diagnostic','text-button');openDiagnostic.type='button';openDiagnostic.textContent='查看本次诊断';openDiagnostic.hidden=true;diagnostics.before(openDiagnostic);
 const diagnosticId=()=>raw.textContent.match(/\b\d{8}T\d{6}Z-[a-f0-9]{8}\b/)?.[0];
 new MutationObserver(()=>{openDiagnostic.hidden=!diagnosticId();}).observe(raw,{childList:true,characterData:true,subtree:true});
 openDiagnostic.onclick=()=>{const id=diagnosticId();if(id)chrome.tabs.create({url:chrome.runtime.getURL('manage.html')+'?diagnostic='+encodeURIComponent(id)+'#tools'});};
 copyLog.onclick=async()=>{const text=raw.textContent.replace(/([?&](?:token|xsec_token|signature|auth)[^=]*=)[^\s&#]+/gi,'$1[已隐藏]').replace(/(?:Cookie|Authorization):[^\r\n]*/gi,'[已隐藏]');try{await navigator.clipboard.writeText(text);copyLog.textContent='已复制';}catch(_){copyLog.textContent='复制失败，可手动选择文本';}};
 q('#scroll-content').tabIndex=0;document.documentElement.classList.add('popup-redesign');
 function resultSummary(progress) {
  const en = globalThis.UI?.language === 'en';
  const labels = new Set();
  const records = Object.values(progress?.records || {});
  const failures = records.filter(record => /failed|partial/.test(record.status || ''));
  const lines = [progress?.message, progress?.details].filter(Boolean).join('\n').split(/\r?\n/);
  const failed = failures.length || /failed|partial/.test(progress?.status || '');
  if (!failed) return [...new Set([progress?.context?.title, lines.find(Boolean)].filter(Boolean))].join('\n');
  const listed = [];
  for (const line of lines) {
   const match = line.match(/^(https?:\/\/\S+?)(?:：|:\s)\s*(.+)$/);
   if (match && /失败|未能|中断|错误|timeout|error|拒绝|没有|未确认/i.test(match[2])) listed.push([match[1], match[2]]);
  }
  const sources = failures.length ? failures.map(r => [r.title || r.url, r.reason || r.message]) :
    listed.length ? listed : [[progress?.context?.title, lines.join('\n')]];
  for (const [item, reason] of sources) {
   const why = String(reason || '');
   let hint;
   if (/No module named|ModuleNotFoundError/i.test(why)) hint = en ? 'Download component could not start. Update RefTray and retry.' : '下载组件未能启动。请更新灵感采集后重试。';
   else if (/后台缺少|Not Found|HTTP 404 · \//.test(why)) hint = en ? 'The local service is missing this feature. Start the installed RefTray.' : '当前后台缺少所需功能，请启动已安装的 RefTray。';
   else if (/未找到本人帖子|未识别到当前主页的作品链接/.test(why)) hint = en ? 'Posts on this profile could not be identified. Refresh the profile and retry.' : '未识别到主页里的作品。请刷新主页后重试。';
   else if (/身份|mismatch|不匹配/.test(why)) hint = en ? 'The source could not be matched to this post. Reopen the original post.' : '媒体与当前帖子未能对应。请从原帖详情页重试。';
   else if (/403|401|登录|login|sign in/i.test(why)) hint = en ? 'Access may require sign-in. Open the original post and check access.' : '访问可能需要登录。请打开原帖确认能看到作品，再重试。';
   else if (/reset|timeout|timed out|中断|超时|connection|连接/i.test(why)) hint = en ? 'Media transfer was interrupted. Check the connection and retry this item.' : '媒体传输中断。请检查连接后重试此项。';
   else if (/正文|没有.*图片|无.*媒体|未确认.*媒体/.test(why)) hint = en ? 'Post media could not be confirmed. Open the original post and retry.' : '未能确认正文媒体。请打开原帖，等图片加载后重试。';
   else hint = en ? 'Some content could not be saved. Check the original post and retry the failed item.' : '部分内容未能保存。请核对原帖并重试失败项，具体原因见原始日志。';
   labels.add([item, hint].filter(Boolean).join(' · '));
  }
  const all = [...labels];
  return all.slice(0, 6).concat(all.length > 6 ? [en ? 'See log for remaining items.' : '其余项目见原始日志。'] : []).join('\n');
 }
 function rawDetails(p){
  if(!p)return '';
  const lines=[p.context?.title,p.context?.url,p.task_id||p.id,p.message,p.details,
   ...Object.values(p.records||{}).flatMap(r=>[r.url,r.reason,r.message,
     ...(r.result?.results||[]).flatMap(item=>[item.message,item.details])])];
  return [...new Set(lines.filter(Boolean))].join('\n');
 }
 globalThis.PopupPresentation={
  rawDetails,
  resultSummary,
  paint(p,active){
   const t=s=>globalThis.UI?.t(s)||s,b=p?.batch;const states={awaiting_approval:'等待确认',needs_library:'素材库未就绪',completed:'已完成',partial:'部分完成',failed:'保存失败',stopped:'已停止',paused:'已暂停',stopping:'正在收尾'};
   q('#retry-failed').hidden=active||!['partial','failed','stopped'].includes(p?.status);
   if(!q('#task-dialog').open)q('#task-result-summary').textContent=resultSummary(p);
   q('#result-title').textContent=t(states[p?.status]||(active?'处理中':'待开始'));
   const display=TaskProgress.labels(p||{},active,UI.language==='en');
   if(active&&p?.status!=='awaiting_approval'&&display.phase>=0)q('#result-title').textContent=(UI.language==='en'?['Resolving','Downloading','Processing','Saving']:['正在解析','正在下载','正在处理','正在保存'])[display.phase];
   q('#result-aggregate').textContent=display.aggregate;q('#result-counts').textContent=display.counts;
   q('#result-current').textContent=active?display.current:(!b?(['failed','partial'].includes(p?.status)?resultSummary(p):p?.message||t('选择采集内容后开始')):'');
   q('#result-stages').hidden=!active||display.phase<0;
   [...q('#result-stages').children].forEach((el,i)=>{el.textContent=(UI.language==='en'?['Resolve','Download','Process','Save']:['解析','下载','处理','保存'])[i];el.classList.toggle('current',i===display.phase);el.setAttribute('aria-current',i===display.phase?'step':'false');});
   const ring=TaskProgress.ring(p||{},active);
   q('#ring-number').textContent=ring.text;q('.task-ring small').textContent=t(ring.label);
   q('.task-ring').classList.toggle('indeterminate',ring.indeterminate);
   q('.task-ring').setAttribute('aria-label',t(ring.label)+' '+ring.text);
   q('#ring-value').style.strokeDashoffset=String(175.93*(1-ring.percent/100));
  },
  count(n){q('#task-log-count').textContent=n+' '+(globalThis.UI?.language==='en'?'tasks':'条');}
 };
})();
