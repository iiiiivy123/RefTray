(() => {
  const VERSION = '0.5.0';
  if (window.__liblibCollectorVersion === VERSION) return;
  if (window.__liblibCollectorInstalled && !window.__liblibCollectorListener) return;
  if (window.__liblibCollectorListener) chrome.runtime.onMessage.removeListener(window.__liblibCollectorListener);
  window.__liblibCollectorInstalled = true;
  window.__liblibCollectorVersion = VERSION;
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const canonicalImage = (url) => url.replace(/[?&](imageView2|x-oss-process|width|height|w|h)=[^&]*/gi, "").replace(/[?&]+$/, "");

  function workLinks() {
    const host = location.hostname.toLowerCase();
    const links = [...document.querySelectorAll("a[href]")].map((anchor) => new URL(anchor.href, location.href).href.split("#")[0]);
    if (host.includes("xiaohongshu.com")) return links.filter((url) => /xiaohongshu\.com\/(explore|discovery\/item)\//i.test(url));
    if (host.includes("pinterest.")) return links.filter((url) => /pinterest\.[^/]+\/pin\/\d+/i.test(url));
    if (host.includes("huaban.com")) return links.filter((url) => /huaban\.com\/pins\/\d+/i.test(url));
    return [];
  }

  function visible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none';
  }

  function noteId(url) {
    const path = new URL(url, location.href).pathname;
    return path.match(/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/i)?.[1]
      || path.match(/^\/user\/profile\/[a-f0-9]{24}\/([a-f0-9]{24})\/?$/i)?.[1];
  }

  function cards() {
    const found = new Map();
    const root=document.querySelector('.feeds-container:not([hidden]),[role="tabpanel"]:not([hidden])');
    if(!root)return [];
    for (const anchor of root.querySelectorAll('a[href]')) {
      const id = noteId(anchor.href);
      if (!id || !visible(anchor) || !anchor.querySelector('img')) continue;
      if (new URL(anchor.href).hostname !== location.hostname) continue;
      if (!found.has(id)) found.set(id, {id, url: anchor.href, anchor});
    }
    return [...found.values()];
  }

  function detailRoot() {
    return [...document.querySelectorAll('.note-detail-mask, [role="dialog"]')].find(visible);
  }

  function detailPayload(id, options = {}) {
    const root = detailRoot();
    if (!root) return {reason: '未检测到已打开的笔记详情弹层'};
    if (noteId(location.href) !== id) return {reason: '页面中的笔记编号与刚点击的作品不一致'};
    if(options.collection_mode==='text') {
      try {return {payload:window.InspirationPlatforms.extract(options)};}
      catch(error){return {reason:error.message};}
    }
    // Only collect the note gallery; comments and profile cards are outside it.
    const gallery = root.querySelector('.media-container, .swiper');
    if (!gallery) return {reason: '详情已打开，但未识别到正文图片区域'};
    const seen = new Set();
    const images = [...gallery.querySelectorAll('img')].filter((img) => img.complete && img.naturalWidth >= 180)
      .map((img) => ({url: img.currentSrc || img.src, alt: clean(img.alt)}))
      .filter((img) => {
        if (!/^https?:/.test(img.url) || seen.has(canonicalImage(img.url))) return false;
        seen.add(canonicalImage(img.url)); return true;
      });
    if (!images.length && !gallery.querySelector('video')) return {reason: '正文图片区域没有加载完成的图片'};
    return {payload: {canonical_url: location.href.split('#')[0], page_title: clean(root.querySelector('#detail-title, .title, h1')?.textContent) || document.title, images, has_video:Boolean(gallery.querySelector('video'))}};
  }

  function openWork(url) {
    const target = new URL(url, location.href);
    const anchor = location.hostname.endsWith('xiaohongshu.com') ? cards().find((card) => card.id === noteId(url))?.anchor : [...document.querySelectorAll("a[href]")].find((item) => {
      const candidate = new URL(item.href, location.href);
      return candidate.pathname === target.pathname;
    });
    if (!anchor) return false;
    anchor.scrollIntoView({block: "center"});
    anchor.removeAttribute("target");
    anchor.click();
    return true;
  }

  function closeWork() {
    const root = document.querySelector('[role="dialog"], .note-detail-mask, .modal') || document;
    const button = root.querySelector('[aria-label*="关闭"], [aria-label*="Close"], .close-button, .close');
    if (!button) return false;
    button.click();
    return true;
  }

  async function controlPoint() {
    while (true) {
      const {liblibControl} = await chrome.storage.local.get(["liblibControl"]);
      if (liblibControl === "stopped") throw new Error("USER_STOPPED");
      if (liblibControl !== "paused") return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  async function discoverAuthorWorks() {
    const found = new Set();
    let unchanged = 0;
    for (let round = 0; round < 80 && found.size < 500 && unchanged < 4; round += 1) {
      await controlPoint();
      const before = found.size;
      workLinks().forEach((url) => found.add(url));
      unchanged = found.size === before ? unchanged + 1 : 0;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    workLinks().forEach((url) => found.add(url));
    return [...found].slice(0, 500);
  }

  const listener = (message, _sender, sendResponse) => {
    if (message.type === 'LIBLIB_VERSION') sendResponse({version: VERSION});
    if (message.type === 'LIBLIB_CARDS') sendResponse({cards: cards().map(({id, url}) => ({id, url}))});
    if (message.type === 'LIBLIB_DETAIL') sendResponse(detailPayload(message.id, message.options));
    if (message.type === 'LIBLIB_SCROLL') {
      const first = cards()[0]?.anchor;
      let scroller = first?.parentElement;
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
      if (scroller) scroller.scrollBy(0, Math.max(300, scroller.clientHeight * .8));
      else window.scrollBy(0, Math.max(300, innerHeight * .8));
      sendResponse({ok: true});
    }
    if (message.type === "LIBLIB_PAGE_PAYLOAD") {
      try {
        const payload = window.InspirationPlatforms.extract(message.options || {});
        if (payload.platform === 'pinterest' && !payload.images.length) {
          window.CollectorPinterest.recoverShareImage(payload, location.href).then(sendResponse);
          return true;
        }
        sendResponse(payload);
      }
      catch (error) { sendResponse({error: error.message}); }
    }
    if (message.type === "LIBLIB_DISCOVER_AUTHOR") {
      discoverAuthorWorks().then((urls) => sendResponse({urls})).catch((error) => sendResponse({error: error.message}));
      return true;
    }
    if (message.type === "LIBLIB_OPEN_WORK") sendResponse({opened: openWork(message.url)});
    if (message.type === "LIBLIB_CLOSE_WORK") sendResponse({closed: closeWork()});
    return false;
  };
  window.__liblibCollectorListener = listener;
  chrome.runtime.onMessage.addListener(listener);
})();
