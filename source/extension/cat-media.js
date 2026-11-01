(function (root, factory) {
  const api = factory();
  root.XEagleMedia = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function originalPhotoUrl(value) {
    try {
      const url = new URL(String(value || ""));
      const extensionMatch = url.pathname.match(/\.(jpe?g|png|webp|gif)$/i);
      let extension = extensionMatch ? extensionMatch[1].toLowerCase() : /^(jpg|jpeg|png|webp|gif)$/i.test(url.searchParams.get("format")||"") ? url.searchParams.get("format").toLowerCase() : "jpg";
      if (extension === "jpeg") extension = "jpg";
      if (extensionMatch) url.pathname = url.pathname.slice(0, -extensionMatch[0].length);
      url.search = "";
      url.searchParams.set("format", extension);
      url.searchParams.set("name", "orig");
      return { url: url.href, extension };
    } catch (_error) {
      return null;
    }
  }

  function bestVideoVariant(media) {
    const videoInfo = media && (media.video_info || media.videoInfo);
    const variants = videoInfo && Array.isArray(videoInfo.variants)
      ? videoInfo.variants
      : media && Array.isArray(media.variants) ? media.variants : [];
    const cap=Number(globalThis.__collectorVideoQuality)||Infinity;
    return variants
      .filter((variant) => {
        const contentType = variant && (variant.content_type || variant.contentType || variant.mime_type);
        const dimensions=String(variant.url||'').match(/\/(\d+)x(\d+)\//);
        const height=variant.height|| (dimensions?Number(dimensions[2]):0);
        return contentType === "video/mp4" && variant.url && (cap===Infinity||height&&height<=cap);
      })
      .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))[0] || null;
  }

  function mediaItems(mediaList) {
    const result = [];
    const seen = new Set();
    for (const media of Array.isArray(mediaList) ? mediaList : []) {
      if (!media) continue;
      const type = media.type || media.media_type;
      if (type === "photo") {
        const photo = originalPhotoUrl(media.media_url_https || media.media_url || media.url);
        if (photo && !seen.has("photo:" + photo.url)) {
          seen.add("photo:" + photo.url);
          result.push({ kind: "photo", ...photo });
        }
        continue;
      }
      if (type === "video" || type === "animated_gif") {
        const variant = bestVideoVariant(media);
        if (variant && !seen.has("video:" + variant.url)) {
          seen.add("video:" + variant.url);
          result.push({
            kind: type === "animated_gif" ? "gif" : "video",
            url: variant.url,
            quality: variant.url.match(/\/(\d+x\d+)\//)?.[1]||'当前源',
            extension: "mp4"
          });
        }
      }
    }
    return result;
  }

  function tweetMedia(value, legacy) {
    const lists = [
      legacy && legacy.extended_entities && legacy.extended_entities.media,
      legacy && legacy.entities && legacy.entities.media,
      value && value.extended_entities && value.extended_entities.media,
      value && value.entities && value.entities.media,
      value && value.mediaDetails,
      value && value.media_details
    ];
    const combined = [];
    for (const list of lists) {
      if (Array.isArray(list)) combined.push(...list);
    }
    return mediaItems(combined);
  }

  function relatedTweetIds(value, legacy) {
    const ids = [
      legacy && legacy.quoted_status_id_str,
      legacy && legacy.quoted_status_id,
      legacy && legacy.retweeted_status_id_str,
      legacy && legacy.retweeted_status_id,
      value && value.quoted_status_id_str,
      value && value.retweeted_status_id_str
    ];
    const nestedResults = [
      value && value.quoted_status_result,
      value && value.retweeted_status_result,
      legacy && legacy.quoted_status_result,
      legacy && legacy.retweeted_status_result
    ];
    for (const nested of nestedResults) {
      const result = nested && (nested.result || nested.tweet || nested);
      const tweet = result && (result.tweet || result);
      if (tweet) ids.push(tweet.rest_id || tweet.id_str);
    }
    return Array.from(new Set(ids.map((id) => String(id || "")).filter((id) => /^\d{10,20}$/.test(id))));
  }

  function tweetRecord(value) {
    if (!value || typeof value !== "object") return null;
    const id = String(value.rest_id || value.id_str || "");
    const legacy = value.legacy;
    if (!/^\d{10,20}$/.test(id) || !legacy || typeof legacy !== "object") return null;
    const media = tweetMedia(value, legacy);
    const relatedIds = relatedTweetIds(value, legacy);
    if (!media.length && !relatedIds.length) return null;
    const user = value.core && value.core.user_results && value.core.user_results.result;
    return {
      tweetId: id,
      media,
      relatedTweetIds: relatedIds,
      text: String(legacy.full_text || ""),
      account: String(user && user.legacy && user.legacy.screen_name || "")
    };
  }

  function preferredTweetRecord(primaryTweetId, candidateTweetIds, recordsById) {
    const ids = [primaryTweetId, ...(Array.isArray(candidateTweetIds) ? candidateTweetIds : [])];
    const seen = new Set();
    for (let index = 0; index < ids.length; index += 1) {
      const rawId = ids[index];
      const id = String(rawId || "");
      if (!/^\d{10,20}$/.test(id) || seen.has(id)) continue;
      seen.add(id);
      const record = recordsById && typeof recordsById.get === "function"
        ? recordsById.get(id)
        : recordsById && recordsById[id];
      if (record && Array.isArray(record.media) && record.media.length) return record;
      if (record && Array.isArray(record.relatedTweetIds)) ids.push(...record.relatedTweetIds);
    }
    return null;
  }

  function collectTweetRecords(root) {
    const records = [];
    const stack = [root];
    const seen = new WeakSet();
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      const record = tweetRecord(value);
      if (record) records.push(record);
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) stack.push(value[index]);
      } else {
        for (const child of Object.values(value)) stack.push(child);
      }
    }
    return records;
  }

  function parseResponseBody(body) {
    try {
      return collectTweetRecords(JSON.parse(String(body || "")));
    } catch (_error) {
      return [];
    }
  }

  return {
    bestVideoVariant,
    collectTweetRecords,
    mediaItems,
    originalPhotoUrl,
    parseResponseBody,
    preferredTweetRecord,
    tweetRecord
  };
});
