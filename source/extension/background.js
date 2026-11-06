const BUILD = '0.5.0';
if (typeof importScripts === 'function') importScripts('health-client.js','task-progress.js','task-store.js','capture-options.js','batch.js','task-services.js');
let healthCache,taskContext={options:{},imageQuotaUsed:0};

let videoSession;
let taskRunning = false;
let downloadSession;
let resolvedMedia=new Map();

const imagesRemaining=()=>taskContext.options.max_images>0?Math.max(0,taskContext.options.max_images-taskContext.imageQuotaUsed):Infinity;
function reserveImages(count){taskContext.imageQuotaUsed+=count;if(typeof taskContext.batch!=='undefined'&&taskContext.batch)taskContext.batch.image_used=taskContext.imageQuotaUsed;}
async function matureMedia(url){
  if(!resolvedMedia.has(url))resolvedMedia.set(url,service('/media/resolve',{url,output_format:taskContext.options.output_format==='audio'?'audio':'original',quality:taskContext.options.video_quality||'best',subtitle_language:taskContext.options.subtitle_language||'auto',captions:taskContext.options.output_format!=='audio'&&taskContext.options.subtitle_mode!=='none'}).catch(error=>{resolvedMedia.delete(url);throw error;}));
  return resolvedMedia.get(url);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let progressChain=Promise.resolve();
async function reportProgress(value) {
  const context=taskContext;
  const operation=progressChain.then(()=>persistProgress(value,context));
  progressChain=operation.catch(()=>{});
  return operation;
}
async function persistProgress(value,taskContext) {
  const old=(await chrome.storage.local.get(['liblibProgress'])).liblibProgress;
  if(old?.context?.id!==taskContext?.id)value=TaskProgress.reduce({},value,taskContext.batch);
  else value=TaskProgress.reduce(old,value,taskContext.batch);
  if(batchDownloadItem)value.current={...value.current,...batchDownloadItem};
  const detail = String(value.details || '').replace(/([?&](?:xsec_token|token|signature|auth)[^=]*=)[^\s&#]+/gi,'$1[已隐藏]');
  await chrome.storage.local.set({liblibProgress: {...value, details: detail, context:taskContext?{id:taskContext.id,url:taskContext.url,title:taskContext.title,mode:taskContext.mode}:null, build: BUILD, updatedAt: Date.now()}});
  if(taskContext?.id){
    const {collectorTaskJournal:journal={}}=await chrome.storage.local.get(['collectorTaskJournal']);
    const terminal=['completed','failed','partial','stopped','interrupted','paused'].includes(value.status);
    const completed=['completed','failed','partial'].includes(value.status);
    const previous=journal[taskContext.id]||{};
    journal[taskContext.id]={...previous,id:taskContext.id,source:taskContext.url,name:taskContext.title,mode:taskContext.mode,localOnly:true,batchId:taskContext.batch?.id,options:{...taskContext.options},completed,status:value.status||'running',updated:Date.now(),directory:value.directory||previous.directory,records:terminal?{result:{status:value.status==='completed'?'saved':value.status,url:taskContext.url,reason:detail||value.message}}:previous.records||{}};
    const resolved=[];
    if(value.status==='completed'&&!taskContext.batch){
      const key=url=>{try{const u=new URL(url);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k)||['fbclid','gclid','dclid','msclkid','igshid','mc_cid','mc_eid'].includes(k.toLowerCase()))u.searchParams.delete(k);u.searchParams.sort();return u.href;}catch(_){return url;}};
      const signature=options=>JSON.stringify(['capture_kind','collection_mode','include_images','include_comments','ocr_enabled','subtitle_mode','video_action','destination'].map(k=>options?.[k]??null));
      for(const entry of Object.values(journal))if(entry.id!==taskContext.id&&!entry.batchId&&entry.status==='failed'&&!entry.resolvedBy&&key(entry.source)===key(taskContext.url)&&signature(entry.options)===signature(taskContext.options)){entry.resolvedBy=taskContext.id;resolved.push(entry);}
    }
    const keep=Object.fromEntries(Object.entries(journal).sort((a,b)=>b[1].updated-a[1].updated).slice(0,200));
    await chrome.storage.local.set({collectorTaskJournal:keep});
    if(terminal&&!taskContext.batch&&healthCache?.capture_history){
      try{
        await TaskStore.save(journal[taskContext.id],{checkpoint:false});
        for(const entry of resolved)await TaskStore.save(entry,{checkpoint:false});
      }
      catch(error){
        const warning='后台任务记录同步失败；已保留浏览器中的记录：'+error.message;
        const current=(await chrome.storage.local.get(['liblibProgress'])).liblibProgress;
        await chrome.storage.local.set({liblibProgress:{...current,details:[current?.details,warning].filter(Boolean).join('\n')}});
      }
    }
  }

}

async function inject(tabId) {
  await chrome.scripting.executeScript({target: {tabId}, files: ["document-source.js", "pinterest-identity.js", "platforms.js", "content.js"]});
  const reply = await chrome.tabs.sendMessage(tabId, {type: 'LIBLIB_VERSION'}).catch(() => null);
  if (reply?.version !== BUILD) throw new Error('网页仍加载旧版采集脚本。请刷新作者主页后重试（仅重开扩展弹窗不够）。');
}

async function boundedRead(promise, milliseconds=25000) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('页面读取超时；已停止本次等待，保留进度')),milliseconds);})]);}
  finally {clearTimeout(timer);}
}
async function pagePayload(tabId, options = {}) {
  const current=await boundedRead(chrome.tabs.get(tabId));
  const timeout=/(^|\.)(youtube\.com|youtu\.be|x\.com|twitter\.com)$/.test(new URL(current.url).hostname)?145000:25000;
  return boundedRead(readPagePayload(tabId,options,current),timeout);
}
async function readPagePayload(tabId, options, current) {
  if(/(^|\.)artstation\.com$/.test(new URL(current.url).hostname)){
    await chrome.scripting.executeScript({target:{tabId},files:['document-source.js','artstation.js']});
    const [{result}]=await chrome.scripting.executeScript({target:{tabId},func:()=>CollectorArtstation.extract(location.href)});
    return {...result,collection_mode:options.collection_mode||'images',include_images:!options.md_only,md_only:Boolean(options.md_only),ocr_enabled:Boolean(options.ocr_enabled),comments:[],comments_requested:Boolean(options.include_comments),comments_status:'当前平台未支持评论'};
  }
  if(/(^|\.)(youtube\.com|youtu\.be)$/.test(new URL(current.url).hostname)){
    const {media}=await matureMedia(current.url),source=media[0];
    return {...source,platform:'youtube',images:[],body_text:'',has_video:true,_media:media,collection_mode:'images'};
  }
  if(/(^|\.)bilibili\.com$/.test(new URL(current.url).hostname)) {
    await setMediaQuality(tabId);
    const [{result}]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',files:['document-source.js','bilibili.js']});
    if(!result?.payload)throw new Error(result?.error||'未确认B站当前稿件');
    return {...result.payload,collection_mode:options.collection_mode||'images',include_images:options.include_images!==false,ocr_enabled:Boolean(options.ocr_enabled),images:options.collection_mode==='text'&&options.include_images===false&&!options.ocr_enabled?[]:result.payload.images,comments:[],comments_requested:Boolean(options.include_comments),comments_status:'当前平台未支持评论',_media:result.source?[{...result.source,kind:'video'}]:[]};
  }
  await inject(tabId);
  const payload = await chrome.tabs.sendMessage(tabId, {type: "LIBLIB_PAGE_PAYLOAD", options});
  let xPageData;
  if (payload?.error) {
    const isX = /(^|\.)(x\.com|twitter\.com)$/.test(new URL(current.url).hostname);
    if (isX && !options.video_only && !taskContext.options.video_only) {
      const id = new URL(current.url).pathname.match(/\/status\/(\d+)/)?.[1];
      xPageData = await loadedPageMedia(tabId, false);
      const hasRequestedMedia = xPageData.has_gif || xPageData.media?.some(item =>
        item.kind === 'photo' || item.kind === 'gif' || (item.kind === 'video' && options.include_videos));
      if (!id || xPageData.postId !== id || !hasRequestedMedia || options.md_only) throw new Error(payload.error);
      Object.assign(payload,{error:null,platform:'x',canonical_url:current.url.split('?')[0],page_title:current.title,images:[],body_text:'',has_video:Boolean(xPageData.has_gif),collection_mode:options.collection_mode || 'images'});
    } else {
      const media=await loadedMedia(tabId);
      if(!media.some(m=>m.kind==='video'||m.kind==='gif'))throw new Error(payload.error);
      Object.assign(payload,{error:null,canonical_url:current.url.split('?')[0],page_title:current.title,platform:isX?'x':'generic',images:[],body_text:'',has_video:true,_media:media});
    }
  }
  if (!payload) throw new Error('网页没有响应');
  if(payload.platform==='pinterest' && options.collection_mode!=='text' && !options.md_only &&
      !payload.images?.length && !payload.has_video){
    const original=new URL(current.url);
    if(/^(www\.)?pinterest\.com$/.test(original.hostname) && /^\/pin\/\d+\/?$/.test(original.pathname)){
      const fallback=await service('/media/resolve-post',{url:original.origin+original.pathname});
      const latest=await chrome.tabs.get(tabId);
      if(new URL(latest.url).origin!==original.origin || new URL(latest.url).pathname!==original.pathname)
        throw new Error('页面已切换，未保存其他 Pin 的图片');
      if(payload.pinterest_motion && fallback.scope!=='verified_story_images')throw new Error('此 Pin 含未确认的动态内容，未保存封面');
      payload.images=fallback.images;
      payload.extraction_warnings=[...(payload.extraction_warnings||[]),fallback.warning];
    }
  }
  if (payload.platform === 'x' && options.collection_mode === 'text' && options.include_comments) {
    payload.extraction_warnings=(payload.extraction_warnings||[]).filter(w=>!w.includes('尚未适配评论'));
    try {
      const id=new URL(payload.canonical_url).pathname.match(/\/status\/(\d+)/)?.[1];
      const limit=Math.max(1,Math.min(100,Number(options.comment_limit)||10));
      const result=await readXReplies(tabId,id,limit);
      payload.comments=result.comments;
      payload.comments_status=`目标 ${limit} 条，实际读取 ${payload.comments.length} 条直接回复。${result.reason}`;
    } catch(error) {
      if(error.message==='USER_STOPPED')throw error;
      payload.comments=[];payload.comments_status='评论读取失败：'+error.message;
    }
    payload.extraction_warnings.push(payload.comments_status);
  }
  const pageData = payload.platform === 'instagram' ? await loadedPageMedia(tabId) : null;
  if(pageData?.postId && pageData.postId!==new URL(payload.canonical_url).pathname.match(/^\/(?:[\w.]+\/)?(?:p|reels?)\/([\w-]+)/)?.[1])throw new Error('帖子在读取过程中发生变化，未保存错帖');
  if(pageData?.author_handle)payload.author_handle=pageData.author_handle;
  if(pageData?.media?.some(item=>item.kind==='video'||item.kind==='gif'))payload.has_video=true;
  if (!options.md_only) {
    const mediaPage = xPageData || pageData || await loadedPageMedia(tabId,false);
    if(payload.platform==='x' && mediaPage.postId && mediaPage.postId!==new URL(payload.canonical_url).pathname.match(/\/status\/(\d+)/)?.[1]) throw new Error('页面已切换，请回到目标帖子后重试');
    const found = mediaPage.media || [];
    const media = options.skip_gifs?found.filter(m=>m.kind!=='gif'&&m.extension!=='gif'&&!m.live_missing):found;
    if(found.length)payload.images=[];
    payload._skippedMotion=found.length>media.length||Boolean(mediaPage.has_gif&&options.skip_gifs);
    if(options.skip_gifs)payload.has_live_photo=false;
    payload._media=media;
    if(media.some(m=>m.kind==='video'||m.kind==='gif'))payload.has_video=true;
    if(payload.platform==='xhs'&&!options.skip_gifs)payload.has_live_photo=media.some(m=>m.live_missing)||Boolean(payload.has_live_photo&&!media.some(m=>m.live_photo));
    const photos = media.filter(item => item.kind === 'photo').map(item => ({url: item.url, alt: ''}));
    if (photos.length) {
      payload.images = photos;
      payload.extraction_warnings = (payload.extraction_warnings || []).filter(w => !w.startsWith('仅采集已加载') && !w.startsWith('仅取得帖子分享图'));
      payload.extraction_warnings.push('图片来自与当前帖子编号匹配的已加载页面数据，跨站兼容性仍待实测。');
    }
  }
  if(payload.platform==='x'&&options.collection_mode==='text'&&options.include_comments&&options.include_images!==false&&!options.md_only){
    payload.images ||= [];
    for(const comment of payload.comments||[]){
      const gifs=new Set(options.skip_gifs===false ? comment.gifs : []);
      comment.images=[...new Set([...(comment.images||[]),...gifs])];
      for(const url of comment.images){
        if(!payload.images.some(item=>item.url===url)){
          payload.images.push({url,alt:'评论 '+comment.id,role:'comment',comment_id:comment.id,source_kind:gifs.has(url)?'comment_gif':'image'});
        }
      }
    }
  }
  return payload;
}

async function readXReplies(tabId, id, limit) {
  if(!id)throw new Error('缺少主帖编号');
  const comments=new Map();
  let previousY=null, initialY=null, stagnant=0, reason='已达到本次加载上限。';
  try {
    for(let step=0;step<=12;step++){
      await controlPoint();
      const [{result}]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',files:['cat-media.js','x-comments.js']});
      if(result?.postId!==id || !Array.isArray(result.comments))throw new Error('评论与当前帖子不匹配');
      const before=comments.size;
      for(const reply of result.comments){
        comments.set(reply.id,reply);
        if(comments.size>=limit)return {comments:[...comments.values()],reason:''};
      }
      stagnant=step && comments.size===before ? stagnant+1 : 0;
      if(stagnant>=3){reason='继续加载后没有出现更多可确认的直接回复。';break;}
      if(step===12)break;
      const [{result:position}]=await chrome.scripting.executeScript({target:{tabId},args:[id,previousY],func:(id,previousY)=>{
        if(location.pathname.match(/\/status\/(\d+)/)?.[1]!==id)return null;
        if(previousY!==null && Math.abs(scrollY-previousY)>4)return null;
        const before=scrollY;
        window.scrollBy({top:Math.max(300,innerHeight*.8),behavior:'instant'});
        return {before,after:scrollY};
      }});
      if(!position){reason='页面或滚动位置已改变，已停止加载。';break;}
      initialY??=position.before;
      previousY=position.after;
      await controlledWait(1000);
    }
    return {comments:[...comments.values()],reason};
  } finally {
    if(initialY!==null)await chrome.scripting.executeScript({target:{tabId},args:[id,previousY,initialY],func:(id,last,initial)=>{
      if(location.pathname.match(/\/status\/(\d+)/)?.[1]===id && Math.abs(scrollY-last)<=4)
        window.scrollTo({top:initial,behavior:'instant'});
    }}).catch(()=>{});
  }
}

async function loadedMedia(tabId) {
  return (await loadedPageMedia(tabId)).media || [];
}
async function setMediaQuality(tabId){
  await chrome.scripting.executeScript({target:{tabId},world:'MAIN',args:[taskContext.options.video_quality||'best',taskContext.options.output_format||'original'],func:(value,format)=>{globalThis.__collectorVideoQuality=['best','1080','720','480'].includes(value)?value:'best';globalThis.__collectorOutputFormat=format==='audio'?'audio':'original';}});
}
async function loadedPageMedia(tabId, resolveVideo=true) {
  let resolvingGif=false;
  await setMediaQuality(tabId);
  const tab=await chrome.tabs.get(tabId);
  if(/(^|\.)bilibili\.com$/.test(new URL(tab.url).hostname)) {
    await setMediaQuality(tabId);
    const [{result}]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',files:['document-source.js','bilibili.js']});
    if(!result?.payload)throw new Error(result?.error||'无法确认B站稿件');
    return {media:result.source?[{...result.source,kind:'video'}]:[]};
  }
  try {
    await chrome.scripting.executeScript({target: {tabId}, world: 'MAIN', files: ['cat-instagram.js', 'cat-xhs.js', 'cat-media.js']});
    const [{result}] = await chrome.scripting.executeScript({target: {tabId}, world: 'MAIN', files: ['page-media.js']});
    if(result?.has_gif&&!taskContext.options.skip_gifs&&!result.media?.some(m=>m.kind==='gif')){
      resolvingGif=true;
      const resolved=await matureMedia(tab.url),media=(resolved.media||[]).filter(m=>m.kind==='gif');
      if(!media.length)throw new Error('页面标记为 GIF，但尚未解析到属于当前帖子的动图源；未保存封面');
      return {...result,media:[...(result.media||[]).filter(m=>m.kind==='photo'),...media]};
    }
    if(resolveVideo&&!result?.media?.length&&healthCache&&/(^|\.)(x\.com|twitter\.com)$/.test(new URL(tab.url).hostname)&&/\/status\/\d+/.test(new URL(tab.url).pathname))return await matureMedia(tab.url);
    return result || {media:[]};
  } catch(error){if(resolvingGif||resolveVideo&&/(^|\.)(x\.com|twitter\.com)$/.test(new URL(tab.url).hostname))throw error;return {media:[]};} // DOM extraction remains available if page state is absent.
}

async function includeProtectedImages(payload, pageUrl) {
  // Eligibility is chosen by submit; do not silently disable generic/Bilibili prefetch here.
  let cursor=0,totalBytes=0;
  const output=new Array(payload.images.length);
  async function worker(){while(cursor<payload.images.length){
    const index=cursor++,item=payload.images[index];
    output[index]=item;
    if (item.data_base64||totalBytes>=64*1048576) continue;
    try {
      const response = await fetch(item.url, {credentials: payload.platform==="x"?"omit":"include", redirect: payload.platform==="x"?"error":"follow", referrer: pageUrl, signal:AbortSignal.timeout(20000)});
      if (!response.ok || (payload.platform==='x' && !response.headers.get('Content-Type')?.startsWith('image/'))) continue;
      const chunks=[];let received=0;
      const reader=response.body.getReader();
      try{while(true){const {done,value}=await reader.read();if(done)break;
        received+=value.byteLength;totalBytes+=value.byteLength;
        if(totalBytes>64*1048576)throw new Error('浏览器预取预算已满，交由保存服务继续下载');
        if(received>30*1048576){const error=new Error('本次图片过大，请减少图片数量后重试（单张30MB、单次64MB）。');error.imageLimit=true;throw error;}
        chunks.push(value);
      }}finally{await reader.cancel();reader.releaseLock();}
      const blob = new Blob(chunks,{type:response.headers.get('Content-Type')||''});
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      output[index]={...item, data_base64: btoa(binary), content_type: blob.type};
    } catch (_error) {
      if(_error.imageLimit && payload.platform!=='x')throw _error;
    }
  }}
  await Promise.all([worker(),worker()]);
  payload.images=output;
  return payload;
}

async function submit(payload, pageUrl, port) {
  payload.md_only ??= Boolean(taskContext.options.md_only);
  if(taskContext.options.skip_gifs)payload.images=(payload.images||[]).filter(i=>! /\.gif(?:[?#]|$)/i.test(i.url));
  if(payload.md_only){payload.images=[];payload.media_files=[];payload.ocr_enabled=false;}
  const allowed=Math.min(payload.images?.length||0,imagesRemaining());
  payload.omitted_images=(payload.images?.length||0)-allowed;
  payload.images=(payload.images||[]).slice(0,allowed);
  payload.max_images=Number.isFinite(imagesRemaining())?imagesRemaining():0;
  if(payload.omitted_images&&!allowed&&!(payload.collection_mode==='text'&&payload.body_text?.trim()))return {new_images:0,partial:true,omitted_images:payload.omitted_images,warnings:['达到本次图片上限，剩余图片未处理'],message:'达到本次图片上限，剩余图片未处理'};
  reserveImages(allowed);
  payload.directory_schema ??= taskContext.options.directory_schema || 'four-categories-v1';
  payload.capture_scope ??= taskContext.options.capture_scope;
  payload.capture_kind ??= taskContext.options.capture_kind;
  payload.layout ??= taskContext.options.layout || 'organized';
  payload.ocr_enabled ??= taskContext.options.ocr_enabled !== false;
  payload.include_images ??= taskContext.options.include_images !== false;
  payload.destination ??= taskContext.options.destination || null;
  payload.duplicate_policy ??= taskContext.options.duplicate_policy || 'fill';
  payload.min_free_mb ??= taskContext.options.min_free_mb ?? 256;
  if (taskContext.directory) payload.save_directory = taskContext.directory;
  if (!payload?.images?.length && !(payload?.collection_mode === 'text' && payload.body_text?.trim())){
    const details=(payload?.extraction_warnings||[]).filter(Boolean).join(' ');
    throw new Error(details || '页面没有找到可保存正文或图片');
  }
  if(pageUrl.includes('xiaohongshu.com')){
    const known=payload.duplicate_policy==='refresh'?[]:(await service('/assets/known',{urls:payload.images.map(i=>i.url).slice(0,100)})).known;
    const missing={...payload,images:payload.images.filter(i=>!known.includes(i.url))};
    await includeProtectedImages(missing,pageUrl);
    const enriched=new Map(missing.images.map(i=>[i.url,i]));payload.images=payload.images.map(i=>enriched.get(i.url)||i);
  }
  else if(['generic','bilibili','instagram','artstation','pinterest','x'].includes(payload.platform)){
    const page=new URL(pageUrl);
    const browserImages={...payload,images:payload.images.filter(item=>{
      try{const u=new URL(item.url);if(payload.platform==='x')return u.origin==='https://pbs.twimg.com' && u.pathname.startsWith('/media/');return u.protocol==='https:'&&(u.origin===page.origin||payload.platform==='pinterest'&&/(^|\.)pinimg\.com$/.test(u.hostname)||payload.platform==='artstation'&&/(^|\.)artstation\.com$/.test(u.hostname)||payload.platform==='bilibili'&&/(^|\.)hdslb\.com$/.test(u.hostname)||payload.platform==='instagram'&&/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname));}catch(_){return false;}
    })};
    await includeProtectedImages(browserImages,pageUrl);
    const enriched=new Map(browserImages.images.map(item=>[item.url,item]));
    payload.images=payload.images.map(item=>enriched.get(item.url)||item);
  }
  await controlPoint();
  payload.task_id=taskContext.id;payload.idempotency_key=crypto.randomUUID();
  const response = await fetch(`http://127.0.0.1:${port}/collect/start`, {method: "POST", headers: {"Content-Type": "application/json", ...(healthCache ? {'X-Collector-Token':healthCache.settings_token} : {})}, body: JSON.stringify(payload), signal:AbortSignal.timeout(15000)});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "采集提交失败");
  const deadline = Date.now() + (payload.collection_mode==='text' && payload.ocr_enabled ? 1800000 : 180000);
  taskContext.backendJobId=body.job_id;await chrome.storage.local.set({collectorBackendPending:{jobId:body.job_id,taskId:taskContext.id,kind:'collect'}});
  let stopping=false;
  while (Date.now() < deadline) {
    const state=await chrome.storage.local.get(['liblibControl']);
    if(state.liblibControl==='stopped'&&!stopping){
      stopping=true;await service('/collect/control/'+body.job_id,{action:'stopped'});
      await reportProgress({status:'stopping',message:'本篇结束后停止，正在确认已保存内容'});
    }
    await wait(1000);
    const statusResponse = await fetch(`http://127.0.0.1:${port}/collect/status/${body.job_id}`, {headers: {'X-Collector-Token':healthCache?.settings_token || ''},signal:AbortSignal.timeout(15000)});
    const job = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) throw new Error(job.detail || '无法读取任务状态，请重新打开扩展');
    if(job.status==='stopped'){await chrome.storage.local.remove('collectorBackendPending');taskContext.stopResult=job.result;throw new Error('USER_STOPPED');}
    if (job.status === 'completed') {await chrome.storage.local.remove('collectorBackendPending');if(stopping){taskContext.stopResult=job.result;throw new Error('USER_STOPPED');}return job.result;}
    if(job.status==='failed'){await chrome.storage.local.remove('collectorBackendPending');throw new Error(job.message||'采集失败');}
    if(job.message)await reportProgress({percent:job.percent,message:job.message});
  }
  throw new Error("单篇采集超时");
}

async function waitForTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") return;
  await new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => finish(new Error("页面加载超时")), 45000);
    const listener = (changedId, info) => {
      if (changedId === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function pageProblem(tabId) {
  const [{result}] = await boundedRead(chrome.scripting.executeScript({target: {tabId}, func: () => {
    const sample = `${document.title}\n${document.body?.innerText || ""}`.slice(0, 5000);
    if (/^(www\.)?huaban\.com$/.test(location.hostname) && /405\s*[：:]\s*异常访问/.test(sample))return "verification";
    if (/验证码|安全验证|访问异常|操作频繁|verify|captcha|security check|登录后继续|log in to continue|login required/i.test(sample)) return "verification";
    if (/你访问的页面不见了|当前笔记暂时无法浏览|笔记已失效/i.test(sample)) return "unavailable";
    return null;
  }}));
  return result;
}

async function controlPoint() {
  while (true) {
    const {liblibControl} = await chrome.storage.local.get(["liblibControl"]);
    if (liblibControl === "stopped") throw new Error("USER_STOPPED");
    if (liblibControl !== "paused") return;
    await wait(1000);
  }
}

async function controlledWait(milliseconds) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 1000) {
    await controlPoint();
    await wait(Math.min(1000, milliseconds - elapsed));
  }
}

async function collectCurrent(tab, port, options = {}) {
  if(typeof existingCapture==='function'){
    const old=await existingCapture(tab.url);if(old)return {...old,message:old.reason,new_images:0};
  }
  const problem = await pageProblem(tab.id);
  if (problem) throw new Error('页面正在验证或无法访问，已停止保存。');
  const payload = await pagePayload(tab.id, options);
  if(options.include_videos||!options.md_only&&!options.skip_gifs&&payload._media?.some(m=>m.kind==='gif')){
    // Save body/images before resolving optional video attachments.
    const result=await processBatchPost(tab,port,{},payload);
    if(result.status==='failed')throw new Error(result.reason||'未保存任何文件');
    return {...result,partial:result.status==='partial',message:`图文 ${result.documents} 篇 · 新增图片 ${result.images} 张 · 视频 ${result.videos} 个\n保存位置：${result.directory || '未保存'}${result.status==='partial'?'\n部分附件未完成，请查看诊断详情。':''}`,details:result.reason};
  }
  if(options.skip_gifs&&payload._skippedMotion&&!payload.images?.length&&!payload.body_text?.trim())return {status:'skipped',message:'已按设置跳过动图，没有其他可保存内容',new_images:0};
  const saved=await submit(payload, tab.url, port);
  if(payload.has_live_photo)return {...saved,status:'partial',message:'静态图片已保存，但实况动图尚未保存完整。',details:'检测到 LIVE 动图；当前未确认其动态视频源，不能把静态封面当作完整动图。'};
  return saved;
}

async function downloadApi(port, token, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {method: body === undefined ? 'GET' : 'POST',
    headers: {'Content-Type': 'application/json', 'X-Collector-Token': token},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(path==='/media/resolve'?135000:15000)});
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.detail === 'string' ? value.detail : '保存服务请求失败');
  return value;
}

async function videoSource(tab,options) {
  let resolverWarning='';
  if(!options.source?.resolver_id&&options.source?.kind!=='gif'&&/(^|\.)(x\.com|twitter\.com)$/.test(new URL(tab.url).hostname)){
    try{
      const {media}=await matureMedia(tab.url);
      if(!options.source?.url&&media.length===1)return media[0];
      const identity=url=>url?.match(/\/(?:ext_tw_video|amplify_video)\/(\d+)\//)?.[1];
      const matched=media.find(m=>identity(m.url)&&identity(m.url)===identity(options.source?.url));
      if(matched)return matched;
    }catch(error){resolverWarning=String(error.message||'媒体解析失败').slice(0,500);}
  }
  if(options.source?.url)return {...options.source,resolver_warning:resolverWarning};
  if(/(^|\.)(youtube\.com|youtu\.be)$/.test(new URL(tab.url).hostname)){
    await reportProgress({message:'正在解析当前YouTube视频…'});
    const result=await matureMedia(tab.url);return result.media[0];
  }
  if(/(^|\.)(x\.com|twitter\.com|xiaohongshu\.com)$/.test(new URL(tab.url).hostname)){
    const motion=(await loadedMedia(tab.id)).filter(m=>m.kind==='gif'||m.kind==='video');
    if(motion.length===1)return {...motion[0],canonical_url:tab.url.split('?')[0],page_title:tab.title,resolver_warning:resolverWarning};
  }
  if(/(^|\.)bilibili\.com$/.test(new URL(tab.url).hostname)) {
    await setMediaQuality(tab.id);
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['document-source.js','bilibili.js']});
    if(!result?.source){
      if(/\[(BILI_ID_UNBOUND|BILI_PLAY_MISSING|BILI_TRACK_FILTER|BILI_FORMAT_UNSUPPORTED|BILI_FILE_UNSUPPORTED)\]/.test(result?.error||'')){
        const resolved=await matureMedia(tab.url);
        if(resolved.media?.length!==1)throw new Error('B站解析未返回唯一当前稿件，不下载整个合集');
        return {...resolved.media[0],resolver_warning:result.error};
      }
      throw new Error(result?.error||'请播放B站当前视频后重试');
    }
    if(new URL(result.source.canonical_url).pathname!==new URL(tab.url).pathname)throw new Error('稿件已切换，未保存错视频');
    return result.source;
  }
  if (await pageProblem(tab.id)) throw new Error('页面正在验证或无法访问，未开始下载。');
  const [{result: source}] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: () => {
    let root=document;
    if(/(^|\.)(x\.com|twitter\.com)$/.test(location.hostname)){
      const id=location.pathname.match(/\/status\/(\d+)/)?.[1];
      root=[...document.querySelectorAll('article[data-testid="tweet"]')].find(a=>a.querySelector('a[href*="/status/"] time')?.closest('a')?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1]===id);
      if(!root)return {error:'尚未识别URL对应的X主帖，未扫描回复或推荐视频'};
    }
    const videos = [...root.querySelectorAll('video')].filter(video => {
      if(root!==document && (video.closest('article')!==root || video.closest('[data-testid="quoteTweet"]')))return false;
      const rect = video.getBoundingClientRect();
      return rect.width > 100 && rect.height > 100 && rect.bottom > 0 && rect.top < innerHeight && getComputedStyle(video).visibility !== 'hidden';
    });
    if (videos.length !== 1) return {error: videos.length ? '页面有多个视频，请单独打开要下载的笔记。' : '没有找到当前视频，请先打开视频笔记并播放一次。'};
    const video = videos[0];
    if (video.mediaKeys) return {error: '该视频使用受保护的播放机制，不能下载。'};
    const candidates = [video.currentSrc, video.src, ...[...video.querySelectorAll('source')].map(item => item.src),
      root.querySelector('meta[property="og:video:secure_url"]')?.content,
      root.querySelector('meta[property="og:video:url"]')?.content,
      root.querySelector('meta[property="og:video"]')?.content];
    const url = candidates.find(value => /^https?:\/\//i.test(value || '') && !/\.(m3u8|mpd)(?:[?#]|$)/i.test(value));
    if (!url) return {error: '网页只提供 blob 或分段播放地址，没有普通视频文件地址。本版不能下载这类视频；不会把封面或播放列表当成视频保存。'};
    return {url, canonical_url: location.href.split('#')[0], page_title: document.querySelector('h1')?.textContent || document.title};
  }});
  if (source?.error && !source.error.includes('受保护')) {
    const candidates = (await loadedMedia(tab.id)).filter(item => item.kind === 'video' || item.kind === 'gif');
    if (candidates.length === 1) Object.assign(source, candidates[0], {error: null, canonical_url: tab.url.split('#')[0], page_title: tab.title});
  }
  if (options.source && !source?.error?.includes('受保护')) Object.assign(source, options.source, {error:null});
  if(source?.error&&!source.error.includes('受保护')&&/(^|\.)(x\.com|twitter\.com)$/.test(new URL(tab.url).hostname)){
    const resolved=await matureMedia(tab.url);
    if(resolved.media.length!==1)throw new Error('当前主帖包含多个视频，请用图片/图文模式取消「跳过视频」保存全部');
    return resolved.media[0];
  }
  if (source?.error) throw new Error(source.error);
  if (!source?.url) throw new Error('无法读取视频地址');
  return {...source,resolver_warning:resolverWarning};
}
async function browserYouTubeCaptions(tab,canonical){
  if(!/(^|\.)youtube\.com$/.test(new URL(canonical).hostname))return null;
  const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['youtube-captions.js']});
  const u=new URL(canonical),id=u.searchParams.get('v')||u.pathname.match(/^\/shorts\/([\w-]{11})/)?.[1];
  return result?.videoId===id?result:null;
}
async function downloadVideo(tab, port, options, health, extractAfter) {
  if (!health.video_download) throw new Error('保存服务未加载视频下载功能，请重启保存服务。');
  await reportProgress({stage:'resolving',percent:null,message:'正在解析当前作品的视频…'});
  const source=await videoSource(tab,options);
  if(taskContext.batch && (taskContext.options.min_duration||taskContext.options.max_duration)){
    if(!Number.isFinite(Number(source.duration))||Number(source.duration)<=0){
      const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},args:[source.canonical_url],func:canonical=>{
        if(new URL(canonical).pathname!==location.pathname)return null;
        const videos=[...document.querySelectorAll('video')];
        return videos.length===1&&Number.isFinite(videos[0].duration)?videos[0].duration:null;
      }});source.duration=result;
    }
    const rejection=durationRejection(source);if(rejection)return {skipped:true,new_images:0,new_videos:0,message:rejection};
  }
  if(source.kind==='gif'){
    if(imagesRemaining()<1)return {new_images:0,partial:true,message:'达到本次图片上限，剩余 GIF 未处理'};
    reserveImages(1);
  }
  source.subtitle_mode=source.kind==='gif'||options.output_format==='audio'?'none':options.subtitle_mode||taskContext.options.subtitle_mode||'with_video';
  source.trim_start=options.trim_start||0;source.trim_end=options.trim_end||0;
  if(source.subtitle_mode!=='none'&&/(^|\.)youtube\.com$/.test(new URL(source.canonical_url).hostname)){
    let captions=source._browserCaptions;
    if(!captions)try{captions=await browserYouTubeCaptions(tab,source.canonical_url);}catch(_){}
    if(captions?.cues?.length&&(!source.subtitle_cues?.length||!captions.automatic&&/自动/.test(source.subtitle_source||''))){source.subtitle_cues=captions.cues;source.subtitle_source=captions.source;source.subtitle_warning='';}
    else if(!source.subtitle_cues?.length&&captions?.warning)source.subtitle_warning=captions.warning;
  }
  if(source.subtitle_mode!=='none'&&!/(^|\.)youtube\.com$/.test(new URL(source.canonical_url).hostname)){
    try{
    const [{result:cues}]=await chrome.scripting.executeScript({target:{tabId:tab.id},args:[source.canonical_url],func:canonical=>{
      if(new URL(canonical).pathname!==location.pathname)return [];
      if(/(^|\.)youtube\.com$/.test(location.hostname)&&new URL(canonical).searchParams.get('v')!==new URL(location.href).searchParams.get('v'))return [];
      const videos=[...document.querySelectorAll('video')];if(videos.length!==1)return [];
      const track=[...videos[0].textTracks].find(track=>['subtitles','captions'].includes(track.kind)&&track.cues?.length);
      return track?[...track.cues].slice(0,100000).map(cue=>({start:cue.startTime,end:cue.endTime,text:cue.text})):[];
    }});
    if(!source.subtitle_cues?.length)source.subtitle_cues=cues||[];
    }catch(_){source.subtitle_cues ||= [];}
  }
  if(health.space_preflight&&!approvedSizes.has(source.url)){
    await reportProgress({stage:'checking',percent:null,message:'正在确认视频大小和保存条件…'});
    const estimate=await probeSource(source);
    await approveDownloads([{estimates:[{source,...estimate}]}]);
  }
  await controlPoint();
  const started = await downloadApi(port, health.settings_token, '/video/start', {...source, ...options.group, output_format:options.output_format==='audio'?'audio':source.kind==='gif'?'gif':'original',directory_schema:taskContext.options.directory_schema||'four-categories-v1',capture_scope:taskContext.options.capture_scope,capture_kind:source.kind==='gif'?'images':taskContext.options.capture_kind, duplicate_policy:taskContext.options.duplicate_policy||'fill',max_video_mb:taskContext.options.max_video_mb||512,min_free_mb:taskContext.options.min_free_mb??256,approved_bytes:typeof approvedSizes!=='undefined'?approvedSizes.get(source.url):null, ocr_enabled:taskContext.options.ocr_enabled !== false, collection_mode:taskContext.options.collection_mode || 'images', layout:taskContext.options.layout || 'organized', destination:taskContext.options.destination || null, save_directory: taskContext.directory});
  taskContext.backendJobId=started.job_id;downloadSession = {jobId:started.job_id,port,token:health.settings_token};
  await chrome.storage.local.set({collectorBackendPending:{jobId:started.job_id,taskId:taskContext.id,kind:'video'}});
  let result, completed = false;
  try {
    while (true) {
      const {liblibControl} = await chrome.storage.local.get(['liblibControl']);
      const action = liblibControl || 'stopped';
      await downloadApi(port, health.settings_token, `/video/control/${started.job_id}`, {action});
      const state = await downloadApi(port, health.settings_token, `/video/status/${started.job_id}`);
      await reportProgress({stage:state.stage||null,percent:state.percent??null,bytes:state.bytes,total:state.total,message:state.message});
      if(state.status==='completed'){await chrome.storage.local.remove('collectorBackendPending');result=state.result;completed=true;break;}
      if(['failed','stopped'].includes(state.status)){await chrome.storage.local.remove('collectorBackendPending');throw new Error(state.status==='stopped'?'USER_STOPPED':state.message);}
      await wait(800);
    }
  } finally {
    if (!completed) await downloadApi(port, health.settings_token, `/video/control/${started.job_id}`, {action: 'stopped'}).catch(() => {});
    downloadSession = undefined;
  }
  if(['application/x-subrip','text/markdown'].includes(result.mime))return {new_images:0,new_videos:0,documents:1,directory:result.directory,message:`文字稿已保存（${result.subtitle_source}）\n${result.path}`};
  if(result.mime?.startsWith('audio/'))return {new_images:0,new_videos:result.duplicate?0:1,duplicate_videos:result.duplicate?1:0,directory:result.directory,message:`音频已保存\n${result.path}`};
  await chrome.storage.local.set({inspirationLastVideo: {assetId: result.asset_id, path: result.path}});
  const savedVideo = {new_images:0, total_images:0, new_videos:result.duplicate ? 0 : 1, duplicate_videos:result.duplicate ? 1 : 0, directory:result.path.replace(/[\\/][^\\/]+$/, '')};
  savedVideo.video_file = result.relative_file || result.path.split(/[\\/]/).pop();
  savedVideo.directory = result.directory || savedVideo.directory;
  if(result.partial)return {...savedVideo,partial:true,message:result.warning,details:result.warning};
  if(result.mime==='image/gif')return {...savedVideo,new_images:result.duplicate?0:1,duplicate_images:result.duplicate?1:0,total_images:1,new_videos:0,duplicate_videos:0,message:`GIF 动图已保存\n${result.path}`};
  if (!extractAfter) return {...savedVideo, message: `${result.subtitle_file?'视频、字幕和MD已保存（'+result.subtitle_source+'）':'视频已保存'}\n${result.path}`};
  await controlPoint();
  await reportProgress({message: `视频已保存，正在打开抽帧页…\n${result.path}`});
  const localTab = await chrome.tabs.create({url: chrome.runtime.getURL('video.html')});
  await waitForTab(localTab.id);
  let prepared;
  for (let attempt = 0; attempt < 10; attempt++) {
    await controlPoint();
    prepared = await chrome.runtime.sendMessage({type: 'PREPARE_SAVED_VIDEO', tabId: localTab.id, asset: result,
      mediaUrl: `http://127.0.0.1:${port}/video/media/${result.asset_id}`, options}).catch(() => null);
    if (prepared) break;
    await wait(300);
  }
  if (!prepared?.ok) {
    if(options.group)await chrome.tabs.remove(localTab.id).catch(()=>{});
    return {...savedVideo,partial:true,message:`视频已保存：${result.path}\n抽帧未完成：${prepared?.error || '抽帧页面未响应'}。可选择该本地视频重新抽帧。`};
  }
  await controlPoint();
  try {
    const extracted = await collectVideo({...localTab, url: chrome.runtime.getURL('video.html')}, port, options, result.page);
    return {...savedVideo,...extracted, message: `${extracted.message}\n原视频：${result.path}`};
  } catch(error) {
    if(error.message==='USER_STOPPED')throw error;
    return {...savedVideo,partial:true,message:`视频已保存：${result.path}\n抽帧未完成：${error.message}`};
  } finally { if(options.group) await chrome.tabs.remove(localTab.id).catch(()=>{}); }
}

async function collectVideo(tab, port, options, sourcePage) {
  const local = tab.url === chrome.runtime.getURL('video.html');
  if(!local&&/(^|\.)bilibili\.com$/.test(new URL(tab.url).hostname))throw new Error('B站请使用「保存并抽帧」，先核对稿件并合并音视频；不从页面广告播放器直接抽帧');
  if (!local) {
    if (await pageProblem(tab.id)) throw new Error('页面正在验证或无法访问，已停止。');
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['frame-engine.js', 'video-content.js']});
  }
  videoSession = {id: crypto.randomUUID(), tabId: tab.id, pageUrl: tab.url, local, sourcePage, port, newImages: 0, total: 0};
  try {
    const message = {type: 'EXTRACT_VIDEO', tabId: tab.id, session: videoSession.id, options};
    const result = await (local ? chrome.runtime.sendMessage(message) : chrome.tabs.sendMessage(tab.id, message));
    if (!result?.ok) throw new Error(result?.error || '抽帧连接中断，已保存图片保留。');
    return {directory:videoSession.directory,new_images:videoSession.newImages,total_images:videoSession.total,partial:Boolean(result.result.partial),omitted_images:result.result.omitted||0,
      message:result.result.partial?`抽帧部分完成，新增 ${videoSession.newImages} 张，剩余 ${result.result.omitted} 个采样点未保存。`: `抽帧完成，新增 ${videoSession.newImages} 张；合并相近画面 ${result.result.skipped} 张。图片为视频帧，不是原图。`};
  } finally { videoSession = undefined; }
}

async function videoMessage(message, sender) {
  const session = videoSession;
  const senderTab = sender?.tab?.id;
  const localSender = session?.local && sender?.url === chrome.runtime.getURL('video.html') && message.tabId === session.tabId;
  if (!session || (senderTab !== session.tabId && !localSender) || message.session !== session.id) throw new Error('视频采集已结束或后台已重启');
  const state = await chrome.storage.local.get(['liblibControl']);
  if (message.type === 'VIDEO_CONTROL') return {ok: true, control: state.liblibControl || 'stopped'};
  await controlPoint();
  if (message.type === 'VIDEO_PROGRESS') {
    await reportProgress(message.progress);
    return {ok: true};
  }
  const page = message.page;
  if (!page || (session.sourcePage ? page.canonical_url !== session.sourcePage.canonical_url : session.local ? !/^local-video:\/\/[a-f0-9]{64}$/.test(page.canonical_url) : page.canonical_url !== session.pageUrl.split('#')[0])) throw new Error('视频来源已改变');
  const frame = message.frame;
  if (!frame || !Number.isFinite(frame.frame_time) || frame.frame_time < 0 || frame.content_type !== 'image/jpeg' || typeof frame.data_base64 !== 'string' || frame.data_base64.length > 20000000) throw new Error('视频帧数据无效');
  const result = await submit({...page, ...session.sourcePage, images: [{...frame, source_kind: 'video_frame', url: `${page.canonical_url}#t=${frame.frame_time}`, alt: `视频抽帧 ${frame.frame_time} 秒`}]}, page.canonical_url, session.port);
  session.directory=result.directory||session.directory;
  session.newImages += result.new_images;
  session.total = result.total_images;
  if (result.failed_images) throw new Error(result.warnings.join('\n'));
  return {ok:true,new_images:result.new_images,duplicate_images:result.duplicate_images||0,partial:Boolean(result.partial),omitted_images:result.omitted_images||0};
}

async function authorContext(tab, port) {
  const response = await reftrayHealth(`http://127.0.0.1:${port}/health`).catch(() => null);
  if (!response?.ok) throw new Error('本地保存服务未连接，尚未开始浏览作品。');
  const health = await response.json();
  if (!health.author_flat_images) throw new Error('本地保存服务尚未更新为作者图片平铺模式，请重启采集服务。尚未开始浏览作品。');
  const profile = new URL(tab.url);
  profile.search = ''; profile.hash = '';
  return {author_url: profile.href, author_name: (tab.title || '').replace(/\s*[-–|]\s*小红书.*$/, '').trim() || '未命名作者'};
}

async function collectXhsAuthor(tab, port) {
  if (!/^https:\/\/www\.xiaohongshu\.com\/user\/profile\/[a-f0-9]{24}\/?(?:\?|$)/i.test(tab.url)) {
    throw new Error('请先关闭笔记详情，回到作者主页再开始。');
  }
  const author = await authorContext(tab, port);
  await inject(tab.id);
  const seen = new Set();
  let newImages = 0, totalImages = 0, idle = 0;
  for (let round = 0; round < 500 && seen.size < 500;) {
    await controlPoint();
    const problem = await pageProblem(tab.id);
    if (problem) throw new Error(`作者页面出现${problem === 'verification' ? '安全验证' : '无法访问提示'}，任务已停止；已保存 ${seen.size} 篇。`);
    const response = await chrome.tabs.sendMessage(tab.id, {type: 'LIBLIB_CARDS'});
    if (!Array.isArray(response?.cards)) throw new Error('无法读取作者页卡片，请刷新页面后重试。');
    const card = response.cards.find((item) => !seen.has(item.id));
    if (!card) {
      if (++idle >= 4) {
        if (!seen.size) throw new Error('作者主页没有识别到可点击的作品卡片，未采集任何图片。');
        return {new_images: newImages, total_images: totalImages, works: seen.size, failed: 0, message: `已保存 ${seen.size} 篇，新增 ${newImages} 张。滚动后未再发现新作品；不代表作者全部作品均可访问。`};
      }
      await reportProgress({message: `查找下一屏作品 · 已保存 ${seen.size} 篇`});
      await controlPoint();
      await chrome.tabs.sendMessage(tab.id, {type: 'LIBLIB_SCROLL'});
      await controlledWait(3000);
      round++;
      continue;
    }
    idle = 0;
    await reportProgress({message: `正在打开第 ${seen.size + 1} 篇 · 已新增 ${newImages} 张`});
    await controlPoint();
    const opened = await chrome.tabs.sendMessage(tab.id, {type: 'LIBLIB_OPEN_WORK', url: card.url});
    if (!opened?.opened) throw new Error(`第 ${seen.size + 1} 篇卡片不在页面中，已停止。未把它当成成功或静默跳过。`);
    let payload, detailReason = '详情脚本没有返回结果';
    for (let attempt = 0; attempt < 20; attempt++) {
      await controlledWait(1000);
      const issue = await pageProblem(tab.id);
      if (issue) throw new Error(`第 ${seen.size + 1} 篇${issue === 'verification' ? '触发安全验证' : '无法访问'}，已停止并保留当前页面。`);
      const detail = await chrome.tabs.sendMessage(tab.id, {type: 'LIBLIB_DETAIL', id: card.id});
      payload = detail?.payload;
      detailReason = detail?.reason || detailReason;
      if (payload?.images?.length) break;
    }
    if (!payload?.images?.length) throw new Error(`第 ${seen.size + 1} 篇未确认笔记详情和正文图片：${detailReason}。已停止，请保留当前页面。`);
    await controlPoint();
    let saved;
    try { saved = await submit({...payload, ...author}, payload.canonical_url, port); }
    catch (error) { throw new Error(`第 ${seen.size + 1} 篇保存失败：${error.message}`); }
    if (!saved?.total_images) throw new Error('保存服务未确认任何图片落盘，已停止。');
    seen.add(card.id);
    newImages += saved.new_images || 0;
    totalImages += saved.total_images;
    await reportProgress({message: `已保存 ${seen.size} 篇 · 新增 ${newImages} 张`});
    await controlPoint();
    const closed = await chrome.tabs.sendMessage(tab.id, {type: 'LIBLIB_CLOSE_WORK'});
    if (!closed?.closed) throw new Error('图片已保存，但未找到详情关闭按钮，已停止；请手动回到作者主页。');
    await controlledWait(3000);
    const current = await chrome.tabs.get(tab.id);
    if (new URL(current.url).pathname !== new URL(tab.url).pathname) throw new Error('图片已保存，但页面尚未返回作者主页，已停止。');
    if (seen.size % 10 === 0) await controlledWait(20000);
  }
  return {new_images: newImages, total_images: totalImages, works: seen.size, failed: 0, message: `已保存 ${seen.size} 篇；达到本轮处理上限，尚未确认全部完成。`};
}

async function collectAuthor(tab, port) {
  if (/(^|\.)pinterest\.(com|cn)$/.test(new URL(tab.url).hostname)) throw new Error('Pinterest 请使用当前 Board 采集，不使用作者模式。');
  if (new URL(tab.url).hostname === 'www.xiaohongshu.com') return collectXhsAuthor(tab, port);
  if (!/(^|\.)(pinterest\.com|pinterest\.cn|huaban\.com)$/.test(new URL(tab.url).hostname)) throw new Error('此平台暂仅支持单帖采集，未启动作者扫描。请打开一篇帖子使用当前页。');
  const author = await authorContext(tab, port);
  await inject(tab.id);
  const discovered = await chrome.tabs.sendMessage(tab.id, {type: "LIBLIB_DISCOVER_AUTHOR"});
  if (discovered?.error === "USER_STOPPED") throw new Error("采集已停止");
  if (discovered?.error) throw new Error(discovered.error);
  const urls = discovered?.urls || [];
  if(taskContext.options.limit) urls.splice(batchLimit(taskContext.options.limit));
  if (!urls.length) throw new Error("当前页未识别到作者作品，请先打开作者主页");
  let newImages = 0;
  let totalImages = 0;
  let failed = 0;
  const profileUrl = tab.url;
  try {
    for (let index = 0; index < urls.length; index += 1) {
      await controlPoint();
      const percent = Math.round((index / urls.length) * 100);
      await reportProgress({percent, message: `正在处理第 ${index + 1}/${urls.length} 篇\n新增 ${newImages} 张`});
      try {
        const opened = await chrome.tabs.sendMessage(tab.id, {type: "LIBLIB_OPEN_WORK", url: urls[index]});
        if (!opened?.opened) throw new Error("WORK_CARD_NOT_FOUND");
        await controlledWait(3000);
        const problem = await pageProblem(tab.id);
        if (problem === "verification") throw new Error("PLATFORM_VERIFICATION");
        if (problem === "unavailable") throw new Error("NOTE_UNAVAILABLE");
        const currentUrl = (await chrome.tabs.get(tab.id)).url;
        const result = await submit({...await pagePayload(tab.id), ...author}, currentUrl, port);
        newImages += result.new_images || 0;
        totalImages = result.total_images || totalImages;
      } catch (error) {
        if (error.message === "USER_STOPPED") throw new Error("采集已停止");
        if (error.message === "PLATFORM_VERIFICATION") throw new Error(`平台触发验证，已安全停止；已处理 ${index} 篇。请完成验证后稍后再试`);
        throw new Error(`第 ${index + 1} 篇失败，已停止：${error.message}`);
      }
      if ((await chrome.tabs.get(tab.id)).url !== profileUrl) {
        await chrome.tabs.goBack(tab.id).catch(() => chrome.tabs.update(tab.id, {url: profileUrl}));
        await controlledWait(2500);
        await inject(tab.id);
      } else {
        await chrome.tabs.sendMessage(tab.id, {type: "LIBLIB_CLOSE_WORK"}).catch(() => {});
        await controlledWait(1000);
      }
      if ((index + 1) % 10 === 0 && index + 1 < urls.length) await controlledWait(20000);
    }
  } finally {
    const current = await chrome.tabs.get(tab.id).catch(() => null);
    if (current && current.url !== profileUrl && !/captcha|verify/i.test(current.url || "")) await chrome.tabs.goBack(tab.id).catch(() => chrome.tabs.update(tab.id, {url: profileUrl}));
  }
  return {new_images: newImages, total_images: totalImages, works: urls.length, failed};
}

async function collectBoard(tab, port) {
  const snapshot = async () => {
    if (await pageProblem(tab.id)) throw new Error('画板触发验证或无法访问，已停止。');
    const [{result}] = await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['board.js']});
    if (!result || result.error) throw new Error(result?.error || '无法读取画板');
    return result;
  };
  const board = await snapshot(), urls = new Set();
  let idle = 0;
  for (let round = 0; round < 80 && idle < 4 && urls.size < 500; round++) {
    await controlPoint();
    const data = await snapshot();
    if (data.board_url !== board.board_url) throw new Error('页面已离开当前画板，停止扫描。');
    const before = urls.size;
    data.urls.forEach(url => { if (urls.size < 500) urls.add(url); });
    idle = urls.size === before ? idle + 1 : 0;
    await reportProgress({message: `扫描画板「${board.board_name}」· 已找到 ${urls.size} 个 Pin`});
    if (idle >= 4) break;
    await controlPoint();
    await chrome.scripting.executeScript({target: {tabId: tab.id}, func: () => window.scrollBy(0, Math.max(400, innerHeight * .85))});
    await controlledWait(2500);
  }
  if (!urls.size) throw new Error('当前画板未识别到 Pin，未开始保存。');
  let saved = 0, newImages = 0;
  for (const url of urls) {
    await controlPoint();
    await reportProgress({percent: Math.round(saved / urls.size * 100), message: `画板「${board.board_name}」 ${saved + 1}/${urls.size} · 新增 ${newImages} 张`});
    await chrome.tabs.update(tab.id, {url});
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await controlledWait(1000);
      const current = await chrome.tabs.get(tab.id);
      if (current.status === 'complete' && new URL(current.url).pathname === new URL(url).pathname) { ready = true; break; }
    }
    if (!ready) throw new Error('Pin 未正常打开，已停止；已保存图片保留。');
    if (await pageProblem(tab.id)) throw new Error('Pin 触发验证或无法访问，已停止并保留现场。');
    const payload = await pagePayload(tab.id);
    const result = await submit({...payload, board_url: board.board_url, board_name: board.board_name}, url, port);
    saved++; newImages += result.new_images || 0;
    await controlledWait(saved % 10 === 0 ? 20000 : 2500);
  }
  await controlPoint();
  await chrome.tabs.update(tab.id, {url: board.board_url});
  return {works: saved, new_images: newImages, message: `画板「${board.board_name}」已处理 ${saved} 个 Pin，新增 ${newImages} 张。图片平铺在画板采集目录；仅代表本轮识别到的 Pin，不保证隐藏或未加载内容。`};
}

async function collect(mode, port, options = {}, testTarget) {
  options={...options,capture_scope:options.capture_scope||(['author','board'].includes(mode)?'batch':'single'),capture_kind:options.capture_kind||(['video','download','download-frames'].includes(mode)?'video':options.collection_mode||'images')};
  if(options.video_only){
    if(!['author','board'].includes(mode))throw new Error('独立视频批量需要作者或画板入口');
    options={...options,collection_mode:'images',include_images:false,include_comments:false,include_videos:true};
  }
  resolvedMedia=new Map();
  const pending=(await chrome.storage.local.get(['collectorBackendPending'])).collectorBackendPending;
  if(pending){
    const h=await reftrayHealth('http://127.0.0.1:'+port+'/health').then(r=>r.json());healthCache=h;
    const status=await service((pending.kind==='video'?'/video/status/':'/collect/status/')+pending.jobId).catch(error=>{if(/不存在|重启|404/.test(error.message))return {status:'missing'};throw error;});
    if(['running','stopping'].includes(status.status))throw new Error('上一篇后台仍在收尾，请等待完成后再开始');
    await chrome.storage.local.remove('collectorBackendPending');
  }
  const stored = await chrome.storage.local.get(["liblibActiveJob"]);
  const active = stored.liblibActiveJob;
  if (active?.startedAt && Date.now() - active.startedAt < 15 * 60 * 1000) throw new Error("当前已有采集任务，请稍候");
  if (active) await chrome.storage.local.remove("liblibActiveJob");
  const tab = testTarget ? await chrome.tabs.get(testTarget.id) : (await chrome.tabs.query({active: true, currentWindow: true}))[0];
  if(testTarget && tab.url !== testTarget.url) throw new Error('测试目标页面已改变，请重新选择标签页。');
  taskContext = {imageQuotaUsed:0,options:CaptureOptions.snapshot(options),control:'running',backendJobId:null,id:crypto.randomUUID(),url:tab?.url?.replace(/([?&])(?:xsec_token|xsec_source)=[^&#]*/g,'$1'), mode, title:tab?.title};
  if (!tab?.id || (!/^https?:/i.test(tab.url || "") && !(mode === 'video' && tab.url === chrome.runtime.getURL('video.html')))) throw new Error("请打开普通网页后再采集");
  await chrome.storage.local.set({liblibActiveJob: {mode, startedAt: Date.now(), build: BUILD, testRunId:testTarget?.runId}});
  await chrome.storage.local.set({liblibControl: "running"});
  await reportProgress({message: mode === 'author' ? '准备读取作者主页' : '准备保存当前页'});
  try {
    const health = await reftrayHealth(`http://127.0.0.1:${port}/health`).then(r => r.json());
    healthCache = health;
    const extensionRelease=chrome.runtime.getManifest().version;
    if(health.release&&health.release!==extensionRelease)throw new Error(`扩展 ${extensionRelease} 与后台 ${health.release} 版本不一致。请在 chrome://extensions 重新加载「灵感采集」，再刷新作品网页；确认加载的是本次安装目录中的 extension。`);
    if(options.md_only&&!health.md_only)throw new Error('纯文字模式需要新版保存服务，请安装并启动0.5.11或更新版本；尚未保存文件');
    if(options.video_only&&!health.space_preflight)throw new Error('视频批量需要支持容量预检的保存服务');
    if(health.capture_history){startPreparation();}
    if(!health.flexible_collection) throw new Error('请重启新版保存服务后再采集。');
    if (!health.directory_settings) throw new Error('保存服务尚未更新，请重启保存服务后再采集。');
    if (options.collection_mode === 'text' && !health.text_collection) throw new Error('图文模式需要 0.2.17 保存服务，请重启新版服务。');
    if (mode === 'video' && !health.video_frames) throw new Error('保存服务尚未支持视频帧，请更新并重启保存服务。');
    taskContext.directory = health.inbox;
    if (mode === 'board') {
      if (!health.board_collection) throw new Error('保存服务尚未支持画板，请更新并重启保存服务。');
      return await runBoardBatch(tab, port, options);
    }
    if(mode==='author' && new URL(tab.url).hostname==='www.xiaohongshu.com') return await runXhsBatch(tab,port,options);
    if(mode==='author' && /(^|\.)(x\.com|twitter\.com)$/.test(new URL(tab.url).hostname)) return await runXBatch(tab,port,options);
    if(mode==='author' && /^(www\.)?huaban\.com$/.test(new URL(tab.url).hostname))return await runSocialBatch(tab,port,options,'huaban');
    if(mode==='author' && /(^|\.)artstation\.com$/.test(new URL(tab.url).hostname))return await runSocialBatch(tab,port,options,'artstation');
    if(mode==='author' && /(^|\.)instagram\.com$/.test(new URL(tab.url).hostname)) return await runSocialBatch(tab,port,options,'instagram');
    if(mode==='author' && /(^|\.)bilibili\.com$/.test(new URL(tab.url).hostname))return await runSocialBatch(tab,port,options,'bilibili');
    if(mode==='author' && /(^|\.)youtube\.com$/.test(new URL(tab.url).hostname))return await runSocialBatch(tab,port,options,'youtube');
    if (mode === 'download' || mode === 'download-frames') return await downloadVideo(tab, port, options, health, mode === 'download-frames');
    if (mode === 'video' && options.savedAsset) {
      const saved = await downloadApi(port, health.settings_token, `/video/info/${encodeURIComponent(options.savedAsset)}`);
      return await collectVideo(tab, port, options, saved.page);
    }
    return mode === 'video' ? await collectVideo(tab, port, options) : mode === "author" ? await collectAuthor(tab, port) : await collectCurrent(tab, port, options);
  } catch(error) {
    if(taskContext.batch){taskContext.batch.error=error.message;taskContext.batch.completed=false;try{await saveBatch();}catch(persistError){error.message+='；任务记录同步失败：'+persistError.message;}}
    throw error;
  } finally {
    taskContext.directory = undefined;
    await chrome.storage.local.remove(["liblibActiveJob", "liblibControl"]);
    await chrome.storage.local.remove('collectorApproval');
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if(message.type==='CHOOSE_TASK_FOLDER'){
    if(_sender.id!==chrome.runtime.id||!['popup.html','manage.html'].some(p=>_sender.url?.split('#')[0]===chrome.runtime.getURL(p))){sendResponse({ok:false,error:'无效的目录选择入口'});return false;}
    const requestId=message.requestId;
    (async()=>{
      const h=await reftrayHealth('http://127.0.0.1:8766/health').then(r=>r.json());
      const base='http://127.0.0.1:8766/settings/choose-folder',headers={'X-Collector-Token':h.settings_token};
      const r=await fetch(base,{method:'POST',headers,signal:AbortSignal.timeout(5000)});
      const job=await r.json();if(!r.ok)throw new Error(job.detail||'无法选择文件夹');
      // Short requests avoid MV3's 30-second fetch response timeout while a native dialog is open.
      for(let n=0;n<125;n++){
        const response=await fetch(base+'/'+encodeURIComponent(job.id),{headers,signal:AbortSignal.timeout(5000)});
        const value=await response.json();if(!response.ok)throw new Error(value.detail||'无法选择文件夹');
        const {collectorPopupDraft:d}=await chrome.storage.local.get(['collectorPopupDraft']);
        if(value.state==='failed')throw new Error(value.error);
        if(value.state==='done'){
          if(d&&d.requestId===requestId)await chrome.storage.local.set({collectorPopupDraft:{...d,picking:false,options:{...d.options,...(!value.cancelled?{destination:value.directory}:{})}}});
          return {ok:true,...value};
        }
        await wait(1000);
      }
      throw new Error('选择文件夹超时，原目录未改变');
    })().then(sendResponse).catch(async e=>{const {collectorPopupDraft:d}=await chrome.storage.local.get(['collectorPopupDraft']);if(d&&d.requestId===requestId)await chrome.storage.local.set({collectorPopupDraft:{...d,picking:false,error:e.message}});sendResponse({ok:false,error:e.message});});return true;
  }
  if(message.type==='END_BATCH'){
    if(taskRunning){sendResponse({ok:false,error:'请先停止当前任务'});return false;}
    TaskStore.endBatch().then(()=>sendResponse({ok:true})).catch(e=>sendResponse({ok:false,error:e.message}));return true;
  }
  if(message.type==='APPROVE_DOWNLOAD'){
    chrome.storage.local.get(['collectorApproval']).then(async({collectorApproval:a})=>{if(a?.state==='pending')await chrome.storage.local.set({collectorApproval:{...a,state:message.approve?'approved':'rejected'}});sendResponse({ok:true});});return true;
  }
  if (message.type === 'OPEN_LAST_VIDEO') {
    (async () => {
      const {inspirationLastVideo} = await chrome.storage.local.get(['inspirationLastVideo']);
      if (!inspirationLastVideo) throw new Error('还没有已下载的视频');
      const health = await reftrayHealth('http://127.0.0.1:8766/health').then(r => r.json());
      await downloadApi(8766, health.settings_token, `/video/open/${encodeURIComponent(inspirationLastVideo.assetId)}`, {});
      return {ok: true};
    })().then(sendResponse).catch(error => sendResponse({ok: false, error: error.message}));
    return true;
  }
  if (['VIDEO_CONTROL', 'VIDEO_FRAME', 'VIDEO_PROGRESS'].includes(message.type)) {
    videoMessage(message, _sender).then(sendResponse).catch(error => sendResponse({ok: false, error: error.message}));
    return true;
  }
  if (message.type === 'COLLECTOR_HELLO') {
    (async()=>{
      if(!taskRunning){
        const {liblibActiveJob:old}=await chrome.storage.local.get(['liblibActiveJob']);
        if(old){await chrome.storage.local.remove(['liblibActiveJob','liblibControl','collectorApproval']);await reportProgress({status:'interrupted',message:'上次任务已中断，已保存内容保留；可在任务记录中续采。'});}
      }
      sendResponse({ok:true,build:BUILD});
    })().catch(error=>sendResponse({ok:false,error:error.message}));return true;
  }
  if (message.type === "CONTROL_COLLECTOR") {
    (taskContext.control=message.action,chrome.storage.local.set({liblibControl: message.action})).then(() => sendResponse({ok: true}));
    return true;
  }
  if (message.type === "RESET_COLLECTOR") {
    if (taskRunning) {
      chrome.storage.local.set({liblibControl: 'stopped'}).then(() => sendResponse({ok: true, stopping: true}));
      return true;
    }
    chrome.storage.local.set({liblibControl: "stopped"}).then(() => chrome.storage.local.remove(["liblibActiveJob", "liblibProgress"])).then(() => sendResponse({ok: true}));
    return true;
  }
  if (message.type === 'COLLECT') {
    sendResponse({ok: false, error: '采集界面仍是旧版，请关闭弹窗后重新打开。'});
    return false;
  }
  if (message.type !== 'COLLECT_V2') return false;
  if(message.testTarget && (_sender.id!==chrome.runtime.id || _sender.url!==chrome.runtime.getURL('live-test.html') || !Number.isInteger(message.testTarget.id) || !/^https?:\/\//.test(message.testTarget.url||'') || !/^[a-f0-9-]{36}$/.test(message.testTarget.runId||'') || message.options?.limit>3 || !message.options?.destination)){
    sendResponse({ok:false,error:'无效的实测入口或测试参数'});return false;
  }
  if (message.build !== BUILD) {
    sendResponse({ok: false, error: '界面与后台版本不一致，请在扩展管理页重新加载灵感采集。'});
    return false;
  }
  if (taskRunning) {sendResponse({ok: false, error: '任务仍在结束中，请稍候。'}); return false;}
  taskRunning = true;
  const previousContext=taskContext;
  collect(message.mode || "current", message.port || 8766, message.options, message.testTarget).then(async (result) => {
    await reportProgress({percent: 100, status: result.status==='partial'||result.partial||result.failed_images&&result.new_images?'partial':result.failed_images||result.status==='failed'?'failed':'completed', message: result.message || `保存完成，新增 ${result.new_images} 张`, directory:taskContext.batch?.directory||result.directory, details:result.details || result.warnings?.join('\n')});
    sendResponse({ok: true, result});
  }).catch(async (error) => {
    if(taskContext===previousContext){
      sendResponse({ok:false,error:error.message||'任务未能开始'});
      return;
    }
    const reason = error.message === 'USER_STOPPED' ? '已停止，已保存内容和断点保留。' : error.message.includes('NEEDS_ATTENTION') ? '页面需要验证或登录，任务已暂停。处理后回到原主页续采。' : error.message || '这次未能完成，请查看详情。';
    await reportProgress({status:error.message==='USER_STOPPED'?'stopped':error.message.includes('NEEDS_ATTENTION')?'paused':'failed', message:reason,directory:taskContext.batch?.directory||taskContext?.stopResult?.directory,details:error.message});
    sendResponse({ok: false, error: reason});
  }).finally(() => {taskRunning = false;});
  return true;
});
