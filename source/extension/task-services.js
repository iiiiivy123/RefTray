// Service-backed history; preparation never downloads media bodies.
let batchDownloadItem=null;
let approvedSizes=new Map(),downloadConsent=false;
async function service(path,body){return downloadApi(8766,healthCache.settings_token,path,body);}
async function probeSource(source,group={}){
  if(source.canonical_url){
    const local=await service('/video/reuse',{...source,...group,capture_scope:group.list_url?'batch':taskContext.options.capture_scope,save_directory:typeof taskContext.directory==='string'?taskContext.directory:'',duplicate_policy:taskContext.options.duplicate_policy||'fill',output_format:taskContext.options.output_format==='audio'?'audio':source.kind==='gif'?'gif':'original',trim_start:taskContext.options.trim_start||0,trim_end:taskContext.options.trim_end||0});
    if(local.local)return local;
  }
  if(source.resolver_id)return service('/media/probe',{resolver_id:source.resolver_id});
  if(source.media_kind?.startsWith('bilibili')&&!healthCache.bilibili_mux)throw new Error('本地服务缺少B站音视频合并组件，请更新完整安装包；不会保存无声视频');
  const urls=[source.url,...(source.audio_url?[source.audio_url]:[])];
  const result=await service('/video/probe',{urls,destination:taskContext.options.destination,duplicate_policy:source.audio_url?'refresh':taskContext.options.duplicate_policy});
  return {bytes:result.items.length===urls.length&&result.items.every(i=>Number.isFinite(i.bytes))?result.items.reduce((n,i)=>n+i.bytes,0):null,local:result.items.every(i=>i.local)};
}
function startPreparation(){approvedSizes=new Map();downloadConsent=false;}
async function existingCapture(url){
  if(taskContext.batch)return null; // A copy in another collection is not a copy in this destination.
  if(taskContext.options.subtitle_mode&&taskContext.options.subtitle_mode!=='none')return null; // Existing video does not prove the requested subtitles exist.
  if(!healthCache?.capture_history || taskContext.options.duplicate_policy!=='skip')return null;
  const required=taskContext.options.collection_mode==='text'?['text']:['images'];
  if(taskContext.options.collection_mode==='text'){
    if(taskContext.options.include_images)required.push('images');
    if(taskContext.options.include_comments)required.push('comments');
    if(taskContext.options.ocr_enabled&&taskContext.options.include_images)required.push('ocr');
  }
  if(taskContext.options.include_videos)return null; // Never infer an unseen video's completeness.
  const {item}=await service('/history/lookup',{url,required});
  if(item&&taskContext.options.destination){const norm=p=>p.replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();if(!norm(item.directory).startsWith(norm(taskContext.options.destination)+'/'))return null;}
  return item?{status:'skipped',existing:true,url,directory:item.directory,reason:'已有可用副本（上次已加载内容）；未复制到本次目录，也未刷新评论：'+item.directory}:null;
}

async function approveDownloads(entries){
  const unique=new Map();let unknown=0;
  for(const e of entries){for(const estimate of e.estimates)unique.set(estimate.source.url,estimate);if(e.issue)unknown++;}
  if(!unique.size&&!unknown)return;
  let known=0;for(const [url,item]of unique){if(item.bytes==null)unknown++;else known+=item.bytes;approvedSizes.set(url,item.bytes);if(item.bytes>(taskContext.options.max_video_mb||512)*1048576)throw new Error('有视频超过单个文件上限，请修改设置或跳过视频。');}
  // Consent is scoped to this task; later sources still get size probes and hard byte limits.
  if(downloadConsent || [...unique.values()].every(e=>e.local) && !unknown)return;
  const local=[...unique.values()].reduce((n,e)=>n+(e.local?(e.bytes||0):0),0);
  const qualities=[...new Set([...unique.values()].map(e=>e.source.quality||'当前源（未标注画质）'))].join('、');
  const format=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':(n/1048576).toFixed(1)+' MB';
  const message=`实际画质：${qualities}\n当前媒体已知大小 ${format(known)}（可本地复用 ${format(local)}），${unknown} 项大小或地址未知。\n单个下载上限 ${format((taskContext.options.max_video_mb||512)*1048576)}；下载中超限会停止。\n逐篇保存，不预扫整批。确认同时授权本任务后续符合上限的媒体；总量未知。不会检查或预留磁盘空间。`;
  await chrome.storage.local.set({collectorApproval:{state:'pending',message,createdAt:Date.now()}});
  await reportProgress({message:'媒体预检完成，等待确认下载',details:message});
  while(true){await controlPoint();const {collectorApproval:a}=await chrome.storage.local.get(['collectorApproval']);if(a?.state==='approved')break;if(!a||a.state==='rejected')throw new Error('USER_STOPPED');await wait(750);}
  downloadConsent=true;
  await chrome.storage.local.remove('collectorApproval');
}
