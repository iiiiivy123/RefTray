// Exact Pin data only; recommendation records never inherit the current Pin ID.
(() => {
 function preferredImage(value) {
   try {
     const url=new URL(value),path=url.pathname.replace(/_fw\d+(?:webp)?$/,'');
     if(url.protocol==='https:'&&!url.username&&!url.password&&/^(?:gd-)?hbimg(?:-edge)?\.huaban\.com$/.test(url.hostname)&&path!==url.pathname&&/^\/[a-f0-9]{40,80}(?:-[A-Za-z0-9]+)?$/i.test(path)){
       url.pathname=path;return url.href;
     }
   }catch(_){}
   return undefined;
 }
 function extract(url, doc=document, state=globalThis) {
  const u=new URL(url),id=u.pathname.match(/^\/pins\/(\d+)\/?$/)?.[1];
  if(!/(^|\.)huaban\.com$/.test(u.hostname)||!id)throw new Error('请打开花瓣采集详情页');
  // Huaban's image viewer replaces the detail tree. Its URL identifies the
  // selected image; accept it only when that same image is actually loaded.
  const modal=u.searchParams.get('modalImg');
  if(modal){
    try{
      const selected=new URL(modal);
      if(selected.protocol==='https:'&&!selected.username&&!selected.password&&/(^|\.)huaban\.com$/.test(selected.hostname)){
        const img=Array.from(doc.querySelectorAll('img[alt="查看图片"]')).find(img=>(img.currentSrc||img.src)===selected.href&&img.complete!==false&&img.naturalWidth>0&&img.naturalHeight>0);
        if(img)return {platform:'huaban',canonical_url:'https://huaban.com/pins/'+id+'/',page_title:doc.title,body_text:'',images:[{url:selected.href,alt:''}],has_video:false,_media:[],extraction_warnings:[],comments:[],comments_status:'尚未读取评论'};
      }
    }catch(_){}
  }
  // Modern detail pages expose the Pin identity on both the container and image.
  // Keep the CDN's signed URL intact; guessing a file-key URL loses its signature.
  const detail=doc.querySelector?.('[data-pin-image-id="'+id+'"]') || doc.querySelector?.('#pin_detail[data-pin-image-id="'+id+'"]') || doc.querySelector?.('#pin_detail:not([data-pin-image-id])') || doc.querySelector?.('#pin_detail');
  if(detail&&(!detail.getAttribute?.('data-pin-image-id')||detail.getAttribute('data-pin-image-id')===id)){
    const images=[];
    for(const img of detail.querySelectorAll('img[data-preview-pin-id="'+id+'"][data-pin-detail="true"]')){
      try{
        const src=new URL(img.currentSrc||img.src);
        if(src.protocol!=='https:'||!/(^|\.)huaban\.com$/.test(src.hostname)||src.username||src.password)continue;
        if(img.complete===false||!img.naturalWidth||!img.naturalHeight)continue;
        if(!images.some(item=>item.url===src.href))images.push({url:src.href,preferred_url:preferredImage(src.href),alt:img.alt||''});
      }catch(_){}
    }
    if(images.length){
      const author=detail.querySelector('a[data-button-name="采集用户"]');
      return {platform:'huaban',canonical_url:'https://huaban.com/pins/'+id+'/',
        page_title:images[0].alt||doc.title,body_text:'',author_name:author?.getAttribute('title')||author?.textContent?.trim()||null,
        images,has_video:false,_media:[],extraction_warnings:[],comments:[],comments_status:'尚未读取评论'};
    }
  }
  const stack=[state.__NEXT_DATA__,state.__INITIAL_STATE__,state.app?.page],seen=new WeakSet();
  let bytes=0,visits=0;
  for(const node of doc.querySelectorAll('script[type="application/json"],script[type="application/ld+json"]')){
    const text=node.textContent||'';bytes+=text.length;if(bytes>4000000)break;
    try{stack.push(JSON.parse(text));}catch(_){}
  }
  while(stack.length&&visits++<8000){
    const value=stack.pop();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);
    if(String(value.pin_id||value.pinId||'')===id&&value.file){
      const file=value.file;
      if(!/^image\/(?:jpeg|png|webp|gif)$/.test(file.type||''))continue;
      let src=file.url;
      if(!src&&/^[a-f\d]{20,80}$/i.test(file.key||''))src='https://hbimg.huaban.com/'+file.key;
      try {
        const image=new URL(src);if(image.protocol!=='https:'||!/(^|\.)(huaban\.com|hbimg\.com)$/.test(image.hostname))continue;
        return {platform:'huaban',canonical_url:'https://huaban.com/pins/'+id+'/',page_title:String(value.raw_text||doc.title).slice(0,200),
          body_text:String(value.raw_text||''),author_name:value.user?.username||null,images:[{url:image.href,preferred_url:preferredImage(image.href),alt:''}],
          has_video:false,_media:[],extraction_warnings:[],comments:[],comments_status:'尚未读取评论'};
      }catch(_){}
    }
    for(const child of Object.values(value).slice(0,500))if(child&&typeof child==='object')stack.push(child);
  }
  return null;
 }
 function cardElement(card,id) {
   // List membership is checked by huaban-list. Current cards use hashed CSS
   // classes, but expose their own Pin identity and image content type.
   if(card.querySelector?.('video,[data-pin-type="video"],[data-content-type="video"]'))return null;
   const matches=[];
   const ordinary=[...card.querySelectorAll('[data-content-id][data-content-type]')].some(node=>node.dataset?.contentId===id&&['普通采集','素材采集'].includes(node.dataset?.contentType)&&node.closest?.('[data-pin-id]')===card);
   const modern=card.dataset?.pinId===id&&(ordinary||card.matches?.('.simple-image-card[data-pin-id]'));
   for(const image of card.querySelectorAll(modern?'img':'img[data-preview-pin-id="'+id+'"]')){
     const marked=image.getAttribute?.('data-preview-pin-id');
     if(marked&&marked!==id||image.complete===false||!image.naturalWidth||!image.naturalHeight)continue;
     if(marked!==id){
       const bounds=image.getBoundingClientRect?.();
       if(!modern||image.closest?.('[data-pin-id]')!==card||!bounds||bounds.width<120||bounds.height<120)continue;
     }
     try{
       const url=new URL(image.currentSrc||image.src);
       if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||! /^(?:gd-)?hbimg(?:-edge)?\.huaban\.com$/.test(url.hostname)||!/^\/(?:small\/)?[a-f0-9]{40,80}(?:-[A-Za-z0-9]+)?(?:_fw\d+(?:webp)?)?$/i.test(url.pathname))continue;
       if(!matches.some(item=>(item.currentSrc||item.src)===url.href))matches.push(image);
     }catch(_){}
   }
   return matches.length===1?matches[0]:null;
 }
 function cardImage(card,id){
   const image=cardElement(card,id);if(!image)return null;
   const url=image.currentSrc||image.src;return {url,preferred_url:preferredImage(url),alt:image.alt||''};
 }
 globalThis.CollectorHuaban={extract,cardImage,cardElement};
 if(typeof module!=='undefined')module.exports={extract,cardImage,cardElement};
})();
