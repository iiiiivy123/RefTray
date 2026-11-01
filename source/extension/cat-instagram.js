(function (root, factory) {
  const api = factory();
  root.XEagleInstagram = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  function postFromUrl(value) {
    try {
      const url = new URL(String(value || ""), "https://www.instagram.com/");
      if (url.hostname !== "instagram.com" && url.hostname !== "www.instagram.com") return null;
      const match = url.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels)\/([A-Za-z0-9_-]{5,30})(?:\/|$)/);
      if (!match || match[2] === "audio") return null;
      const type = match[1] === "p" ? "p" : "reel";
      return {
        code: match[2],
        type,
        website: "https://www.instagram.com/" + type + "/" + match[2] + "/"
      };
    } catch (_error) {
      return null;
    }
  }

  function score(item) {
    return Number(item && item.width || 0) * Number(item && item.height || 0) +
      Number(item && (item.bitrate || item.bit_rate) || 0);
  }

  function bestFrom(list) {
    return (Array.isArray(list) ? list : [])
      .filter((item) => safeUrl(item && (item.url || item.src)))
      .sort((a, b) => score(b) - score(a))[0] || null;
  }

  function childrenOf(value) {
    if (Array.isArray(value && value.carousel_media)) return value.carousel_media;
    const edges = value && value.edge_sidecar_to_children && value.edge_sidecar_to_children.edges;
    if (Array.isArray(edges)) return edges.map((edge) => edge && (edge.node || edge)).filter(Boolean);
    if (Array.isArray(value && value.carouselMedia)) return value.carouselMedia;
    return [];
  }

  function directMedia(value) {
    if (!value || typeof value !== "object") return null;
    const video = bestFrom(value.video_versions || value.videoVersions);
    const videoUrl = safeUrl(video && (video.url || video.src) || value.video_url || value.videoUrl);
    if (videoUrl) return { kind: "video", url: videoUrl, extension: "mp4" };

    const candidates = [];
    if (value.image_versions2 && Array.isArray(value.image_versions2.candidates)) {
      candidates.push(...value.image_versions2.candidates);
    }
    if (value.image_versions && Array.isArray(value.image_versions.candidates)) {
      candidates.push(...value.image_versions.candidates);
    }
    if (Array.isArray(value.display_resources)) candidates.push(...value.display_resources);
    if (Array.isArray(value.thumbnail_resources)) candidates.push(...value.thumbnail_resources);
    const image = bestFrom(candidates);
    const imageUrl = safeUrl(image && (image.url || image.src) || value.display_url || value.displayUrl);
    return imageUrl ? { kind: "photo", url: imageUrl, extension: "jpg" } : null;
  }

  function mediaItems(value) {
    const children = childrenOf(value);
    const items = children.length
      ? children.map(directMedia).filter(Boolean)
      : [directMedia(value)].filter(Boolean);
    const unique = new Map();
    for (const item of items) unique.set(item.url, item);
    return Array.from(unique.values());
  }

  function instagramRecord(value) {
    if (!value || typeof value !== "object") return null;
    const media = value.media && typeof value.media === "object" ? value.media : value;
    const code = String(media.code || media.shortcode || value.code || value.shortcode || "");
    if (!/^[A-Za-z0-9_-]{5,30}$/.test(code)) return null;
    const items = mediaItems(media);
    if (!items.length) return null;
    return { code, media: items };
  }

  function collectRecords(root) {
    const records = new Map();
    const stack = [root];
    const seen = new WeakSet();
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      const record = instagramRecord(value);
      if (record && (!records.has(record.code) || records.get(record.code).media.length < record.media.length)) {
        records.set(record.code, record);
      }
      if (Array.isArray(value)) {
        for (const child of value) stack.push(child);
      } else {
        for (const child of Object.values(value)) stack.push(child);
      }
    }
    return Array.from(records.values());
  }

  function parseResponseBody(body) {
    try {
      return collectRecords(JSON.parse(String(body || "")));
    } catch (_error) {
      return [];
    }
  }

  return { collectRecords, instagramRecord, mediaItems, parseResponseBody, postFromUrl, safeUrl };
});
