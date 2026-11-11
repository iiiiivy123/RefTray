"""Public single-work metadata via yt-dlp; no browser cookies or user config."""
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from .source_identity import canonical

def pick(data, url, platform, output_format='original'):
    if platform=='bilibili':
        from .bili_resolver import single_source
        return single_source(data,url,output_format)
    from .segmented_media import register
    entries=data.get('entries') or [data]
    sources=[]
    for item in entries[:20]:
        if not item or item.get('has_drm') or item.get('is_live'):
            raise ValueError('不采集受保护内容或正在直播的视频')
        streams=item.get('requested_formats') or [item]
        videos=[s for s in streams if s.get('vcodec') != 'none']
        if len(videos)!=1:raise ValueError('未找到单个可下载视频轨道')
        video=videos[0];audio=next((s for s in streams if s.get('vcodec')=='none' and s.get('acodec') != 'none'),None)
        token = register({**item, 'requested_formats': [video]+([audio] if audio else [])}, url, platform)
        sources.append({'url':video['url'],'resolver_id':token,
                        'media_kind':'resolved',
                        'quality':f"{video.get('width','?')}×{video.get('height','?')}",'kind':item.get('collector_kind','video'),'canonical_url':url,'page_title':item.get('title') or data.get('title'),
                        'author_name':item.get('uploader') or data.get('uploader'),'cover_url':item.get('thumbnail')})
    if not sources:raise ValueError('当前作品没有可用视频')
    return {'media':sources}

def run_worker(command, env, checkpoint, timeout=100):
    """Drain worker pipes while polling cancellation; always reap the child."""
    checkpoint()
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, env=env,
                               creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    deadline = time.monotonic() + timeout
    try:
        while True:
            checkpoint()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(command, timeout)
            try:
                out, err = process.communicate(timeout=min(.2, remaining))
                checkpoint()
                return subprocess.CompletedProcess(command, process.returncode, out, err)
            except subprocess.TimeoutExpired:
                if time.monotonic() >= deadline:
                    raise
    except BaseException:
        if process.poll() is None:
            process.kill()
        process.communicate()
        raise


def resolve(value, subtitle_language='auto', captions=True, quality='best',output_format='original', *, checkpoint=lambda: None):
    checkpoint()
    url,platform=canonical(value)
    if quality not in ('best','1080','720','480'):raise ValueError('不支持的清晰度')
    from .components import ytdlp_path
    package = ytdlp_path()
    from .diagnostics import failure, classify
    if not (package/'yt_dlp/__main__.py').is_file():
        raise failure('COMPONENT', 'yt-dlp module path is not configured or missing', canonical=url, component=False)
    node=os.environ.get('COLLECTOR_NODE') or shutil.which('node')
    command=[sys.executable,'-X','utf8',str(Path(__file__).with_name('resolve_public_media.py')),str(package),url,node or '',quality,output_format]
    env={**os.environ,'PYTHONPATH':str(package),'PYTHONUTF8':'1'}
    started=time.monotonic()
    try:
        result=run_worker(command, env, checkpoint)
    except subprocess.TimeoutExpired as exc:
        detail=(exc.stderr or b'').decode('utf-8','replace') if isinstance(exc.stderr,bytes) else str(exc.stderr or '')
        raise failure('TIMEOUT',detail or 'worker timeout',canonical=url,elapsed=time.monotonic()-started,component=True) from exc
    except OSError as exc:
        raise failure('COMPONENT',str(exc),canonical=url,elapsed=time.monotonic()-started,component=True) from exc
    if result.returncode:
        message=result.stderr.decode('utf-8','replace')
        raise failure(classify(message),message,canonical=url,exit_code=result.returncode,elapsed=time.monotonic()-started,component=True)
    try:
        data=json.loads(result.stdout)
    except (ValueError,UnicodeError) as exc:
        raise failure('PAYLOAD','worker returned invalid JSON',canonical=url,exit_code=result.returncode,elapsed=time.monotonic()-started,component=True) from exc
    checkpoint()
    result = pick(data,url,platform,output_format)
    if platform == 'youtube' and captions:
        from .youtube_captions import fetch
        cues, origin, warning = fetch(data, subtitle_language, checkpoint=checkpoint)
        for source in result['media']:
            source.update(subtitle_cues=cues, subtitle_source=origin, subtitle_warning=warning)
    checkpoint()
    return result
