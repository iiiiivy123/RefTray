/* Read only loaded main-content DOM; never resolve or download media here. */
(() => {
 const u=new URL(location.href),host=u.hostname;
 let root=document.querySelector('main article,article,[role="main"]')||document.querySelector('main');
 if(/(^|\.)(x\.com|twitter\.com)$/.test(host)){
  const id=u.pathname.match(/\/status\/(\d+)/)?.[1];root=[...document.querySelectorAll('article')].find(a=>[...a.querySelectorAll('a[href]')].some(l=>l.pathname.match(/\/status\/(\d+)/)?.[1]===id));
 }
 if(/pinterest\./.test(host))root=document.querySelector('[data-test-id="pin-closeup"],[data-test-id="closeup"]');
 if(!root)return {url:location.href,state:'unknown',reason:'尚未确认当前作品正文'};
 const images=new Set([...root.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>0&&!i.closest('nav,aside,header,[data-testid="UserAvatar-Container"]')).map(i=>i.currentSrc||i.src).filter(Boolean));
 const videos=[...root.querySelectorAll('video')].filter(v=>v.currentSrc||v.src||v.querySelector('source'));
 const text=root.innerText?.trim();return {url:location.href,state:images.size||videos.length||text?'ready':'loading',images:images.size,videos:videos.length,kind:videos.length&&!images.size?'video':images.size?'images':text?'plain':null};
})();
