// Shared by the web-page collector and the local-video page. No network access.
(() => {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  function difference(a, b) {
    if (!a || a.length !== b.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i += 4) {
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return sum / (a.length / 4 * 3);
  }
  async function seek(video, time, control) {
    await control();
    video.pause();
    video.currentTime = time;
    const deadline = Date.now() + 15000;
    do {
      await pause(60);
      await control();
      if (video.error) throw new Error('视频解码失败，请尝试已下载的 MP4 视频。');
      if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - time) < .25) return;
    } while (Date.now() < deadline);
    throw new Error('视频定位超时，已保存图片保留。请等待视频缓冲，或使用已下载的视频。');
  }
  async function extract(video, options, control, save, progress) {
    const interval = Number(options.interval ?? 1);
    if (!Number.isFinite(interval) || interval < .5 || interval > 60) throw new Error('抽帧间隔须为 0.5–60 秒。');
    if (!['slides', 'interval'].includes(options.strategy)) throw new Error('请选择分段图文或定时抽帧。');
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth) throw new Error('视频尚未加载，或是直播。请先播放一次，再开始抽帧。');
    const count = Math.ceil(duration / interval);
    if (count > 600) throw new Error('本次超过 600 个采样点，请增大间隔。尚未开始抽帧。');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2560 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    const thumb = document.createElement('canvas');
    thumb.width = 48; thumb.height = 48;
    const sample = thumb.getContext('2d', {willReadFrequently: true});
    const originalTime = video.currentTime;
    const wasPaused = video.paused;
    const originalSource = video.currentSrc;
    let previous, saved = 0, skipped = 0, omitted = 0, partial=false;
    video.pause();
    try {
      for (let index = 0; index < count; index++) {
        await control();
        if (!video.isConnected || video.currentSrc !== originalSource) throw new Error('视频或页面已切换，抽帧已停止。');
        // Sample the middle of each interval to avoid exact cut boundaries.
        const time = Math.min((index + .5) * interval, Math.max(0, duration - .05));
        await seek(video, time, control);
        sample.drawImage(video, 0, 0, 48, 48);
        const pixels = sample.getImageData(0, 0, 48, 48).data;
        if (options.strategy === 'slides' && difference(previous, pixels) < 8) {
          skipped++;
        } else {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = canvas.toDataURL('image/jpeg', .94);
          if (!image.startsWith('data:image/jpeg;base64,')) throw new Error('视频画面导出失败。');
          await control();
          const result=await save({data_base64:image.split(',')[1],content_type:'image/jpeg',frame_time:Number(time.toFixed(3))});
          if(result?.partial||result?.omitted_images){partial=true;omitted=count-index;break;}
          if(result&&result.new_images===0&&!result.duplicate_images)throw new Error('抽帧未确认保存，已停止');
          previous = new Uint8ClampedArray(pixels);
          saved++;
        }
        await progress({percent: Math.round((index + 1) / count * 100), message: `视频抽帧 ${index + 1}/${count}\n已处理 ${saved} 张，合并相近画面 ${skipped} 张`});
      }
      return {saved,skipped,omitted,partial};
    } catch (error) {
      if (error.name === 'SecurityError') throw new Error('网页禁止直接读取视频画面。请尝试“下载后自动抽帧”；若网页不提供可下载视频地址，可选择已有的本地视频。已保存图片保留。');
      throw error;
    } finally {
      if (video.isConnected && video.currentSrc === originalSource) {
        try { video.currentTime = originalTime; if (!wasPaused) await video.play(); } catch (_) {}
      }
      canvas.width = canvas.height = thumb.width = thumb.height = 0;
    }
  }
  globalThis.InspirationFrames = {extract, difference};
})();
