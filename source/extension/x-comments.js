// MAIN world, read-only: only rendered replies with an explicit parent status ID.
(() => {
  const target = location.pathname.match(/\/status\/(\d+)/)?.[1];
  const empty = reason => ({postId:target,comments:[],status:reason});
  if (!target || !/(^|\.)(x\.com|twitter\.com)$/.test(location.hostname)) return empty('未读取：当前不是 X 帖子详情');
  const rendered = new Map(), stack = [];
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const link = [...article.querySelectorAll('a[href]')].find(a => a.closest('article')===article && a.querySelector('time') && !a.closest('[data-testid="quoteTweet"]'));
    const id = link?.href.match(/\/status\/(\d+)/)?.[1];
    if (!id || id === target) continue;
    rendered.set(id, article);
    // React properties are only read here in the page world; no hooks or requests.
    for (const key of Object.keys(article)) {
      if (key.startsWith('__reactProps$')) stack.push({value:article[key],depth:0});
      if (key.startsWith('__reactFiber$')) {
        let fiber = article[key];
        for (let i=0;fiber && i<30;i++,fiber=fiber.return) stack.push({value:fiber.memoizedProps,depth:0});
      }
    }
  }
  let bytes=0;
  for (const script of document.querySelectorAll('script[type="application/json"]')) {
    const body=script.textContent||''; bytes+=body.length;
    if(bytes>4000000)break;
    try {stack.push({value:JSON.parse(body),depth:0});} catch (_) {}
  }
  const seen=new WeakSet(), comments=new Map();let visits=0;
  while(stack.length && visits++<15000 && comments.size<100) {
    const {value,depth}=stack.pop();
    if(!value || typeof value!=='object' || seen.has(value) || depth>18)continue;
    seen.add(value);
    const legacy=value.legacy || value;
    const id=String(value.rest_id || value.id_str || value.id || '');
    const parent=String(legacy.in_reply_to_status_id_str || value.in_reply_to_status_id_str || value.inReplyToStatusIdStr || value.inReplyToStatusId || '');
    if(rendered.has(id) && parent===target) {
      const article=rendered.get(id);
      const content=value.note_tweet?.note_tweet_results?.result?.text || legacy.full_text || value.fullText || article.querySelector('[data-testid="tweetText"]')?.innerText || '';
      const user=value.core?.user_results?.result;
      const author=user?.legacy?.screen_name || user?.core?.screen_name || article.querySelector('[data-testid="User-Name"]')?.innerText || null;
      const images=[...article.querySelectorAll('[data-testid="tweetPhoto"] img')].filter(img=>img.closest('article')===article&&!img.closest('[data-testid="quoteTweet"],[data-testid="videoPlayer"],[data-testid="videoComponent"]')).map(img=>img.currentSrc||img.src).filter(url=>/^https:\/\/pbs\.twimg\.com\/media\//.test(url));
      const originals=images.map(source=>{
        const url=new URL(source);
        if(/^(jpg|jpeg|png)$/i.test(url.searchParams.get('format')||''))url.searchParams.set('name','orig');
        return url.href;
      });
      const record=globalThis.XEagleMedia?.tweetRecord(value);
      const gifs=record?.tweetId===id ? record.media.filter(item=>item.kind==='gif').map(item=>item.url) : [];
      if(String(content).trim()||images.length||gifs.length)comments.set(id,{id,url:linkFor(id),text:String(content).trim().slice(0,10000),author:author?String(author).slice(0,1000):null,images:[...new Set(originals)],gifs:[...new Set(gifs)]});
    }
    for(const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value)).slice(0,300)) {
      if(['return','alternate','stateNode','_owner','ownerDocument','parentNode'].includes(key))continue;
      const child=descriptor.value;
      if(child && typeof child==='object')stack.push({value:child,depth:depth+1});
    }
  }
  function linkFor(id){return 'https://x.com/i/status/'+id;}
  const ordered=[...rendered.keys()].filter(id=>comments.has(id)).map(id=>comments.get(id));
  return {postId:target,comments:ordered,status:ordered.length ? `已读取 ${ordered.length} 条已加载直接回复（不含未确认归属或嵌套回复）` : '未确认到已加载的直接回复：可能未加载、没有回复或页面结构不匹配'};
})();
