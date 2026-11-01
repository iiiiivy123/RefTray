// Current artwork only; no profile/recommendation crawling or private API requests.
(() => {
  function extract(url, doc=document) {
    const u=new URL(url),id=u.pathname.match(/^\/artwork\/([a-zA-Z0-9]+)\/?$/)?.[1];
    if(!/(^|\.)artstation\.com$/.test(u.hostname)||!id)throw new Error('请打开一篇 ArtStation 作品详情');
    const canonical=`https://www.artstation.com/artwork/${id}`;
    const clean=node=>(node?.innerText||node?.textContent||'').trim();
    const meta=name=>doc.querySelector(`meta[property="${name}"]`)?.content||'';
    const seen=new Set(),images=[];
    const add=(value,alt='')=>{try{const image=new URL(value,url);if(image.protocol!=='https:'||!/(^|\.)artstation\.com$/.test(image.hostname)||!image.pathname.includes('/assets/images/images/')||seen.has(image.href))return;seen.add(image.href);images.push({url:image.href,alt});}catch(_){}};
    // Prefer artwork containers; never use all images from the page body.
    const roots=[...doc.querySelectorAll('.project-assets,.project-assets-container,[data-project-assets],.artwork-assets')];
    for(const root of roots)for(const img of root.querySelectorAll('img')){
      const candidates=(img.getAttribute('data-srcset')||img.srcset||'').split(',').map(s=>{const [url,size]=s.trim().split(/\s+/);return {url,size:parseFloat(size)||0};}).sort((a,b)=>b.size-a.size);
      add(candidates[0]?.url||img.getAttribute('data-src')||img.currentSrc||img.src,img.alt||'');
    }
    let bodyRoot=doc.querySelector('.project-description,.artwork-description,[data-project-description]'),sourceMethod='dom';
    let title=clean(doc.querySelector('.project-title,.artwork-title,[data-project-title]')),body=clean(bodyRoot),author=clean(doc.querySelector('.project-author-name,.project-author .name,[data-project-author]'));
    // JSON already present in the page must carry the exact artwork hash.
    let nodes=0;
    function visit(value,depth=0){
      if(!value||typeof value!=='object'||depth>18||++nodes>15000)return;
      if(String(value.hash_id||'')===id&&Array.isArray(value.assets)){
        title=value.title||title;author=value.user?.full_name||value.user?.username||author;
        if(value.description){const div=doc.createElement('div');div.innerHTML=value.description;for(const node of div.querySelectorAll('script,style,noscript,template,iframe,object,embed'))node.remove();body=clean(div);bodyRoot=div;sourceMethod='loaded_state';}
        images.length=0;seen.clear();
        for(const a of value.assets)if(a.has_image&&!a.has_embedded_player)add(a.image_url,a.title||'');
        return;
      }
      for(const child of Object.values(value))visit(child,depth+1);
    }
    for(const script of doc.querySelectorAll('script[type="application/json"],script[type="application/ld+json"]')){
      if(script.textContent.length>8*1048576)continue;
      try{visit(JSON.parse(script.textContent));}catch(_){}
    }
    let matching=false;try{matching=new URL(meta('og:url')).pathname.replace(/\/$/,'')===u.pathname.replace(/\/$/,'');}catch(_){}
    const warnings=[];
    if(!images.length&&matching){add(meta('og:image'));if(images.length)warnings.push('仅取得作品分享图，尚未确认作品全部图片');}
    if(!images.length&&!body)throw new Error('ArtStation 作品正文尚未加载或布局未识别；未保存推荐图片');
    warnings.push('仅保存当前作品已加载图片；未加载图片及嵌入视频、3D预览不包含在内。');
    const document_source=globalThis.CollectorDocumentSource?.extract(bodyRoot,{url:canonical,rootLabel:'artwork description',method:sourceMethod});
    warnings.push(...(document_source?.warnings||['正文结构提取器未加载，已保留纯文字。']));
    return {canonical_url:canonical,platform:'artstation',page_title:title||(matching?meta('og:title'):'')||doc.title,author_name:author||null,body_text:body.slice(0,100000),document_source,images,extraction_warnings:warnings,has_video:false,_media:[]};
  }
  globalThis.CollectorArtstation={extract};
  if(typeof module!=='undefined')module.exports={extract};
})();
