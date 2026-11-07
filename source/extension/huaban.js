// Exact Pin data only; recommendation records never inherit the current Pin ID.
(() => {
 function extract(url, doc=document, state=globalThis) {
  const u=new URL(url),id=u.pathname.match(/^\/pins\/(\d+)\/?$/)?.[1];
  if(!/(^|\.)huaban\.com$/.test(u.hostname)||!id)throw new Error('请打开花瓣采集详情页');
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
          body_text:String(value.raw_text||''),author_name:value.user?.username||null,images:[{url:image.href,alt:''}],
          has_video:false,_media:[],extraction_warnings:[],comments:[],comments_status:'尚未读取评论'};
      }catch(_){}
    }
    for(const child of Object.values(value).slice(0,500))if(child&&typeof child==='object')stack.push(child);
  }
  return null;
 }
 globalThis.CollectorHuaban={extract};
 if(typeof module!=='undefined')module.exports={extract};
})();
