// Browser reading and bounded DOM expansion. Receives services; owns no task state.
(() => {
 function create({BUILD,chrome,controlPoint,controlledWait,matureMedia,service}){
async function tabReady(tab) {
  if(tab.status==='complete')return true;
  if(!/^https:\/\/(?:www\.)?(?:huaban|pinterest|artstation)\.com\//.test(tab.url||''))return false;
  try {
    const [{result}]=await boundedRead(chrome.scripting.executeScript({target:{tabId:tab.id},injectImmediately:true,func:()=>({
      url:location.href,ready:document.readyState!=='loading'&&Boolean(document.body?.childElementCount)
    })}),2000);
    return result?.url===tab.url&&result.ready===true;
  }catch(_){return false;}
}
async function inject(tabId, immediately=false) {
  await chrome.scripting.executeScript({target: {tabId}, injectImmediately:immediately, files: ["document-source.js", "pinterest-identity.js", "platforms.js", "content.js"]});
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
  const timeout=/(^|\.)(youtube\.com|youtu\.be|x\.com|twitter\.com)$/.test(new URL(current.url).hostname)?145000:options.include_comments&&options.include_replies?60000:25000;
  const payload=await boundedRead(readPagePayload(tabId,options,current),timeout);
  if((await chrome.tabs.get(tabId)).url!==current.url)throw new Error('页面已切换，请回到目标作品后重新采集');
  const store=chrome.storage.session;
  const scan=store ? (await store.get('collectorPageScans')).collectorPageScans?.[tabId] : null;
  if(scan && scan.url===current.url && scan.expires>Date.now()){
    const union=(left,right)=>[...new Map([...left,...right].map(item=>[item.url,item])).values()];
    if(!options.md_only && options.include_images!==false)payload.images=union(scan.images||[],payload.images||[]);
    if(!options.md_only)payload._media=union(scan.media||[],payload._media||[]);
    payload.has_video=payload.has_video||scan.has_video;
    if(options.collection_mode==='text' && (scan.body_text||'').length>(payload.body_text||'').length){
      payload.body_text=scan.body_text;payload.document_source=scan.document_source;
    }
  }
  return payload;
}
async function readPagePayload(tabId, options, current) {
  if(/(^|\.)huaban\.com$/.test(new URL(current.url).hostname)){
    await chrome.scripting.executeScript({target:{tabId},world:'MAIN',injectImmediately:true,files:['huaban.js']});
    // The detail shell appears before its signed main image is ready. Keep the
    // exact-Pin adapter in charge throughout loading, including manual capture.
    for(let attempt=0;attempt<16;attempt++){
      await controlPoint();
      const [{result}]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',injectImmediately:true,args:[current.url],func:expected=>location.href===expected?CollectorHuaban.extract(expected):{error:'页面已切换，请回到目标作品后重新采集'}});
      if(result?.error)throw new Error(result.error);
      if(result)return {...result,collection_mode:options.collection_mode||'images',include_images:options.include_images!==false,md_only:Boolean(options.md_only),ocr_enabled:Boolean(options.ocr_enabled)};
      if(attempt<15)await controlledWait(500);
    }
    throw new Error('未确认当前花瓣作品的主图已加载，请等主图显示后重新采集；推荐图不会保存。');
  }

  if(/(^|\.)artstation\.com$/.test(new URL(current.url).hostname)){
    await chrome.scripting.executeScript({target:{tabId},injectImmediately:true,files:['document-source.js','artstation.js']});
    let issue='ArtStation 作品图片尚未加载，请等作品显示后重试';
    for(let attempt=0;attempt<16;attempt++){
      await controlPoint();
      const [{result}={}]=await chrome.scripting.executeScript({target:{tabId},injectImmediately:true,args:[current.url],func:expected=>{
        if(location.href!==expected)return {changed:true};
        // Chrome does not reliably forward exceptions thrown by an injected function.
        try{return CollectorArtstation.extract(expected);}catch(error){return {error:error.message};}
      }});
      if(result?.changed)throw new Error('页面已切换，请回到目标作品后重新采集');
      if(result?.error)issue=result.error;
      const hasContent=result&&(result.images?.length||result.has_video||options.collection_mode==='text'&&result.body_text?.trim());
      const shareOnly=result?.extraction_warnings?.some(w=>w.startsWith('仅取得作品分享图'));
      if(hasContent&&(!shareOnly||attempt===15))return {...result,collection_mode:options.collection_mode||'images',include_images:options.include_images!==false&&!options.md_only,md_only:Boolean(options.md_only),ocr_enabled:Boolean(options.ocr_enabled),comments:[],comments_requested:Boolean(options.include_comments),comments_status:'当前平台未支持评论'};
      if(attempt<15)await controlledWait(500);
    }
    throw new Error(issue);
  }
  if(/(^|\.)(youtube\.com|youtu\.be)$/.test(new URL(current.url).hostname)){
    const {media}=await matureMedia(current.url,options),source=media[0];
    return {...source,platform:'youtube',images:[],body_text:'',has_video:true,video_count:media.length,_media:media,collection_mode:'images'};
  }
  if(/(^|\.)bilibili\.com$/.test(new URL(current.url).hostname)) {
    await setMediaQuality(tabId,options);
    const [{result}]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',files:['document-source.js','bilibili.js']});
    if(!result?.payload)throw new Error(result?.error||'未确认B站当前稿件');
    return {...result.payload,collection_mode:options.collection_mode||'images',include_images:options.include_images!==false,ocr_enabled:Boolean(options.ocr_enabled),images:options.collection_mode==='text'&&options.include_images===false&&!options.ocr_enabled?[]:result.payload.images,comments:[],comments_requested:Boolean(options.include_comments),comments_status:'当前平台未支持评论',_media:result.source?[{...result.source,kind:'video'}]:[]};
  }
  await inject(tabId,/(^|\.)pinterest\.com$/.test(new URL(current.url).hostname));
  const payload = await chrome.tabs.sendMessage(tabId, {type: "LIBLIB_PAGE_PAYLOAD", options});
  let xPageData;
  if (payload?.error) {
    const isX = /(^|\.)(x\.com|twitter\.com)$/.test(new URL(current.url).hostname);
    if (isX && !options.video_only) {
      const id = new URL(current.url).pathname.match(/\/status\/(\d+)/)?.[1];
      xPageData = await loadedPageMedia(tabId, false, options);
      const hasRequestedMedia = xPageData.has_gif || xPageData.media?.some(item =>
        item.kind === 'photo' || item.kind === 'gif' || (item.kind === 'video' && options.include_videos));
      if (!id || xPageData.postId !== id || !hasRequestedMedia || options.md_only) throw new Error(payload.error);
      Object.assign(payload,{error:null,platform:'x',canonical_url:current.url.split('?')[0],page_title:current.title,images:[],body_text:'',has_video:Boolean(xPageData.has_gif),collection_mode:options.collection_mode || 'images'});
    } else {
      const media=await loadedMedia(tabId,options);
      if(!media.some(m=>m.kind==='video'||m.kind==='gif'))throw new Error(payload.error);
      Object.assign(payload,{error:null,canonical_url:current.url.split('?')[0],page_title:current.title,platform:isX?'x':'generic',images:[],body_text:'',has_video:true,_media:media});
    }
  }
  if (!payload) throw new Error('网页没有响应');
  await readExpandedReplies(tabId,payload,options);
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
  const pageData = payload.platform === 'instagram' ? await loadedPageMedia(tabId,true,options) : null;
  if(pageData?.postId && pageData.postId!==new URL(payload.canonical_url).pathname.match(/^\/(?:[\w.]+\/)?(?:p|reels?)\/([\w-]+)/)?.[1])throw new Error('帖子在读取过程中发生变化，未保存错帖');
  if(pageData?.author_handle)payload.author_handle=pageData.author_handle;
  if(pageData?.media?.some(item=>item.kind==='video'||item.kind==='gif'))payload.has_video=true;
  if (!options.md_only) {
    const mediaPage = xPageData || pageData || await loadedPageMedia(tabId,false,options).catch(error=>{if(error.message!=='USER_STOPPED' && payload.platform==='x' && payload.images?.length)return {media:[],resolution_error:error.message};throw error;});
    if(payload.platform==='x' && mediaPage.postId && mediaPage.postId!==new URL(payload.canonical_url).pathname.match(/\/status\/(\d+)/)?.[1]) throw new Error('页面已切换，请回到目标帖子后重试');
    if(mediaPage.resolution_error)payload._preflightIssue=mediaPage.resolution_error;
    if(payload.platform==='x'){payload.author_handle ||= mediaPage.author_handle;payload.body_text ||= mediaPage.session_text||'';}
    const found = mediaPage.media || [];
    const media = options.skip_gifs?found.filter(m=>m.kind!=='gif'&&m.extension!=='gif'&&!m.live_missing):found;
    if(found.length && payload.platform!=='x')payload.images=[];
    payload._skippedMotion=found.length>media.length||Boolean(mediaPage.has_gif&&options.skip_gifs);
    if(options.skip_gifs)payload.has_live_photo=false;
    payload._media=media;
    if(media.some(m=>m.kind==='video'||m.kind==='gif'))payload.has_video=true;
    if(payload.platform==='xhs'&&!options.skip_gifs)payload.has_live_photo=media.some(m=>m.live_missing)||Boolean(payload.has_live_photo&&!media.some(m=>m.live_photo));
    const photos = media.filter(item => item.kind === 'photo').map(item => ({url: item.url, alt: ''}));
    if (photos.length) {
      payload.images = payload.platform==='x' ? [...new Map([...(payload.images||[]),...photos].map(item=>[item.url,item])).values()] : photos;
      payload.extraction_warnings = (payload.extraction_warnings || []).filter(w => !w.startsWith('仅采集已加载') && !w.startsWith('仅取得帖子分享图'));
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

async function readExpandedReplies(tabId,payload,options){
  if(payload._repliesExpanded||!['xhs','instagram'].includes(payload.platform)||options.collection_mode!=='text'||!options.include_comments||!options.include_replies)return payload;
    let reason;
    try{reason=await expandCommentReplies(tabId,payload.canonical_url,options);}
    catch(error){if(error.message==='USER_STOPPED')throw error;reason='自动展开未完成：'+error.message;}
    const refreshed=await chrome.tabs.sendMessage(tabId,{type:'LIBLIB_PAGE_PAYLOAD',options});
    if(refreshed?.error)throw new Error(refreshed.error);
    const expected=new URL(payload.canonical_url),actual=refreshed?.canonical_url&&new URL(refreshed.canonical_url);
    if(!actual||actual.origin!==expected.origin||actual.pathname!==expected.pathname)throw new Error('展开回复后帖子已变化，未保存错帖');
    payload.comments=refreshed.comments||[];
    payload.comments_status=(refreshed.comments_status||'')+'。'+reason;
    payload.extraction_warnings=[...(payload.extraction_warnings||[]),payload.comments_status];
    payload._repliesExpanded=true;
    return payload;
}

async function expandCommentReplies(tabId,url,options){
  await chrome.scripting.executeScript({target:{tabId},files:['comment-replies.js']});
  let state={};const deadline=Date.now()+45000;
  for(let action=0;action<80&&Date.now()<deadline;action++){
    await controlPoint();
    const [{result}={}]=await chrome.scripting.executeScript({target:{tabId},func:(expected,settings,state)=>{
      try{return InspirationPlatforms.replyStep(expected,settings,state);}catch(error){return {error:error.message};}
    },args:[url,options,state]});
    if(!result||result.error)throw new Error(result?.error||'评论区域没有响应');
    if(result.done)return result.reason;
    state=result.state;await controlledWait(400);
  }
  return '本次自动展开已达到等待上限，已保存当前加载的回复。';
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

async function loadedMedia(tabId,options={}) {
  return (await loadedPageMedia(tabId,true,options)).media || [];
}
async function setMediaQuality(tabId,options={}){
  await chrome.scripting.executeScript({target:{tabId},world:'MAIN',args:[options.video_quality||'best',options.output_format||'original'],func:(value,format)=>{globalThis.__collectorVideoQuality=['best','1080','720','480'].includes(value)?value:'best';globalThis.__collectorOutputFormat=format==='audio'?'audio':'original';}});
}
async function loadedPageMedia(tabId, resolveVideo=true, options={}) {
  let resolvingGif=false, observed;
  await setMediaQuality(tabId,options);
  const tab=await chrome.tabs.get(tabId);
  if(/(^|\.)bilibili\.com$/.test(new URL(tab.url).hostname)) {
    const [{result}]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',files:['document-source.js','bilibili.js']});
    if(!result?.payload)throw new Error(result?.error||'无法确认B站稿件');
    return {media:result.source?[{...result.source,kind:'video'}]:[]};
  }
  try {
    await chrome.scripting.executeScript({target: {tabId}, world: 'MAIN', files: ['cat-instagram.js', 'cat-xhs.js', 'cat-media.js']});
    const [{result}] = await chrome.scripting.executeScript({target: {tabId}, world: 'MAIN', files: ['page-media.js']});
    observed=result;
    if(result?.has_gif&&!options.skip_gifs&&!result.media?.some(m=>m.kind==='gif')){
      resolvingGif=true;
      const resolved=await matureMedia(tab.url,options),media=(resolved.media||[]).filter(m=>m.kind==='gif');
      if(!media.length)throw new Error('页面标记为 GIF，但尚未解析到属于当前帖子的动图源；请刷新原帖后重试');
      return {...result,media:[...(result.media||[]).filter(m=>m.kind==='photo'),...media]};
    }
    if(resolveVideo&&!result?.media?.length&&/(^|\.)(x\.com|twitter\.com)$/.test(new URL(tab.url).hostname)&&/\/status\/\d+/.test(new URL(tab.url).pathname))return await matureMedia(tab.url,options);
    return result || {media:[]};
  } catch(error){if(error.message==='USER_STOPPED')throw error;if(resolvingGif && observed?.media?.some(m=>m.kind==='photo'))return {...observed,resolution_error:error.message};if(resolvingGif)throw error;if(/(^|\.)(x\.com|twitter\.com)$/.test(new URL(tab.url).hostname))throw new Error('[X_PAGE_READ] 读取当前 X 帖子失败：'+String(error.message||error).slice(0,800));return {media:[]};} // Other platform DOM fallbacks remain unchanged.
}

async function includeProtectedImages(payload, pageUrl) {
  // Eligibility is chosen by submit; do not silently disable generic/Bilibili prefetch here.
  let cursor=0,totalBytes=0;
  const output=new Array(payload.images.length);
  async function worker(){while(cursor<payload.images.length){
    const index=cursor++,item=payload.images[index];
    output[index]=item;
    if (item.data_base64||totalBytes>=64*1048576) continue;
    const sources=payload.platform==='huaban'&&item.preferred_url?[item.preferred_url,item.url]:[item.url];
    for(const source of sources)try {
      const response = await fetch(source, {credentials: payload.platform==="x"?"omit":"include", redirect: payload.platform==="x"?"error":"follow", referrer: pageUrl, signal:AbortSignal.timeout(20000)});
      if (!response.ok || (['x','huaban'].includes(payload.platform) && !response.headers.get('Content-Type')?.startsWith('image/'))) continue;
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
      output[index]={...item, data_base64: btoa(binary), data_url:source, content_type: blob.type};
      break;
    } catch (_error) {
      if(_error.imageLimit && payload.platform!=='x')throw _error;
    }
  }}
  await Promise.all([worker(),worker()]);
  payload.images=output;
  return payload;
}

async function huabanBoardPayload(candidate,url,options) {
  if(!candidate||candidate.canonical_url!==url||candidate.platform!=='huaban'||candidate.images?.length!==1||
    options.collection_mode==='text'||options.md_only||options.video_only||options.include_videos||options.include_comments||options.include_images===false)return null;
  const image=candidate.images[0];
  if(!image.preferred_url)return null;
  await controlPoint();
  const payload={...candidate,images:[{...image}]};
  await includeProtectedImages(payload,url);
  await controlPoint();
  const saved=payload.images[0];
  // A card preview alone is not enough: fall back to the detail reader if its
  // full-size image was unavailable. Signed URLs live only in this snapshot.
  if(!saved.data_base64||saved.data_url!==image.preferred_url||!/^image\/(?:jpeg|png|webp)$/.test(saved.content_type||''))return null;
  return {...payload,collection_mode:'images',include_images:true,ocr_enabled:Boolean(options.ocr_enabled)};
}

async function huabanListPayload(tabId,listUrl,url,options) {
  if(options.collection_mode==='text'||options.md_only||options.video_only||options.include_videos||options.include_comments||options.include_images===false)return null;
  await controlPoint();
  const [{result:token}={}]=await chrome.scripting.executeScript({target:{tabId},args:[listUrl,url],func:(list,pin)=>{
    try{return CollectorHuabanList.openPin(list,pin);}catch(error){return {error:error.message};}
  }});
  if(token?.error)throw new Error(token.error);
  if(!token?.opened)return null;
  let issue;
  try{
    for(let attempt=0;attempt<20;attempt++){
      await controlPoint();
      const [{result}={}]=await chrome.scripting.executeScript({target:{tabId},args:[token],func:token=>{
        if(performance.timeOrigin!==token.documentId)return {error:'花瓣页面已切换，已停止读取'};
        if(location.href===token.listUrl)return null;
        if(location.href.replace(/\/$/,'')!==token.pinUrl.replace(/\/$/,''))return {error:'花瓣页面已切换，已停止读取'};
        try{return CollectorHuaban.extract(location.href);}catch(error){return {error:error.message};}
      }});
      if(result?.error)throw new Error(result.error);
      if(result?.images?.length)return {...result,collection_mode:'images',include_images:true,ocr_enabled:Boolean(options.ocr_enabled)};
      if(attempt<19)await controlledWait(500);
    }
    return null;
  }catch(error){issue=error;throw error;}
  finally{
    // Restoring our own modal is cleanup, including after Stop. Never navigate
    // back if the user changed page, opened another Pin or added a history entry.
    try{
      const [{result}={}]=await chrome.scripting.executeScript({target:{tabId},args:[token],func:token=>CollectorHuabanList.restorePin(token)});
      if(result?.changed)throw new Error('花瓣页面已切换，保留当前页面并停止采集');
      if(result?.restoring){
        let restored=false;
        for(let attempt=0;attempt<16;attempt++){
          const current=await chrome.tabs.get(tabId);
          if(current.url===token.listUrl){restored=true;break;}
          if(current.url?.replace(/\/$/,'')!==token.pinUrl.replace(/\/$/,''))break;
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(!restored)throw new Error('花瓣详情尚未返回画板，已停止；请关闭详情后续采');
      }
    }catch(error){if(!issue)throw error;}
  }
}
function publicPinEligible(url,options={}) {
  return /^https:\/\/(?:www\.)?pinterest\.com\/pin\/\d+\/?(?:\?[^#]*)?$/.test(url)&&options.collection_mode!=='text'&&!options.md_only&&!options.include_comments&&!options.video_only&&!options.include_videos&&options.include_images!==false;
}
async function publicPinPayload(tabId,url,options) {
  if(!publicPinEligible(url,options))throw new Error('此采集内容需要等待网页加载');
  const id=value=>new URL(value).pathname.match(/^\/pin\/(\d+)\/?$/)?.[1],expected=new URL(url);
  const unchanged=async()=>{const tab=await chrome.tabs.get(tabId),current=new URL(/^https?:/.test(tab.url||'')?tab.url:tab.pendingUrl);if(current.origin!==expected.origin||id(current.href)!==id(url))throw new Error('页面已切换，未保存其他 Pin 的图片');};
  await controlPoint();await unchanged();
  const result=await service('/media/resolve-post',{url:expected.origin+expected.pathname});
  await controlPoint();await unchanged();
  if(result.platform!=='pinterest'||new URL(result.canonical_url).origin!==expected.origin||id(result.canonical_url)!==id(url))throw new Error('公开原图与当前 Pin 身份不匹配');
  if(!['verified_pin_image','verified_story_images'].includes(result.scope)||!result.images?.length)throw new Error('未确认当前 Pin 的完整静态图片，已停止保存');
  return {...result,body_text:'',has_video:false,_media:[],collection_mode:'images',include_images:true,ocr_enabled:Boolean(options.ocr_enabled),extraction_warnings:[]};
}

return {tabReady,inject,boundedRead,pagePayload,readPagePayload,expandCommentReplies,readXReplies,loadedMedia,setMediaQuality,loadedPageMedia,includeProtectedImages,huabanBoardPayload,huabanListPayload,publicPinEligible,publicPinPayload,readExpandedReplies};
 }
 globalThis.CollectorPageReader={create};
 if(typeof module!=='undefined')module.exports={create};
})();
