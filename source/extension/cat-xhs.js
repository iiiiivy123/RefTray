(function (root, factory) {
  const api = factory();
  root.XEagleXhs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function safeUrl(value) {
    try {
      const normalized = String(value || "").replace(/^http:\/\//i, "https://");
      const url = new URL(normalized);
      return url.protocol === "https:" ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  function noteFromUrl(value) {
    try {
      const url = new URL(String(value || ""), "https://www.xiaohongshu.com/");
      const hostname = url.hostname.toLowerCase();
      const isXiaohongshu = hostname === "xiaohongshu.com" || hostname.endsWith(".xiaohongshu.com");
      const isRednote = hostname === "rednote.com" || hostname.endsWith(".rednote.com");
      if (!isXiaohongshu && !isRednote) return null;
      const match = url.pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i);
      if (!match) return null;
      return {
        noteId: match[1],
        website: "https://" + (isRednote ? "www.rednote.com" : "www.xiaohongshu.com") + "/explore/" + match[1]
      };
    } catch (_error) {
      return null;
    }
  }

  function imageUrl(image) {
    if (!image || typeof image !== "object") return "";
    const info = Array.isArray(image.infoList || image.info_list)
      ? image.infoList || image.info_list
      : [];
    const preferred = info.find((item) => /WB_DFT|CRD_WM|ORIGINAL/i.test(String(item && (item.imageScene || item.image_scene) || ""))) || info[0];
    return safeUrl(preferred && preferred.url || image.urlDefault || image.url_default || image.urlPre || image.url_pre || image.url);
  }

  function videoCandidates(video) {
    const candidates = [];
    const stack = [video];
    const seen = new WeakSet();
    while (stack.length) {
      const value = stack.pop();
      if (typeof value === "string") {
        if (/masterUrl|master_url|playUrl|play_url/.test(value)) {
          try { stack.push(JSON.parse(value)); } catch (_error) {}
        }
        continue;
      }
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      if (!Array.isArray(value)) {
        const rawUrl = value.masterUrl || value.master_url || value.playUrl || value.play_url || value.url;
        const url = safeUrl(rawUrl);
        if (url && /(?:\.mp4(?:[?#]|$)|sns-video|video-[^.]+\.(?:xhscdn|rednotecdn))/i.test(url)) candidates.push({ ...value, url });
      }
      if (Array.isArray(value)) {
        for (const child of value) stack.push(child);
      } else {
        for (const child of Object.values(value)) stack.push(child);
      }
    }
    return candidates;
  }

  function bestVideo(video) {
    return videoCandidates(video).sort((a, b) => {
      const score = (item) => Number(item.width || 0) * Number(item.height || 0) +
        Number(item.bitrate || item.bitRate || item.bit_rate || 0);
      return score(b) - score(a);
    })[0] || null;
  }

  function mediaItems(value) {
    if (!value || typeof value !== "object") return [];
    const video = bestVideo(value.video);
    if (video) return [{ kind: "video", url: video.url, extension: "mp4" }];
    const images = value.imageList || value.image_list || value.images;
    const unique = new Map();
    for (const image of Array.isArray(images) ? images : []) {
      const url = imageUrl(image);
      const live = Boolean(image.livePhoto || image.live_photo);
      const motion = live ? bestVideo(image.stream || image.livePhoto?.media || image.live_photo?.media) : null;
      if (url && !motion) unique.set(url, { kind: "photo", url, extension: /\.gif(?:[?#]|$)/i.test(url) ? "gif" : "jpg", live_missing: live && !motion });
      if (motion) unique.set(motion.url, { kind: "gif", url: motion.url, extension: "mp4", live_photo: true });
    }
    return Array.from(unique.values());
  }

  function noteId(value) {
    const id = String(value && (value.noteId || value.note_id || value.id) || "");
    return /^[a-f0-9]{24}$/i.test(id) ? id : "";
  }

  function xhsRecord(value) {
    if (!value || typeof value !== "object") return null;
    const note = value.noteCard || value.note_card || value.note || value;
    const id = noteId(note) || noteId(value);
    if (!id) return null;
    const media = mediaItems(note);
    return media.length ? { noteId: id, media } : null;
  }

  function collectRecords(root) {
    const records = new Map();
    const stack = [root];
    const seen = new WeakSet();
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      const record = xhsRecord(value);
      if (record && (!records.has(record.noteId) || records.get(record.noteId).media.length < record.media.length)) {
        records.set(record.noteId, record);
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
    const source = String(body || "");
    try {
      return collectRecords(JSON.parse(source));
    } catch (_error) {
      const stateMatch = /window\.__INITIAL_STATE__\s*=\s*/.exec(source);
      if (stateMatch) {
        const stateStart = stateMatch.index + stateMatch[0].length;
        const scriptEnd = source.indexOf("</script>", stateStart);
        const rawState = source.slice(stateStart, scriptEnd >= 0 ? scriptEnd : undefined)
          .trim().replace(/;\s*$/, "");
        try {
          return collectRecords(JSON.parse(rawState.replace(/\bundefined\b/g, "null")));
        } catch (_stateError) {}
      }

      const start = source.indexOf("{");
      const end = source.lastIndexOf("}");
      if (start < 0 || end <= start) return [];
      try {
        return collectRecords(JSON.parse(source.slice(start, end + 1).replace(/\bundefined\b/g, "null")));
      } catch (_nestedError) {
        return [];
      }
    }
  }

  return { bestVideo, collectRecords, imageUrl, mediaItems, noteFromUrl, parseResponseBody, safeUrl, xhsRecord };
});
