/* Direct SVG documents and explicit SVGLOGO assets only; no page UI icons. */
(() => {
 function extract(options={}) {
  const direct=document.contentType==='image/svg+xml'||/\.svg$/i.test(location.pathname);
  const logo=location.hostname==='svglogo.top'||location.hostname==='www.svglogo.top';
  if(!direct&&!logo)return null;
  const urls=new Map();
  const add=(value,title)=>{try{const u=new URL(value,location.href);if(/^https?:$/.test(u.protocol)&&/\.svg$/i.test(u.pathname)&&!urls.has(u.href))urls.set(u.href,{url:u.href,alt:title||''});}catch{}};
  if(direct)add(location.href,document.title);
  else for(const image of document.querySelectorAll('main img,article img,a[href$=".svg"] img')){
   if(image.closest('header,footer,nav,[data-reftray-float]'))continue;
   add(image.currentSrc||image.src,image.alt);
  }
  if(!urls.size)throw new Error('当前页面尚未显示可直接获取的 SVG，请打开具体 SVG 文件后保存。');
  return {canonical_url:location.href,page_title:direct?decodeURIComponent(location.pathname.split('/').pop()):document.title,
   platform:'generic',collection_mode:options.collection_mode||'images',body_text:direct?'SVG 原文件：'+location.href:'',
   images:[...urls.values()],include_images:options.include_images!==false,md_only:Boolean(options.md_only),ocr_enabled:false,
   extraction_warnings:['SVG 保留原始矢量格式；包含脚本或外部资源的文件会明确拒绝保存。']};
 }
 globalThis.RefTraySvg={extract};
})();
