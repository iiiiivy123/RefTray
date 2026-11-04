/* Pinterest source identity only: no image similarity or guessed original URLs. */
(() => {
  const hostIs = (host, domain) => host === domain || host.endsWith('.' + domain);
  function pinId(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || !(hostIs(u.hostname, 'pinterest.com') || hostIs(u.hostname, 'pinterest.cn'))) return '';
      return u.pathname.match(/^\/pin\/(\d+)(?:\/visual-search)?\/?$/)?.[1] || '';
    } catch (_) { return ''; }
  }
  function canonicalUrl(value) {
    const id = pinId(value);
    return id ? new URL('/pin/' + id + '/', value).href : '';
  }
  function resolvePage(doc, value) {
    const direct = canonicalUrl(value);
    if (direct) return {id: pinId(direct), url: direct, visual: /\/visual-search\/?$/.test(new URL(value).pathname)};
    let u; try { u = new URL(value); } catch (_) { return null; }
    if (u.protocol !== 'https:' || !(hostIs(u.hostname, 'pinterest.com') || hostIs(u.hostname, 'pinterest.cn')) || !/^\/visual-search\/?$/.test(u.pathname)) return null;
    // Only page-level canonical metadata can identify the original Pin here.
    // Query parameters, arbitrary Pin links and recommendation state are not proof.
    const values = [...doc.querySelectorAll('link[rel="canonical"],meta[property="og:url"]')]
      .map(node => node.href || node.content || '').filter(Boolean);
    const ids = values.map(pinId);
    if (!ids.length || ids.some(id => !id || id !== ids[0])) return null;
    return {id: ids[0], url: canonicalUrl(values[0]), visual: true};
  }
  function sourceKey(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || !hostIs(u.hostname, 'pinimg.com')) return value;
      const m = u.pathname.match(/^\/(?:originals|\d+x(?:\d+)?(?:_RS)?)\/([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]{32})\.(?:jpe?g|png|webp)$/i);
      if (!m || !m[4].toLowerCase().startsWith((m[1] + m[2] + m[3]).toLowerCase())) return value;
      return 'pinimg:' + m[4].toLowerCase();
    } catch (_) { return value; }
  }
  function rank(item) {
    try {
      const path = new URL(item.url).pathname;
      if (/^\/originals\//.test(path)) return Infinity;
      return Number(item.width) || Number(path.match(/^\/(\d+)x/)?.[1]) || 0;
    } catch (_) { return 0; }
  }
  function mergeImages(items) {
    const unique = new Map();
    for (const item of items) {
      const key = sourceKey(item.url), previous = unique.get(key);
      if (!previous || rank(item) > rank(previous)) unique.set(key, item);
    }
    return [...unique.values()].map(({url, alt}) => ({url, alt: alt || ''}));
  }
  const api = {pinId, canonicalUrl, resolvePage, sourceKey, mergeImages};
  globalThis.CollectorPinterest = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
