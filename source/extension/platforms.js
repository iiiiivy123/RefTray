/* Single-post, DOM-only adapters. No private API calls, cookie exports or auto paging. */
(() => {
  const hostIs = (host, domain) => host === domain || host.endsWith('.' + domain);
  function platform(host) {
    if (hostIs(host, 'bilibili.com')) return 'bilibili';
    if (hostIs(host, 'xiaohongshu.com')) return 'xhs';
    if (hostIs(host, 'instagram.com')) return 'instagram';
    if (hostIs(host, 'x.com') || hostIs(host, 'twitter.com')) return 'x';
    if (hostIs(host, 'pinterest.com') || hostIs(host, 'pinterest.cn')) return 'pinterest';
    if (hostIs(host, 'huaban.com')) return 'huaban';
    if (hostIs(host, 'weibo.com') || hostIs(host, 'weibo.cn')) return 'weibo';
    return 'generic';
  }
  const configs = {
    xhs: {post: /\/(explore|discovery\/item)\/[a-f0-9]{24}|\/user\/profile\/[a-f0-9]{24}\/[a-f0-9]{24}/i,
      root: '.note-detail-mask,.note-container', gallery: '.media-container,.swiper',
      body: '#detail-desc .note-text,#detail-desc,.note-content .desc', author: '.author-container .username,.author-wrapper .name', comments: '.comment-item', commentBody: '.content,.note-text', time: '.publish-date,time'},
    x: {post: /\/status\/\d+/, root: 'article[data-testid="tweet"]', gallery: '[data-testid="tweetPhoto"]',
      body: '[data-testid="tweetText"]', author: '[data-testid="User-Name"]', comments: '', time: 'time'},
    instagram: {post: /^\/(?:[\w.]+\/)?(p|reel|reels)\/[\w-]+/, root: '[role="dialog"] article,main article,article', gallery: '',
      body: 'h1', author: 'header a', comments: 'ul ul li', commentBody: 'span[dir="auto"]', time: 'time'},
    pinterest: {post: /^\/pin\/\d+/, root: '[data-test-id="pin-closeup-container"],[data-test-id="pin-closeup"]', gallery: '[data-test-id="pin-closeup-image"], [data-test-id="pin-image"]',
      body: '[data-test-id="pin-description"],h1', author: '[data-test-id="creator-profile-name"]', comments: '[data-test-id="comment-item"]', commentBody: '[data-test-id="comment-text"]', time: 'time'},
    huaban: {post: /^\/pins\/\d+/, root: '#pin_view,.pin-view,[class*="PinDetail"],[class*="pin-detail"]', gallery: '.main-image,[class*="mainImage"],[class*="image-view"]',
      body: '.description,[class*="description"],h1', author: '.author [class*="name"]', comments: '.comment-item', commentBody: '.content', time: 'time'},
    weibo: {post: /^\/(?:detail\/\d+|status\/[\w]+|\d+\/[A-Za-z0-9]+)\/?$/,
      root: 'article,[class*="Feed_wrap"],.card-wrap', gallery: '[class*="woo-picture"],[class*="picture"],.media-piclist',
      body: '[class*="detail_wbtext"],.weibo-text,.txt', author: '[class*="head_name"],.name', comments: '[class*="CommentItem_wrap"],.comment-item', commentBody: '[class*="text"],.content', time: 'time,[class*="head_info"]'},
    generic: {root: 'article,main,[role="main"]', body: '', author: '[rel="author"],.author', comments: '', time: 'time'}
  };
  function imageUrl(img, kind) {
    // Choose the largest advertised candidate; retain signed query strings.
    const candidates = (img.getAttribute?.('data-srcset') || img.srcset || '').split(',').map(part => {
      const [url, size] = part.trim().split(/\s+/); return {url, size: parseFloat(size) || 0};
    }).filter(item => item.url && !/^(data|javascript|blob):/i.test(item.url)).sort((a, b) => b.size - a.size);
    let value = candidates[0]?.url || img.getAttribute?.('data-src') || img.getAttribute?.('data-original') || img.currentSrc || img.src || '';
    try {
      const url = new URL(value, globalThis.location?.href);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      if (kind === 'x' && url.hostname === 'pbs.twimg.com' && url.pathname.startsWith('/media/')) url.searchParams.set('name', 'orig');
      return url.href;
    } catch (_) { return ''; }
  }
  const pinterest = globalThis.CollectorPinterest || (typeof require === 'function' ? require('./pinterest-identity.js') : null);
  const pinterestGuidance = '请打开原 Pin 详情页后再采集；视觉搜索的相似结果和推荐图不会保存。';
  function pinterestImages(doc, pageUrl) {
    const identity = pinterest?.resolvePage(doc, pageUrl);
    const pinId = identity?.id;
    if (!pinId) return {images: [], inferred: false, guidance: pinterestGuidance};
    const eligible = img => {
      try {
        const url = new URL(imageUrl(img, 'pinterest'));
        if (!hostIs(url.hostname, 'pinimg.com') || /avatar|profile|75x75|30x30/.test(url.pathname)) return false;
        const link = img.closest('a[href]');
        const linkedId = link && pinterest.pinId(new URL(link.href, pageUrl).href);
        if (img.closest('[data-test-id="related-pins"],[data-test-id="more-ideas"],[data-test-id="promoted-pin"],[data-test-id="visual-search-results"],[data-test-id="masonry-container"],[role="listitem"]')) return false;
        return (!linkedId || linkedId === pinId) && Math.max(img.naturalWidth || 0, img.width || 0) >= 180;
      } catch (_) { return false; }
    };
    const toImages = nodes => pinterest.mergeImages(nodes.filter(eligible).flatMap(img => {
      const srcsets = [img.getAttribute?.('data-srcset'), img.srcset].filter(Boolean);
      const candidates = srcsets.flatMap(set => set.split(',').map(part => {
        const [url, descriptor] = part.trim().split(/\s+/);
        return {url, width: descriptor?.endsWith('w') ? parseFloat(descriptor) : 0};
      }));
      for (const url of [img.getAttribute?.('data-original'), img.getAttribute?.('data-src'), img.currentSrc, img.src]) if (url) candidates.push({url});
      return candidates.flatMap(item => {
        try {
          const url = new URL(item.url, pageUrl);
          return url.protocol === 'https:' && hostIs(url.hostname, 'pinimg.com') && !/avatar|profile|75x75|30x30/.test(url.pathname)
            ? [{...item, url: url.href, alt: img.alt || ''}] : [];
        } catch (_) { return []; }
      });
    }));
    // A marker can be the image itself, not necessarily a wrapper containing img.
    const marked = [...doc.querySelectorAll('[data-test-id="pin-closeup-image"],[data-test-id="closeup-image"],[data-test-id="pin-closeup-image-container"]')];
    const explicit = toImages(marked.flatMap(node => node.tagName === 'IMG' ? [node] : [...node.querySelectorAll('img')]));
    if (explicit.length) return {images: explicit, inferred: false};
    // Background tabs can have loaded Pin data before rendering their lazy image.
    // Read only this exact Pin's own image variants, never a recursive image list.
    const stack = [];
    let bytes = 0, visits = 0;
    for (const node of doc.querySelectorAll('script[type="application/json"]')) {
      const body = node.textContent || '';
      bytes += body.length;
      if (bytes > 4000000) break;
      try { stack.push(JSON.parse(body)); } catch (_) {}
    }
    while (stack.length && visits++ < 5000) {
      const value = stack.pop();
      if (!value || typeof value !== 'object') continue;
      if (String(value.id || '') === pinId && value.images && typeof value.images === 'object') {
        // These images can be video/story covers. This photo-only fallback has no
        // verified motion source, so neither it nor OG may report a saved photo.
        if (value.videos || value.video_list || value.story_pin_data || value.is_video || value.is_animated) {
          return {images: [], inferred: false, blockedStateMedia: true};
        }
        const variants = Object.values(value.images).filter(item => {
          try {
            const url = new URL(item?.url);
            return url.protocol === 'https:' && hostIs(url.hostname, 'pinimg.com') &&
              !/avatar|profile|75x75|30x30/.test(url.pathname) && Number(item.width) >= 180 && Number(item.height) > 0;
          } catch (_) { return false; }
        }).sort((a, b) => Number(b.width) * Number(b.height) - Number(a.width) * Number(a.height));
        if (variants.length) return {images: [{url: variants[0].url, alt: ''}], inferred: false, fromState: true};
      }
      for (const child of Object.values(value).slice(0, 500)) if (child && typeof child === 'object') stack.push(child);
    }
    if (identity.visual) return {images: [], inferred: false, guidance: pinterestGuidance};
    // Fallback for product/detail layouts: select only a clearly dominant visible image.
    // Never dump all page images; ties or scrolling into recommendations return no guess.
    const candidates = [...doc.querySelectorAll('img')].filter(eligible).filter(img => !img.closest('[data-test-id="pin"],[data-test-id="related-pins"],[data-test-id="masonry-container"],[role="listitem"]'))
      .map(img => ({img, rect: img.getBoundingClientRect(), style: getComputedStyle(img)}))
      .filter(({rect, style}) => rect.width >= 300 && rect.height >= 350 && rect.top >= -80 && rect.top < innerHeight * .5 && rect.bottom > 0 && style.display !== 'none' && style.visibility !== 'hidden')
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    if (!candidates.length) return {images: [], inferred: false};
    const area = item => item.rect.width * item.rect.height;
    if (candidates[1] && area(candidates[0]) < area(candidates[1]) * 1.8) return {images: [], inferred: false};
    return {images: toImages([candidates[0].img]), inferred: true};
  }
  function extract(options = {}) {
    const kind = platform(location.hostname), cfg = configs[kind];
    if(kind==='bilibili')throw new Error('B站必须通过专用稿件提取器读取，不采集整页广告或推荐图');
    const pinterestPage = kind === 'pinterest' ? pinterest?.resolvePage(document, location.href) : null;
    if (kind === 'pinterest' && !pinterestPage) throw new Error(pinterestGuidance);
    if (kind !== 'pinterest' && cfg.post && !cfg.post.test(location.pathname)) throw new Error('请单独打开一篇帖子再采集；当前是主页或列表，未保存推荐图。');
    const visible = node => node.getBoundingClientRect().width > 0 && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden';
    let roots = [...document.querySelectorAll(cfg.root)].filter(visible);
    if (kind === 'x') {
      const id = location.pathname.match(/\/status\/(\d+)/)?.[1];
      roots = roots.filter(node => [...node.querySelectorAll('a[href]')].some(a => a.querySelector('time') && new URL(a.href).pathname.endsWith('/status/' + id)));
    }
    // Nested wrappers are one post; unrelated multiple roots are not.
    roots = roots.filter(node => !roots.some(other => other !== node && other.contains(node)));
    let root = roots.length === 1 ? roots[0] : null;
    if(kind==='generic')root=document.querySelector('#mw-content-text .mw-parser-output,#mw-content-text,.mw-parser-output')||root||document.body;
    const warnings = [];
    if (!root && kind !== 'pinterest') warnings.push('未定位到单帖正文区域，仅读取本页明确的分享元数据；不会抓取推荐流。');
    const text = node => (node?.innerText || node?.textContent || '').trim().slice(0, 100000);
    const first = selector => selector && root ? root.querySelector(selector) : null;
    const meta = key => document.querySelector(`meta[property="${key}"]`)?.content || '';
    const images = [], seen = new Set();
    let blockedPinterestStateMedia = false;
    const add = (url, alt = '') => {
      if (!/^https?:\/\//.test(url) || seen.has(url)) return;
      seen.add(url); images.push({url, alt});
    };
    if (kind === 'pinterest') {
      const found = pinterestImages(document, location.href);
      blockedPinterestStateMedia = Boolean(found.blockedStateMedia);
      if (found.guidance) warnings.push(found.guidance);
      if (blockedPinterestStateMedia) warnings.push('当前 Pin 页面数据包含视频、动图或故事标记，未将封面当作静态图片保存；请等待正文媒体加载。');
      found.images.forEach(item => add(item.url, item.alt));
      if (found.fromState) warnings.push('图片来自与当前 Pin 编号匹配的已加载页面数据。');
      if (found.inferred) warnings.push('本页使用商品详情布局，按显著主图定位，仅保存这一张；请核对结果。');
    }
    if (root && kind !== 'pinterest') {
      const galleries = cfg.gallery ? [...root.querySelectorAll(cfg.gallery)] : [root];
      const nodes = [...new Set(galleries.flatMap(node => node.tagName === 'IMG' ? [node] : [...node.querySelectorAll('img')]))];
      for (const img of nodes) {
        if (img.closest('.comment-item,header,[data-testid="User-Name"],[data-testid="quoteTweet"]') || kind==='instagram'&&img.closest('ul ul li')) continue;
        if(kind==='generic'&&img.closest('nav,footer,aside,[role="banner"],[data-ad],[data-ad-slot],.advertisement,.ad-container,.ad-slot,.adsbygoogle,[id^="google_ads"],[id^="ad-"],[class*="ad-slot"],.mw-editsection,.navbox'))continue;
        const url = imageUrl(img, kind);
        if(kind==='generic'&&/(^|\.)wiki\.gg$/.test(location.hostname)&&/\/Spoiler\.png(?:\/|[?#]|$)/i.test(url)){
          const warning='已跳过剧透占位图；请在网页显示实际图片后再保存。';if(!warnings.includes(warning))warnings.push(warning);continue;
        }
        if (/avatar|profile_images|emoji|sticker|qrcode/i.test(url)) continue;
        const wikiAsset=kind==='generic'&&/(^|\.)(wiki\.gg|stardewvalleywiki\.com)$/.test(location.hostname)&&Boolean(img.closest('a[href*="File:"],a.image,a.mw-file-description'))&&/\/images\//.test(new URL(url,location.href).pathname);
        if (!wikiAsset && Math.max(img.naturalWidth || 0, img.width || 0) < (kind==='generic'?48:180)) continue;
        if(kind==='generic'&&(!visible(img)||/doubleclick\.net|googlesyndication\.com|googleadservices\.com/i.test(url)))continue;
        if (kind === 'instagram' && !/\.(cdninstagram\.com|fbcdn\.net)$/.test(new URL(url || location.href).hostname)) continue;
        add(url, img.alt || '');
      }
    }
    // Only use OG on a confirmed post route and when the metadata URL matches this post.
    const ogUrl = meta('og:url');
    let matchingMeta = false;
    try { matchingMeta = new URL(ogUrl).pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, ''); } catch (_) {}
    if (kind === 'pinterest') {
      try { matchingMeta = Boolean(pinterestPage && pinterest.pinId(ogUrl) === pinterestPage.id); } catch (_) { matchingMeta = false; }
    }
    if (!images.length && matchingMeta && !blockedPinterestStateMedia && !(root && root.querySelector('video'))) {
      const ogImage = meta('og:image');
      if (kind !== 'pinterest' || (() => { try { const u = new URL(ogImage); return u.protocol === 'https:' && hostIs(u.hostname, 'pinimg.com'); } catch (_) { return false; } })()) add(ogImage);
      if (images.length) warnings.push('仅取得帖子分享图，不能据此确认轮播全部图片已保存。');
    }
    const canonical = new URL(pinterestPage?.url || location.href); canonical.hash = '';
    if (!['xhs','generic'].includes(kind)) canonical.search = '';
    const genericTitle=()=>{const heading=text(document.querySelector('#firstHeading,h1'))||document.title;const site=meta('og:site_name')||location.hostname;return heading.toLowerCase().includes(site.toLowerCase())?heading:site+' · '+heading;};
    const payload = {has_live_photo:kind==='xhs'&&Boolean(root?.querySelector('video.live-video')),canonical_url: canonical.href, page_title: kind==='generic'?genericTitle():text(first('h1,#detail-title'))||document.title,
      images, has_video: Boolean(root?.querySelector('video')), collection_mode: options.collection_mode || 'images', platform: kind, extraction_warnings: warnings};
    if(kind==='instagram' && root) {
      const owner=first('header a[href],h2 a[href]');
      try {
        const u=new URL(owner.href,location.href), name=u.pathname.match(/^\/([\w.]{1,30})\/?$/)?.[1];
        if(hostIs(u.hostname,'instagram.com') && name && !/^(p|reel|reels|explore|accounts)$/i.test(name))payload.author_handle=name.toLowerCase();
      } catch (_) {}
    }
    if (kind !== 'generic') warnings.push('仅采集已加载的正文图片；未加载的轮播请翻页后再次采集，同帖会合并去重。');
    if (payload.collection_mode === 'text') {
      const body = cfg.body ? first(cfg.body) : root;
      payload.body_text = text(body) || (matchingMeta ? meta('og:description') : '');
      if (globalThis.CollectorDocumentSource) {
        payload.document_source = CollectorDocumentSource.extract(body && body !== document.body ? body : null,
          {url: canonical.href, rootLabel: cfg.body || 'article/main/wiki', imageUrl: img => imageUrl(img, kind)});
        warnings.push(...payload.document_source.warnings);
      } else warnings.push('正文结构提取器未加载，已保留纯文字。');
      payload.author_name = text(first(cfg.author)) || null;
      const time = first(cfg.time);
      payload.published_at = time?.getAttribute('datetime') || text(time) || null;
      payload.comments = [];
      payload.comments_requested = options.include_comments === true;
      payload.ocr_enabled = options.ocr_enabled !== false;
      if (payload.comments_requested && cfg.comments && root) {
        const unique = new Set();
        for (const node of root.querySelectorAll(cfg.comments)) {
          const body = text(node.querySelector(kind==='xhs' ? '.content .note-text,.content,.comment-content,.note-text' : cfg.commentBody));
          if (!body || unique.has(body) || payload.comments.length >= 100) continue;
          unique.add(body);
          payload.comments.push({text: body.slice(0, 10000), author: text(node.querySelector('[class*="author"],[class*="name"],a')) || null});
        }
      }
      payload.comments_status = !payload.comments_requested ? '未开启' : payload.comments.length ? `已读取 ${payload.comments.length} 条（仅已加载）` : !cfg.comments ? '当前平台未支持评论' : '未读取到评论（可能未加载、没有评论或页面结构不匹配）';
      if (payload.comments_requested) warnings.push(cfg.comments ? '评论只包含当前已加载且能识别的部分，不代表全部评论。' : '当前站点尚未适配评论提取，没有把其他帖子当成评论。');
      payload.include_images = options.include_images !== false;
      if (!payload.include_images && !payload.ocr_enabled) payload.images = [];
      if (!payload.body_text && !payload.images.length) throw new Error('未识别到正文或正文图片，未保存空文档；请打开帖子详情并展开正文后再试。');
    }
    return payload;
  }
  globalThis.InspirationPlatforms = {platform, imageUrl, extract};
  if (typeof module !== 'undefined') module.exports = {platform, imageUrl, pinterestImages, extract};
})();
