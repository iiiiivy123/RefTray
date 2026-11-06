/* Read only loaded main-content DOM; never resolve or download media here. */
(() => {
 const u=new URL(location.href),host=u.hostname;
 let root=document.querySelector('main article,article,[role="main"]')||document.querySelector('main');
 if(/(^|\.)(x\.com|twitter\.com)$/.test(host)){
  const id=u.pathname.match(/\/status\/(\d+)/)?.[1];
  if(!id)return {url:location.href,state:'unknown',reason:'请打开具体帖子后识别'};
  root=[...document.querySelectorAll('article[data-testid="tweet"]')].find(a=>a.querySelector('a[href*="/status/"] time')?.closest('a')?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1]===id);
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
 if(/(^|\.)(youtube\.com|youtu\.be)$/.test(host)){
  const target=host==='youtu.be'?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/shorts\/([\w-]{11})\/?$/)?.[1];
  const player=document.querySelector('#movie_player video');
  const id=document.querySelector('meta[itemprop="videoId"]')?.content;
  if(!target||id!==target||!player)return {url:u.href,state:'unknown',reason:'尚未确认当前视频播放器'};
  return {url:u.href,state:'ready',videos:1,kind:'video'};
 }
 try{
  const payload=/(^|\.)artstation\.com$/.test(host)?CollectorArtstation.extract(u.href):InspirationPlatforms.extract({collection_mode:'images'});
  if(payload.pinterest_motion)return {url:u.href,state:'unknown',reason:'已识别动态内容，尚未确认正文媒体类型'};
  const images=payload.images||[];
  if(!images.length&&!payload.has_video)return {url:u.href,state:'unknown',reason:'尚未确认已加载的正文媒体'};
  const gifs=images.filter(item=>/\.gif(?:[?#]|$)/i.test(item.url)).length;
  return {url:u.href,state:'ready',images:images.length-gifs,gifs:gifs||undefined,kind:images.length?'images':payload.has_video?'video':null};
 }catch(error){return {url:u.href,state:'unknown',reason:error.message};}
})();
