/* Batch counters and current-media percentages are separate contracts. */
(() => {
 function counters(job){const rows=Object.values(job.records||{}).filter(r=>!['pending','planned'].includes(r.status)),sum=k=>rows.reduce((n,r)=>n+(Number(r[k])||0),0);return {processed:rows.length,saved:rows.filter(r=>['saved','partial'].includes(r.status)).length,failed:rows.filter(r=>['failed','partial'].includes(r.status)).length,skipped:rows.filter(r=>r.status==='skipped').length,limit:job.limit,total:job.queue_complete?job.queue.length:null,videoOnly:Boolean(job.options?.video_only),handledVideos:sum('video_count'),savedVideos:sum('videos'),existingVideos:sum('existingVideos')};}
 function overall(batch){return batch.videoOnly?(batch.limit?Math.min(100,batch.handledVideos/batch.limit*100):null):batch.total?Math.min(100,batch.processed/batch.total*100):null;}
 function reduce(previous={},value={},job){const batch=job?counters(job):previous.batch;const percent=typeof value.percent==='number'&&Number.isFinite(value.percent)?value.percent:null;return {...previous,...value,stage:value.stage||null,batch,current:{message:value.message||previous.current?.message||'',percent,stage:value.stage||null},percent:batch?overall(batch):percent};}
 function ring(value={},active=false){
  const percent=value.batch?overall(value.batch):value.percent;
  const known=typeof percent==='number'&&Number.isFinite(percent),n=known?Math.min(100,Math.max(0,percent)):0;
  const terminal={completed:['✓','本轮完成'],partial:['!','部分完成'],failed:['!','保存失败'],stopped:['■','已停止'],paused:['Ⅱ','已暂停']};
  if(terminal[value.status])return {text:terminal[value.status][0],label:terminal[value.status][1],percent:value.status==='completed'?100:n,indeterminate:false};
  return {text:known?Math.round(n)+'%':active?'…':'—',label:value.batch?.videoOnly?'本轮视频':known?(value.batch?'本轮进度':'当前进度'):active?'处理中':'处理进度',percent:n,indeterminate:active&&!known};
 }
 function labels(p={},active=false,en=false){
  const b=p.batch,c=p.current||{},percent=typeof c.percent==='number'&&Number.isFinite(c.percent)?' · '+Math.round(c.percent)+'%':'';
  const aggregate=!b?'':b.videoOnly?(en?`Checked ${b.processed} posts · Videos ${b.handledVideos} / target ${b.limit}`:`已检查 ${b.processed} 帖 · 已处理视频 ${b.handledVideos} / 本轮目标 ${b.limit} 个`):(en?`Processed ${b.processed}${b.total?' / '+b.total:''} · Limit ${b.limit}`:`已处理 ${b.processed}${b.total?' / '+b.total:''} 篇${b.total?'':' · 本轮最多 '+b.limit+' 篇'}`);
  const counts=!b?'':b.videoOnly?(en?`New ${b.savedVideos} · Existing ${b.existingVideos} · Failed ${b.failed} posts · Skipped ${b.skipped} posts`:`新保存 ${b.savedVideos} 个 · 已有 ${b.existingVideos} 个 · 失败 ${b.failed} 帖 · 跳过 ${b.skipped} 帖`):[b.saved?(en?`Saved ${b.saved}`:`保存 ${b.saved} 篇`):'',b.skipped?(en?`Skipped ${b.skipped}`:`跳过 ${b.skipped} 篇`):'',b.failed?(en?`Failed ${b.failed}`:`失败 ${b.failed} 篇`):''].filter(Boolean).join(' · ');
  const item=b?(en?'Current item: ':'当前项：')+(c.index?(en?`video ${c.index}/${c.total} · `:`本帖视频 ${c.index}/${c.total} · `):'')+(c.title?c.title.slice(0,42)+' · ':''):'';
  const current=active?item+(c.message||p.message||(en?'Preparing':'正在准备')).split('\n')[0]+percent:'';
  const phases=['resolving','downloading','processing','saving'],stage=p.stage||c.stage;
  const phase=stage==='connecting'||stage==='checking'?0:stage==='verifying'?2:phases.indexOf(stage);
  return {aggregate,counts,current,phase};
 }
 globalThis.TaskProgress={counters,reduce,ring,labels};
})();
