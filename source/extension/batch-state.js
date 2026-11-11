// Batch accounting and checkpoint rules. No browser, network or task singleton.
(() => {
const videoBatch = job => Boolean(job?.options?.video_only);
const batchRecorded = (job,key) => Boolean(job.records[key] && job.records[key].status !== 'pending');
const batchScannedCount = job => Object.values(job.records).filter(r=>r.status!=='pending').length;
const batchCount = job => Object.values(job.records).filter(r=>r.status!=='pending').reduce((n,r)=>n+(videoBatch(job)?(r.video_count||0):r.quota_exempt?0:1),0);
const batchFull = job => batchCount(job) >= job.limit || batchScannedCount(job) >= 500;
function skipLeadingPost(job,key){
  const limit=Math.max(0,Math.min(499,Number(job.options.skip_posts)||0));
  job.leading_keys ||= [];
  if(job.leading_keys.includes(key))return true;
  if(job.leading_keys.length>=limit)return false;
  job.leading_keys.push(key);return true;
}
function durationRejection(job,source){
  const min=Number(job?.options?.min_duration)||0,max=Number(job?.options?.max_duration)||0;
  if(!min&&!max)return '';
  const duration=Number(source.duration);
  if(!Number.isFinite(duration)||duration<=0)return '已跳过：无法确认媒体时长，不猜测是否符合范围';
  if(min&&duration<min)return `已跳过：时长 ${duration.toFixed(1)} 秒短于最短 ${min} 秒`;
  if(max&&duration>max)return `已跳过：时长 ${duration.toFixed(1)} 秒长于最长 ${max} 秒`;
  return '';
}
function batchLimit(value) {
  if (value === 'all') return 500;
  const n = Number(value ?? 20);
  if (!Number.isInteger(n) || n < 1 || n > 500) throw new Error('篇数请填写 1–500；全部也有每轮 500 篇安全上限。');
  return n;
}
function batchSummary(job) {
  const records = Object.values(job.records);
  const sum = k => records.reduce((n, r) => n + (r[k] || 0), 0);
  if(job.options?.video_only){const kind=job.options.output_format==='audio'?'音频':'视频';return `已检查 ${records.length} 条 · 待下载 ${records.filter(r=>r.status==='planned').length} · 已保存${kind} ${sum('videos')} · 已有 ${sum('existingVideos')} · 失败/部分失败 ${records.filter(r=>['failed','partial'].includes(r.status)).length} 条\n${job.directory?'保存位置：'+job.directory:'尚未确认文件落盘'}`;}
  return `符合范围 ${records.filter(r=>!r.quota_exempt).length}/${job.limit} 篇 · 已检查 ${records.length} 篇 · 图文 ${sum('documents')} 篇 · 新增图片 ${sum('images')} · 重复图片 ${sum('duplicates')} · 视频 ${sum('videos')}\n跳过 ${records.filter(r => r.status === 'skipped').length} 篇 · 失败/部分失败 ${records.filter(r => r.status === 'failed' || r.status === 'partial').length} 篇\n${job.directory ? '保存位置：' + job.directory : '尚未确认文件落盘'}`;
}

const api={videoBatch,batchRecorded,batchScannedCount,batchCount,batchFull,skipLeadingPost,durationRejection,batchLimit,batchSummary};
globalThis.RefTrayBatchState=api;
if(typeof module!=='undefined')module.exports=api;
})();
