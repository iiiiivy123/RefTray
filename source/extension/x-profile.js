// Only the profile owner's timestamp links; excludes quoted posts and reposts.
(() => {
  const url = new URL(location.href);
  const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
  if (!/(^|\.)(x\.com|twitter\.com)$/.test(url.hostname) || !match || /^(home|explore|search|notifications|messages|i|settings|compose)$/i.test(match[1])) return {error:'请打开 X 作者主页的帖子页，再开始批量采集。'};
  const handle = match[1];
  const urls = new Set();
  const titles = {};
  for (const article of document.querySelectorAll('article')) {
    // X also wraps ordinary videos in placementTracking. Only a media-only
    // wrapper is allowed; full-post placements and explicit ads stay excluded.
    const placements = [...article.querySelectorAll('[data-testid="placementTracking"]')];
    if (article.querySelector('[data-testid="promotedIndicator"]') || placements.some(node =>
      !node.querySelector('[data-testid="videoPlayer"]') || node.querySelector('time,[data-testid="User-Name"]'))) continue;
    for (const link of article.querySelectorAll('a[href]')) {
      if (link.closest('article') !== article || link.closest('[data-testid="quoteTweet"]')) continue;
      const timestamp = link.querySelector('time') || (!article.hasAttribute('data-testid') && link.hasAttribute('data-base-ui-tooltip-trigger') && /^\/\w+\/status\/\d+\/?$/.test(link.pathname));
      if (!timestamp) continue;
      const post = new URL(link.href, url.href);
      const id = post.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/);
      if (/(^|\.)(x\.com|twitter\.com)$/.test(post.hostname) && id && id[1].toLowerCase() === handle.toLowerCase()) {
        const canonical=`https://x.com/${handle}/status/${id[2]}`;
        urls.add(canonical);
        const caption=[...article.querySelectorAll('[data-testid="tweetText"]')].find(node=>node.closest('article')===article&&!node.closest('[data-testid="quoteTweet"]'));
        titles[canonical]=caption?.innerText?.trim().slice(0,100)||`@${handle} · ${id[2]}`;
      }
      break; // First timestamp is the outer post, never an embedded quote.
    }
  }
  const name = document.querySelector('[data-testid="primaryColumn"] [data-testid="UserName"]')?.innerText?.split('\n')[0]?.trim();
  const scroller = document.scrollingElement;
  return {author_url:`https://x.com/${handle.toLowerCase()}`, author_name:name ? `${name} (@${handle})` : `@${handle}`, urls:[...urls], titles,
    list_visible:document.visibilityState!=='hidden',
    list_at_end:scroller ? scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-4 : null,
    list_loading:Boolean(document.querySelector('[data-testid="primaryColumn"] [role="progressbar"]'))};
})();
