// Persistent, one-task-at-a-time batch journal. Content navigation stays platform-specific.

const videoBatch = () => Boolean(taskContext.batch?.options?.video_only);
const batchRecorded = key => Boolean(taskContext.batch.records[key] && taskContext.batch.records[key].status !== 'pending');
const batchScannedCount = () => Object.values(taskContext.batch.records).filter(r=>r.status!=='pending').length;
const batchCount = () => Object.values(taskContext.batch.records).filter(r=>r.status!=='pending').reduce((n,r)=>n+(videoBatch()?(r.video_count||0):r.quota_exempt?0:1),0);
const batchFull = () => batchCount() >= taskContext.batch.limit || batchScannedCount() >= 500;
function skipLeadingPost(key){
  const limit=Math.max(0,Math.min(499,Number(taskContext.batch.options.skip_posts)||0));
  taskContext.batch.leading_keys ||= [];
  if(taskContext.batch.leading_keys.includes(key))return true;
  if(taskContext.batch.leading_keys.length>=limit)return false;
  taskContext.batch.leading_keys.push(key);return true;
}
function durationRejection(source){
  const min=Number(taskContext.batch?.options?.min_duration)||0,max=Number(taskContext.batch?.options?.max_duration)||0;
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
async function saveBatch() {
 taskContext.batch.id ||= taskContext?.id||crypto.randomUUID();
 await TaskStore.save(taskContext.batch);
}
async function beginBatch(tab, mode, options) {
  const url = new URL(tab.url);const playlist=/(^|\.)youtube\.com$/.test(url.hostname)&&url.pathname==='/playlist'?url.searchParams.get('list'):null;url.search = '';if(playlist)url.searchParams.set('list',playlist); url.hash = ''; url.pathname = url.pathname.replace(/\/$/, '');
  await TaskStore.reconcile().catch(()=>{});
  const previous = (await chrome.storage.local.get(['collectorCheckpoint'])).collectorCheckpoint;
  if (options.resume && previous && !previous.completed) {
    if(['organized','organized_flat'].includes(options.layout) && !['four-categories-v1','function-platform-v2'].includes(previous.options.directory_schema))throw new Error('旧版任务使用不同目录结构。已保存文件保留；请取消续采并开始新任务，避免同一任务分散到两个目录。');
    if (previous.source !== url.href || previous.mode !== mode || Boolean(previous.options.video_only)!==Boolean(options.video_only) || (previous.options.collection_mode || 'images') !== (options.collection_mode || 'images')) throw new Error('待续任务属于其他页面或采集模式，请回到原页面和模式；或取消续采开始新任务。');
    // A resumed task pins its original root, independent of the new library default.
    previous.options.destination ||= previous.root;
    taskContext.batch = previous;
  } else taskContext.batch = {source: url.href, mode, name: tab.title, root: taskContext.directory, options: {...options}, limit: batchLimit(options.limit), records: {}, queue: [], completed: false};
  delete taskContext.batch.error;
  taskContext.options=CaptureOptions.snapshot(taskContext.batch.options);taskContext.batch.options=taskContext.options;
  if(typeof taskContext.imageQuotaUsed!=='undefined')taskContext.imageQuotaUsed=taskContext.batch.image_used||0;
  for(const record of Object.values(taskContext.batch.records))if(record.status==='planned'){record.status='pending';record.reason='恢复后重新确认临时媒体地址与大小，尚未下载';}
  // Never persist resolved URLs or approval tokens; resume revalidates unfinished works.
  if(options.resume && Object.values(taskContext.batch.records).some(r=>r.status==='pending'))await reportProgress({message:'正在恢复未完成作品；已保存作品保留，未下载作品将重新预检并确认'});
  if(typeof startPreparation==='function')startPreparation();
  await saveBatch();
}
async function recordPost(key, record) {
  taskContext.batch.records[key] = record;
  if(record.directory){
    const normalized=record.directory.replace(/\\/g,'/').replace(/\/$/,'');
    const parent=normalized.substring(0,normalized.lastIndexOf('/'));
    taskContext.batch.directory ||= taskContext.batch.mode==='board'?record.directory:parent;
  }
  await saveBatch();
  await reportProgress({percent:null,stage:'scanning',message: batchSummary(taskContext.batch), details: Object.values(taskContext.batch.records).filter(r => r.reason).map(r => r.reason).join('\n')});
}
async function batchProblem(tabId) {
  const problem = await pageProblem(tabId);
  if (problem === 'verification') throw new Error('NEEDS_ATTENTION: 页面需要验证或重新登录。已保留断点，请手动处理后续采。');
  return problem;
}
async function processBatchPost(tab, port, group, payload) {
  let images = 0, duplicates = 0, videos = 0, existingVideos = 0, documents = 0, filteredVideos=0, directory, failed = false;
  const textMode = taskContext.options.collection_mode === 'text';
  const reasons = [];
  let media = payload._preparedMedia || payload._media || (await loadedPageMedia(tab.id,Boolean(taskContext.options.video_only))).media;
  const foundMedia=media;
  if(taskContext.options.skip_gifs)media=media.filter(m=>m.kind!=='gif'&&m.extension!=='gif'&&!m.live_missing);
  if(!taskContext.options.video_only&&!taskContext.options.md_only&&!taskContext.options.include_videos&&payload.has_video&&(media.some(m=>m.kind==='video')||payload.platform==='x'&&!media.length&&!payload.images?.length)&&!media.some(m=>m.kind==='photo'||m.kind==='gif'))return {status:'skipped',quota_exempt:true,url:payload.canonical_url,reason:'已跳过视频，不占目标篇数'};
  if(taskContext.options.skip_gifs&&(foundMedia.length>media.length||payload._skippedMotion)){
    payload.has_live_photo=false;if(payload.platform!=='x')payload.images=media.filter(m=>m.kind==='photo').map(m=>({url:m.url,alt:''}));
    payload.has_video=media.some(m=>m.kind==='video');
    if(!media.length&&!payload.images?.length&&(!textMode||!payload.body_text?.trim()))return {status:'skipped',quota_exempt:true,url:payload.canonical_url,reason:'已按设置跳过动图，不占目标篇数'};
  }
  if(payload.platform==='x' && !textMode && !taskContext.options.video_only && payload.body_text?.trim() && !payload.images?.length && !media.length && !payload.has_video && !payload._preflightIssue){
    return {status:'skipped',quota_exempt:true,url:payload.canonical_url,reason:'纯文字帖，已跳过，不占图片目标篇数'};
  }
  if(!taskContext.options.md_only&&(media.some(m=>m.live_missing)||payload.has_live_photo&&!media.some(m=>m.live_photo))){failed=true;reasons.push('部分实况动图动态源尚未确认，静态封面不代表完整动图');}
  let videoMeta={};
  if(taskContext.options.video_only){
    media=media.filter(m=>m.kind==='video'||m.kind==='gif');
    if(!media.length&&payload.has_video&&!payload._preflightIssue){
      try{const source=await videoSource(tab,{});media=[{...source,kind:'video'}];}
      catch(error){return {status:'failed',video_count:1,url:payload.canonical_url,reason:error.message};}
    }
    if(!payload._preparedMedia){
      const seen=new Set(Object.values(taskContext.batch.records).flatMap(r=>r.video_urls||[]));
      media=media.filter(m=>m.url&&!seen.has(m.url)&&(seen.add(m.url),true)).slice(0,Math.max(0,taskContext.batch.limit-batchCount()));
    }
    if(!media.length)return {status:'skipped',video_count:0,url:payload.canonical_url,reason:'没有新的可采视频；图片帖不占额度'};
    videoMeta={video_count:media.length,video_urls:media.map(m=>m.url)};
    payload={...payload,images:[],body_text:''};
  }
  // Persist this post now; media downloads use their own per-source protection.
  if(payload._preflightIssue){failed=true;reasons.push(payload._preflightIssue);}
  const photos = media.filter(m => m.kind === 'photo').map(m => ({url: m.url, alt: ''}));
  if ((photos.length || media.length || payload._media?.length || payload._preparedMedia?.length) && (!textMode || taskContext.options.include_images)) payload.images = payload.platform==='x' ? [...new Map([...(payload.images||[]),...photos].map(i=>[i.url,i])).values()] : photos;
  if(textMode&&taskContext.options.include_comments&&taskContext.options.include_images&&!taskContext.options.md_only){for(const c of payload.comments||[])for(const url of c.images||[])if(!payload.images.some(i=>i.url===url))payload.images.push({url,alt:'评论 '+c.id,role:'comment',comment_id:c.id});}
  if(taskContext.options.skip_gifs)payload.images=(payload.images||[]).filter(i=>! /\.gif(?:[?#]|$)/i.test(i.url));
  if(textMode && !taskContext.options.include_images && !taskContext.options.ocr_enabled)payload.images=[];
  if (payload.images?.length || (textMode && payload.body_text?.trim())) {
    const result = await submit({...payload, ...group}, payload.canonical_url, port);
    images += result.new_images || 0; duplicates += result.duplicate_images || 0; directory = result.directory;
    failed ||= Boolean(result.failed_images||result.partial);
    documents = textMode ? 1 : 0;
    reasons.push(...(result.warnings || []));
  }
  const candidates = media.filter(m => m.kind === 'video' || m.kind === 'gif');
  if (payload.has_video && !candidates.length && !payload._preflightIssue) candidates.push({});
  if (candidates.some(m=>m.kind!=='gif') && !taskContext.options.include_videos) reasons.push('已跳过视频：批量视频开关关闭');
  const selectedCandidates=candidates.filter(m=>taskContext.options.include_videos||!taskContext.options.md_only&&(!textMode||taskContext.options.include_images)&&m.kind==='gif');
  for (const [index,candidate] of selectedCandidates.entries()) {
    await controlPoint();
    try {
      if(taskContext.batch)batchDownloadItem={index:index+1,total:selectedCandidates.length,title:payload.page_title};
      const result = await downloadVideo(tab, port, {...taskContext.options, group, source: candidate.url ? {...candidate, canonical_url: payload.canonical_url, page_title: payload.page_title} : null}, healthCache, taskContext.options.extract_frames);
      if(result.skipped){filteredVideos++;reasons.push(result.message);continue;}
      if(candidate.kind==='gif')reasons.push('动态源已转换为 GIF 动图保存。');
      videos += result.new_videos || 0;
      documents += result.documents || 0;
      existingVideos += result.duplicate_videos || 0;
      if(result.partial) {failed=true; reasons.push(result.message);}
      images += result.new_images || 0;
      duplicates += result.duplicate_images || 0;
      directory = result.directory || directory;
      if(textMode && documents && result.video_file)await submit({...payload,...group,images:[],media_files:[result.video_file]},payload.canonical_url,port);
    } catch (error) {
      if (error.message === 'USER_STOPPED' || error.message.includes('NEEDS_ATTENTION')) throw error;
      failed = true; reasons.push(error.message);
    } finally {
      batchDownloadItem=null;
    }
  }
  if(videoMeta.video_count)videoMeta.video_count=Math.max(0,videoMeta.video_count-filteredVideos);
  return {...videoMeta,...(filteredVideos&&videoMeta.video_count===0?{quota_exempt:true}:{}),status: failed ? (images || duplicates || videos || existingVideos || documents ? 'partial' : 'failed') : images || duplicates || videos || existingVideos || documents ? 'saved' : 'skipped', images, duplicates, videos, existingVideos, documents, directory,
    reason: reasons.join('\n') || (existingVideos ? `重复视频 ${existingVideos} 个，已确认文件存在` : !images && !duplicates && !videos && !documents ? '没有已加载的可保存媒体' : ''), url: payload.canonical_url};
}
async function finishBatch() {
  // Every post has already been committed; there is no deferred whole-batch pass.
  taskContext.batch.completed = !Object.values(taskContext.batch.records).some(r=>r.status==='pending'); await saveBatch();
  if(!taskContext.batch.completed)return {status:'partial',directory:taskContext.batch.directory,message:'部分待恢复作品尚未重新加载，断点已保留，请回原列表加载后续采。'};
  const records=Object.values(taskContext.batch.records),failed=records.some(r=>['failed','partial'].includes(r.status));
  const unmet=batchCount()<taskContext.batch.limit&&!taskContext.batch.retryKeys;
  if(unmet)return {status:failed&&!records.some(r=>['saved','partial'].includes(r.status))?'failed':'partial',end_reason:'limit_unreached',directory:taskContext.batch.directory,message:'已结束：未达到本次上限 '+batchCount()+'/'+taskContext.batch.limit+' 篇\n'+batchSummary(taskContext.batch),details:records.filter(r=>r.reason).map(r=>r.url+': '+r.reason).join('\n')};
  return {status:failed?(records.some(r=>['saved','partial'].includes(r.status))?'partial':'failed'):'saved',directory:taskContext.batch.directory,message: batchSummary(taskContext.batch) + '\n仅表示本轮已处理的内容，未确认全部轮播或全部历史作品。', details: records.filter(r => r.reason).map(r => `${r.url}: ${r.reason}`).join('\n')};
}
async function runXhsBatch(tab, port, options) {
  const snapshot=async()=>{const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['xhs-list.js']});if(!result||result.error)throw Error(result?.error||'未确认列表范围');return result;};
  const group=await snapshot();
  if (!/^\/user\/profile\/[a-f0-9]{24}\/?$/i.test(new URL(tab.url).pathname)) throw new Error('请先回到作者主页，再开始或继续任务。');
  await beginBatch(tab, group.list_kind==='favorites'?'favorites':'author', options); await inject(tab.id);
  let idle = 0;
  while (!batchFull() && idle < 4 && batchScannedCount() < 500) {
    await controlPoint(); await batchProblem(tab.id);
    const currentList=await snapshot();
    if(currentList.list_url!==group.list_url)throw Error('当前列表已切换，已停止并保留断点');
    const data = await chrome.tabs.sendMessage(tab.id, {type:'LIBLIB_CARDS'});
    if (!Array.isArray(data?.cards)) throw new Error('无法读取作者卡片，已保留断点。');
    const card = data.cards.find(c => !batchRecorded(c.id) && (!taskContext.batch.retryKeys || taskContext.batch.retryKeys.includes(c.id)));
    if (!card) { idle++; await chrome.tabs.sendMessage(tab.id,{type:'LIBLIB_SCROLL'}); await controlledWait(2500); continue; }
    idle = 0;
    if(skipLeadingPost(card.id)){await recordPost(card.id,{status:'skipped',quota_exempt:true,video_count:0,url:card.url,reason:'按设置跳过列表前部作品'});continue;}
    if(typeof existingCapture==='function'){
      const old=await existingCapture(card.url);if(old){await recordPost(card.id,old);continue;}
    }
    const opened = await chrome.tabs.sendMessage(tab.id,{type:'LIBLIB_OPEN_WORK',url:card.url});
    if (!opened?.opened) throw new Error('未能打开卡片，停止以避免采集错帖。');
    let payload, unavailable = false;
    for (let i=0;i<12;i++) {
      await controlledWait(1000);
      if (await batchProblem(tab.id) === 'unavailable') { unavailable = true; break; }
      const detail = await chrome.tabs.sendMessage(tab.id,{type:'LIBLIB_DETAIL',id:card.id,options:taskContext.options});
      payload = detail?.payload;
      if (payload?.images?.length || payload?.has_video || payload?.body_text?.trim()) break;
    }
    try {
      const result = payload && !unavailable ? await processBatchPost({...tab,url:payload.canonical_url},port,group,payload) : {status:'failed',reason: unavailable ? '帖子失效或无法访问' : '未确认已加载的正文媒体',url:card.url};
      await recordPost(card.id,result);
    } catch(error) {
      if (error.message === 'USER_STOPPED' || error.message.includes('NEEDS_ATTENTION') || /fetch|保存服务|超时/i.test(error.message)) throw error;
      await recordPost(card.id,{status:'failed',reason:error.message,url:card.url});
    }
    await controlPoint();
    const closed = await chrome.tabs.sendMessage(tab.id,{type:'LIBLIB_CLOSE_WORK'});
    if (!closed?.closed) throw new Error('已记录结果，请手动返回作者主页后续采。');
    await controlledWait(2500);
    if (new URL((await chrome.tabs.get(tab.id)).url).pathname !== new URL(tab.url).pathname) throw new Error('尚未回到作者主页，已保留断点。');
  }
  return finishBatch();
}
async function runBoardBatch(tab, port, options) {
  await beginBatch(tab,'board',options);
  const snapshot = async () => {
    await batchProblem(tab.id);
    const [{result}] = await boundedRead(chrome.scripting.executeScript({target:{tabId:tab.id},files:['board.js']}));
    if (result?.error || !result) throw new Error(result?.error || '无法读取画板');
    return result;
  };
  const board = await snapshot();
  taskContext.batch.queue_complete=false;
  const queue = new Set(taskContext.batch.queue);
  let idle = 0;
  const scanLimit=videoBatch()?500:Math.min(500,taskContext.batch.limit+(Number(taskContext.batch.options.skip_posts)||0));
  for (let round=0;round<80 && idle<4 && queue.size<scanLimit;round++) {
    await controlPoint();
    const data = await snapshot();
    if (data.board_url !== board.board_url) throw new Error('页面离开画板，已停止扫描。');
    const before=queue.size;
    data.urls.forEach(url=>{if(queue.size<scanLimit)queue.add(url);});
    taskContext.batch.queue=[...queue]; await saveBatch();
    idle=queue.size===before?idle+1:0;
    await reportProgress({message:videoBatch()?`扫描「${board.board_name}」 · 已找到 ${queue.size} 篇待检查，视频上限 ${taskContext.batch.limit} 个`:`扫描「${board.board_name}」 · 已找到 ${queue.size}/${taskContext.batch.limit} 篇`});
    if(queue.size>=scanLimit)break;
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>window.scrollBy(0,Math.max(400,innerHeight*.85))});
    await controlledWait(2000);
  }
  if(!queue.size)throw new Error('未识别到画板内的 Pin，未开始保存。');
  taskContext.batch.queue_complete=true;
  await saveBatch();
  await reportProgress({message:`扫描完成 · 本轮 ${queue.size} 篇待处理`});
  let workTab, keep = false;
  try {
    for(const url of queue) {
      if(batchFull())break;
      if(batchRecorded(url))continue;
      if(taskContext.batch.retryKeys&&!taskContext.batch.retryKeys.includes(url))continue;
      if(skipLeadingPost(url)){await recordPost(url,{status:'skipped',quota_exempt:true,video_count:0,url,reason:'按设置跳过列表前部作品'});continue;}
      if(typeof existingCapture==='function'){const old=await existingCapture(url);if(old){await recordPost(url,old);continue;}}
      await controlPoint();
      await reportProgress({message:`读取画板作品 ${Object.keys(taskContext.batch.records).length+1}/${queue.size} · 已满足 ${batchCount()}/${taskContext.batch.limit}`,details:url});
      if(!workTab) workTab=await chrome.tabs.create({url,active:false}); else await chrome.tabs.update(workTab.id,{url});
      let payload;
      for(let attempt=0;attempt<15;attempt++) {
        await controlledWait(1000);
        const current=await chrome.tabs.get(workTab.id);
        if(current.status!=='complete')continue;
        if(await batchProblem(workTab.id)==='unavailable')break;
        if(/\/(login|signin|auth)(\/|$)/i.test(new URL(current.url).pathname))throw new Error('NEEDS_ATTENTION: 请先登录，再返回画板继续任务。');
        const samePin = value => {try {const u=new URL(value);return /(^|\.)pinterest\.(com|cn)$/.test(u.hostname)&&u.pathname.replace(/\/$/,'')===new URL(url).pathname.replace(/\/$/,'');}catch(_){return false;}};
        if(!samePin(current.url))continue;
        try {
          const candidate=await pagePayload(workTab.id,taskContext.options);
          if(samePin(candidate?.canonical_url)&&(candidate.images?.length||candidate.has_video||candidate._skippedMotion)) {payload=candidate;break;}
        } catch(error) {if(/超时|USER_STOPPED/.test(error.message))throw error;continue;}
      }
      try {
        await recordPost(url,payload ? await processBatchPost({...workTab,url},port,{board_url:board.board_url,board_name:board.board_name,list_url:board.board_url,list_kind:'board',list_name:board.board_name,list_owner:decodeURIComponent(new URL(board.board_url).pathname.split('/')[1])},payload) : {status:'failed',url,reason:'等待后仍未确认当前 Pin 的正文媒体；未保存推荐图片，请打开该 Pin 核对后重试'});
      } catch(error) {
        if(error.message==='USER_STOPPED'||error.message.includes('NEEDS_ATTENTION')||/fetch|保存服务|超时/i.test(error.message))throw error;
        await recordPost(url,{status:'failed',url,reason:error.message});
      }
      await controlledWait(Object.keys(taskContext.batch.records).length%10===0?20000:2000);
    }
    return await finishBatch();
  } catch(error) { keep=error.message.includes('NEEDS_ATTENTION'); if(keep&&workTab)await chrome.tabs.update(workTab.id,{active:true}); throw error; }
  finally {if(workTab&&!keep)await chrome.tabs.remove(workTab.id).catch(()=>{});}
}
async function runXBatch(tab, port, options) {
  return runSocialBatch(tab,port,options,'x');
}
async function runSocialBatch(tab, port, options, platform) {
  const huaban=platform==='huaban',artstation=platform==='artstation',instagram=platform==='instagram',bilibili=platform==='bilibili',youtube=platform==='youtube',label=huaban?'花瓣':artstation?'ArtStation':youtube?'YouTube':bilibili?'B站':instagram?'Instagram':'X';
  const postId = value => {
    const u=new URL(value);
    if(huaban)return /^(www\.)?huaban\.com$/.test(u.hostname)?u.pathname.match(/^\/pins\/(\d+)\/?$/)?.[1]:null;
    if(artstation)return /(^|\.)artstation\.com$/.test(u.hostname)?u.pathname.match(/^\/artwork\/([a-zA-Z0-9]+)\/?$/)?.[1]:null;
    if(youtube)return /(^|\.)youtube\.com$/.test(u.hostname)&&u.pathname==='/watch'?u.searchParams.get('v'):null;
    if(bilibili)return CollectorBiliParts.key(value)||(/^(www\.)?bilibili\.com$/.test(u.hostname)?u.pathname.match(/^\/(?:opus\/\d+|read\/cv\d+)\/?$/)?.[0]:null);
    if(instagram)return /(^|\.)instagram\.com$/.test(u.hostname) ? u.pathname.match(/^\/(?:[\w.]+\/)?(?:p|reels?)\/([\w-]{5,30})\/?$/)?.[1] : null;
    return /(^|\.)(x\.com|twitter\.com)$/.test(u.hostname) ? u.pathname.match(/^\/[\w]+\/status\/(\d+)\/?$/)?.[1] : null;
  };
  const snapshot = async () => {
    await batchProblem(tab.id);
    const current=await chrome.tabs.get(tab.id);
    if(/\/(accounts\/login|challenge|checkpoint|i\/flow|login)(\/|$)/i.test(new URL(current.url).pathname))throw new Error('NEEDS_ATTENTION: 请先完成登录或验证，再回作者主页续采。');
    const parts=bilibili&&Boolean(CollectorBiliParts.key(current.url));
    const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id},world:youtube||parts?'MAIN':'ISOLATED',files:[huaban?'huaban-list.js':artstation?'artstation-list.js':youtube?'youtube.js':parts?'bilibili-parts.js':bilibili?'bilibili.js':instagram?'instagram-profile.js':'x-profile.js']});
    if (!result || result.error) throw new Error(result?.error || '无法读取作者主页');
    return result;
  };
  const profile = await snapshot();
  const finiteParts=profile.view==='parts';
  if(finiteParts&&Number(options.skip_posts||0)>=profile.urls.length)throw Error('选集共 '+profile.urls.length+' 集，跳过数量已超出范围');
  await beginBatch({...tab,url:profile.author_url+(instagram&&profile.view==='reels'?'/reels':'')},platform+'-author',options);
  if(finiteParts){
    taskContext.batch.limit=Math.min(taskContext.batch.limit,profile.urls.length-Number(taskContext.batch.options.skip_posts||0));
    taskContext.batch.queue_complete=true;
  }
  const group = {author_url:profile.author_url,author_name:profile.author_name,...Object.fromEntries(Object.entries(profile).filter(([k])=>k.startsWith('list_')))};
  const queue = new Set(taskContext.batch.queue);
  let idle = 0, workTab, keep = false;
  try {
    for(let round=0;round<100 && idle<5 && !batchFull();round++) {
      await controlPoint();
      const data = await snapshot();
      if(data.author_url!==profile.author_url || (instagram&&data.view!==profile.view))throw new Error('已离开原作者主页或列表，停止并保留断点。');
      const before = queue.size;
      for(const url of data.urls)if(queue.size<500)queue.add(url);
      taskContext.batch.queue=[...queue]; await saveBatch();
      idle=before===queue.size?idle+1:0;
      for(const url of queue) {
        if(batchFull())break;
        if(batchRecorded(url))continue;
        if(taskContext.batch.retryKeys&&!taskContext.batch.retryKeys.includes(url))continue;
      if(skipLeadingPost(url)){await recordPost(url,{status:'skipped',quota_exempt:true,video_count:0,url,reason:'按设置跳过列表前部作品'});continue;}
        if(typeof existingCapture==='function'){const old=await existingCapture(url);if(old){await recordPost(url,old);continue;}}
        await controlPoint();
        if(!workTab)workTab=await chrome.tabs.create({url,active:false});
        else await chrome.tabs.update(workTab.id,{url});
        let timelineRecord=null;
        if(platform==='x'){
          const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',args:[postId(url)],func:id=>globalThis.RefTrayXSession?.get(id)||null});
          const handle=new URL(profile.author_url).pathname.slice(1).toLowerCase();
          if(result?.postId===postId(url) && result.account?.toLowerCase()===handle)timelineRecord=result;
        }
        if(platform==='x' && timelineRecord?.text_only && taskContext.options.collection_mode!=='text' && !taskContext.options.video_only){
          await recordPost(url,{status:'skipped',quota_exempt:true,url,reason:'纯文字帖，已跳过，不占图片目标篇数'});continue;
        }
        let payload, issue='未识别到当前帖正文或媒体，可能未加载或不可访问';
        if(timelineRecord && !taskContext.options.include_comments && !taskContext.options.md_only){
          payload={platform:'x',canonical_url:url,page_title:timelineRecord.text?.slice(0,100)||tab.title,author_handle:timelineRecord.account,
            body_text:timelineRecord.text||'',collection_mode:taskContext.options.collection_mode||'images',
            images:timelineRecord.media.filter(m=>m.kind==='photo').map(m=>({url:m.url,alt:''})),
            _media:timelineRecord.media,has_video:timelineRecord.media.some(m=>m.kind==='video'||m.kind==='gif'),extraction_warnings:[]};
        }
        for(let attempt=0;!payload&&attempt<18;attempt++) {
          await controlledWait(1000);
          const current=await chrome.tabs.get(workTab.id);
          if(/\/(i\/flow|login|account\/access|accounts\/login|challenge|checkpoint)(\/|$)/i.test(new URL(current.url).pathname))throw new Error('NEEDS_ATTENTION: 需要登录或验证，处理后回作者主页续采。');
          if(current.status!=='complete')continue;
          if(await batchProblem(workTab.id)==='unavailable')break;
          const targetId=postId(url);
          if(!targetId || postId(current.url)!==targetId)continue;
          try {
            const candidate=await pagePayload(workTab.id,taskContext.options);
            if(postId(candidate.canonical_url)!==targetId)continue;
            if(youtube)candidate.has_video=true;
            if((instagram||bilibili&&profile.handle) && candidate.author_handle?.toLowerCase()!==profile.handle) {
              issue=candidate.author_handle?'当前帖作者与主页不一致，未保存':'未能确认当前帖作者，未保存。'+(candidate.author_diagnostic||'');
              if(candidate.author_handle)break;
              continue;
            }
            if(candidate.images?.length || candidate.has_video || candidate.body_text?.trim()) {payload=candidate;break;}
          } catch(error) {
            if(/旧版|NEEDS_ATTENTION|超时|USER_STOPPED/.test(error.message))throw error;
            issue=error.message;
          }
        }
        try {
          if(payload&&finiteParts){
            const part=profile.parts.find(p=>postId(p.url)===postId(url));
            payload.page_title='P'+String(part.page).padStart(3,'0')+' '+part.title;
          }
          await recordPost(url,payload ? await processBatchPost({...workTab,url},port,group,payload) : {status:'failed',...(finiteParts?{video_count:1}:{}),url,reason:issue});
        } catch(error) {
          if(error.message==='USER_STOPPED'||error.message.includes('NEEDS_ATTENTION')||/fetch|保存服务|超时/i.test(error.message))throw error;
          await recordPost(url,{status:'failed',...(finiteParts?{video_count:1}:{}),url,reason:error.message});
        }
        await controlledWait(Object.keys(taskContext.batch.records).length%10===0?20000:2500);
      }
      if(batchFull()||finiteParts)break;
      await reportProgress({message:videoBatch()?`扫描 ${label} 作者主页 · 视频额度 ${batchCount()}/${taskContext.batch.limit} · 已检查 ${Object.keys(taskContext.batch.records).length} 篇`:`扫描 ${label} 作者主页 · 已处理 ${Object.keys(taskContext.batch.records).length}/${taskContext.batch.limit} 篇`});
      if(bilibili&&idle>=1){
        await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
          const next=document.querySelector('.be-pager-next:not(.be-pager-disabled),.vui_pagenation--btn-side:not([disabled])[title="下一页"]');
          if(next&&next.getAttribute('aria-disabled')!=='true')next.click();else window.scrollBy(0,Math.max(400,innerHeight*.8));
        }});
      }else await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>window.scrollBy(0,Math.max(400,innerHeight*.8))});
      await controlledWait(2500);
    }
    if(!queue.size)throw new Error('未找到本人帖子。请确认已登录、主页帖子已加载；未开始保存。');
    return await finishBatch();
  } catch(error) {
    keep=error.message.includes('NEEDS_ATTENTION');
    if(keep&&workTab)await chrome.tabs.update(workTab.id,{active:true});
    throw error;
  } finally {if(workTab&&!keep)await chrome.tabs.remove(workTab.id).catch(()=>{});}
}
if(typeof module!=='undefined')module.exports={batchLimit,batchSummary};
