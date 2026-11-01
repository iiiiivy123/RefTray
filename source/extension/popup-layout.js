// Presentation-only composition: move existing controls; keep their IDs and handlers.
(() => {
 const q=s=>document.querySelector(s), create=(tag,id,cls)=>{const e=document.createElement(tag);if(id)e.id=id;if(cls)e.className=cls;return e;};
 const main=q('#main-options'), advanced=create('details','advanced-options','advanced-options');
 const summary=create('summary');summary.textContent='更多选项';advanced.append(summary);
 const body=create('div',null,'advanced-body');advanced.append(body);
 const duplicate=q('#duplicate-policy').closest('label');duplicate.hidden=false;
 for(const s of ['#quality-row','#quality-help','#subtitle-row','#subtitle-help','#trim-options'])body.append(q(s));
 body.append(duplicate,q('#duplicate-help'),q('#secondary-options'));
 main.append(advanced);
 const images=create('label','include-images-option');images.innerHTML='<input id="include-images" type="checkbox" checked>保存正文图片';q('#text-options').prepend(images);
 const limit=create('label','download-limit-row','field');limit.innerHTML='<span>单个下载上限</span><span class="number-unit"><input id="download-limit" type="number" min="0.001" max="1048576" step="any" value="512" aria-label="单个下载上限"><select id="download-unit" aria-label="下载上限单位"><option value="MB">MB</option><option value="GB">GB</option></select></span>';
 body.prepend(limit);
 const hints=create('p',null,'hint');hints.textContent='只限制下载大小；不检查或预留磁盘空间。未知大小的媒体会在下载中检查上限。';limit.after(hints);
 const range=create('div','batch-range');range.innerHTML='<label class="field"><span>跳过前几篇</span><input id="skip-posts" type="number" min="0" max="499" value="0"></label><p class="hint">按当前列表顺序，0 从第一篇开始；跳过项不占采集额度。</p><div id="duration-filter"><label class="field"><span>最短时长（秒）</span><input id="min-duration" type="number" min="0" max="86400" value="0"></label><label class="field"><span>最长时长（秒）</span><input id="max-duration" type="number" min="0" max="86400" value="0"></label><p class="hint">0 表示不限；设置范围后，无法确认时长的媒体会跳过并记录原因。</p></div>';
 body.prepend(range);
 q('#more-options').querySelector('span').textContent='调整抽帧参数';
 const frameHelp=create('p',null,'hint');frameHelp.textContent='合并相近画面：适合课件、分镜；定时取图：适合普通视频。采样间隔越大，输出图片通常越少。';q('#frame-options').append(frameHelp);
 q('#scope-current').textContent='当前作品';q('#scope-bulk').textContent='批量采集';
 const footer=q('.start-bar'),status=q('.status-card');footer.append(status);
 const ring=create('div','task-ring','task-ring');ring.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="ring-track" cx="32" cy="32" r="28"/><circle id="ring-value" cx="32" cy="32" r="28"/></svg><div><strong id="ring-number">—</strong><small>处理进度</small></div>';
 status.prepend(ring);const content=create('div',null,'result-body');for(const e of [...status.children])if(e!==ring)content.append(e);status.append(content);
 const logs=create('details','task-log-drawer');const logSummary=create('summary');logSummary.textContent='任务记录与日志';const count=create('small','task-log-count');logSummary.append(count);logs.append(logSummary,q('#recent-tasks'));footer.append(logs);
 document.documentElement.classList.add('popup-redesign');
 globalThis.PopupPresentation={
  paint(progress,active){const raw=progress?.percent,known=typeof raw==='number'&&Number.isFinite(raw);const n=known?Math.min(100,Math.max(0,raw)):0;q('#ring-number').textContent=known?Math.round(n)+'%':'—';q('#ring-value').style.strokeDashoffset=String(175.93*(1-n/100));q('#task-ring').setAttribute('aria-label',known?'处理进度 '+Math.round(n)+'%':'暂无可计算的处理进度');},
  count(n){q('#task-log-count').textContent=n+' 条';}
 };
})();
