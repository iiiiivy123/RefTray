/* Read only loaded main-content DOM; never resolve or download media here. */
(() => {
 const u=new URL(location.href),host=u.hostname;
 let root=document.querySelector('main article,article,[role="main"]')||document.querySelector('main');
 if(/(^|\.)(x\.com|twitter\.com)$/.test(host)){
  const id=u.pathname.match(/\/status\/(\d+)/)?.[1];root=[...document.querySelectorAll('article[data-testid="tweet"]')].find(a=>a.querySelector('a[href*="/status/"] time')?.closest('a')?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1]===id);
  if(!root)return {url:location.href,state:'unknown',reason:'尚未确认当前帖正文'};
  const images=new Set([...root.querySelectorAll('[data-testid="tweetPhoto"] img')].filter(i=>i.complete&&i.naturalWidth>0&&!i.closest('[data-testid="videoPlayer"],[data-testid="videoComponent"],[data-testid="quoteTweet"]')).map(i=>i.currentSrc||i.src).filter(src=>/^https:\/\/pbs\.twimg\.com\/media\//.test(src)));
  let videos=0,gifs=0;
  for(const video of root.querySelectorAll('video')){
   if(video.closest('[data-testid="quoteTweet"]'))continue;
   const component=video.closest('[data-testid="videoComponent"],[data-testid="videoPlayer"]');
   const gif=component&&[...component.querySelectorAll('span,[aria-label]')].some(n=>/^(GIF|Animated GIF)$/i.test((n.getAttribute('aria-label')||n.textContent||'').trim()));
   if(gif)gifs++;else videos++;
  }
  return {url:location.href,state:images.size||videos||gifs||root.innerText?.trim()?'ready':'loading',images:images.size,gifs,videos,kind:images.size||gifs?'images':videos?'video':'plain'};
 }
 if(/(^|\.)pinterest\.(com|cn)$/.test(host)){
  if(!/^\/pin\/\d+\/?$/.test(u.pathname))return {url:location.href,state:'unknown',reason:'请打开具体 Pin 后识别；画板只扫描链接'};
  const closeups=document.querySelectorAll('[data-test-id="closeup-body-image-container"]');
  root=closeups.length===1?closeups[0]:document.querySelector('[data-test-id="pin-closeup"],[data-test-id="closeup"]');
 }
 if(!root)return {url:location.href,state:'unknown',reason:'尚未确认当前作品正文'};
 const images=new Set([...root.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>0&&!i.closest('nav,aside,header,[data-testid="UserAvatar-Container"]')).map(i=>i.currentSrc||i.src).filter(Boolean));
 const videos=[...root.querySelectorAll('video')].filter(v=>v.currentSrc||v.src||v.querySelector('source'));
 const text=root.innerText?.trim();return {url:location.href,state:images.size||videos.length||text?'ready':'loading',images:images.size,videos:videos.length,kind:videos.length&&!images.size?'video':images.size?'images':text?'plain':null};
})();
