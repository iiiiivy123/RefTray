// Profile grids only. Detail ownership is verified again before saving.
(() => {
  const url=new URL(location.href);
  const match=url.pathname.match(/^\/([\w.]{1,30})(?:\/(reels))?\/?$/);
  if(!/(^|\.)instagram\.com$/.test(url.hostname) || !match || /^(accounts|explore|direct|stories|p|reel|reels|about|developer|legal|challenge)$/i.test(match[1]))return {error:'请打开 Instagram 作者主页的帖子或 Reels 列表。'};
  if(document.querySelector('[role="dialog"] article'))return {error:'请先关闭帖子详情，回到 Instagram 作者主页后开始批量。'};
  const main=document.querySelector('main');
  if(!main || !main.querySelector('header'))return {error:'作者主页尚未加载或需要登录，未开始保存。'};
  const urls=new Map();
  for(const link of main.querySelectorAll('a[href]')) {
    if(link.closest('header,aside,[role="dialog"]'))continue;
    const post=new URL(link.href,url.href), id=post.pathname.match(/^\/(?:([\w.]+)\/)?(p|reels?)\/([\w-]{5,30})\/?$/);
    if(/(^|\.)instagram\.com$/.test(post.hostname) && id && (!id[1]||id[1].toLowerCase()===match[1].toLowerCase()))urls.set(id[3],`https://www.instagram.com/${id[2]==='p'?'p':'reel'}/${id[3]}/`);
  }
  const handle=match[1].toLowerCase();
  return {author_url:`https://www.instagram.com/${handle}`,author_name:`@${handle}`,handle,view:match[2]||'posts',urls:[...urls.values()]};
})();
