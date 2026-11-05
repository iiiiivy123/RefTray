// Only the profile owner's timestamp links; excludes quoted posts and reposts.
(() => {
  const url = new URL(location.href);
  const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
  if (!/(^|\.)(x\.com|twitter\.com)$/.test(url.hostname) || !match || /^(home|explore|search|notifications|messages|i|settings|compose)$/i.test(match[1])) return {error:'请打开 X 作者主页的帖子页，再开始批量采集。'};
  const handle = match[1];
  const urls = new Set();
  for (const article of document.querySelectorAll('article')) {
    if (article.querySelector('[data-testid="placementTracking"]')) continue;
    for (const link of article.querySelectorAll('a[href]')) {
      if (link.closest('article') !== article || link.closest('[data-testid="quoteTweet"]')) continue;
      const timestamp = link.querySelector('time') || (!article.hasAttribute('data-testid') && link.hasAttribute('data-base-ui-tooltip-trigger') && /^\/\w+\/status\/\d+\/?$/.test(link.pathname));
      if (!timestamp) continue;
      const post = new URL(link.href, url.href);
      const id = post.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/);
      if (/(^|\.)(x\.com|twitter\.com)$/.test(post.hostname) && id && id[1].toLowerCase() === handle.toLowerCase()) urls.add(`https://x.com/${handle}/status/${id[2]}`);
      break; // First timestamp is the outer post, never an embedded quote.
    }
  }
  const name = document.querySelector('[data-testid="primaryColumn"] [data-testid="UserName"]')?.innerText?.split('\n')[0]?.trim();
  return {author_url:`https://x.com/${handle.toLowerCase()}`, author_name:name ? `${name} (@${handle})` : `@${handle}`, urls:[...urls]};
})();
