"""Public single-work metadata via yt-dlp; no browser cookies or user config."""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

def canonical(value):
    u = urlsplit(value)
    if u.scheme != 'https' or u.username or u.password or u.port not in (None,443):
        raise ValueError('仅接受公开作品的HTTPS地址')
    if u.hostname in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be'):
        if u.hostname == 'youtu.be':
            identity = u.path.strip('/')
        elif u.path == '/watch':
            identity = parse_qs(u.query).get('v',[''])[0]
        elif u.path.startswith('/shorts/'):
            identity = u.path[len('/shorts/'):].rstrip('/')
        else:
            identity = ''
        if not re.fullmatch(r'[\w-]{11}', identity):
            raise ValueError('请打开具体YouTube视频或Shorts；不采集频道/播放列表')
        return 'https://www.youtube.com/watch?v='+identity, 'youtube'
    bili=re.fullmatch(r'/video/(BV[0-9A-Za-z]{10})/?',u.path)
    if u.hostname in ('bilibili.com','www.bilibili.com') and bili:
        parts=parse_qs(u.query,keep_blank_values=True).get('p',['1'])
        if len(parts)!=1 or not parts[0].isdigit() or not 1<=int(parts[0])<=10000:raise ValueError('无效或重复的B站分P编号')
        return 'https://www.bilibili.com/video/'+bili[1]+'/?p='+str(int(parts[0])),'bilibili'
    match = re.fullmatch(r'(/\w+/status/\d+)(?:/video/[1-4])?/?',u.path)
    if u.hostname in ('x.com','www.x.com','twitter.com','www.twitter.com') and match:
        return 'https://x.com'+match[1], 'x'
    raise ValueError('成熟解析器支持X主帖、YouTube和B站单视频')

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
                        'author_name':item.get('uploader') or data.get('uploader')})
    if not sources:raise ValueError('当前作品没有可用视频')
    return {'media':sources}

def resolve(value, subtitle_language='auto', captions=True, quality='best',output_format='original'):
    url,platform=canonical(value)
    if quality not in ('best','1080','720','480'):raise ValueError('不支持的清晰度')
    from .components import ytdlp_path
    package = ytdlp_path()
    from .diagnostics import failure, classify
    import time
    if not (package/'yt_dlp/__main__.py').is_file():
        raise failure('COMPONENT', 'yt-dlp module path is not configured or missing', canonical=url, component=False)
    node=os.environ.get('COLLECTOR_NODE') or shutil.which('node')
    command=[sys.executable,'-X','utf8',str(Path(__file__).with_name('resolve_public_media.py')),str(package),url,node or '',quality,output_format]
    env={**os.environ,'PYTHONPATH':str(package),'PYTHONUTF8':'1'}
    started=time.monotonic()
    try:
        result=subprocess.run(command,capture_output=True,timeout=100,env=env,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
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
    result = pick(data,url,platform,output_format)
    if platform == 'youtube' and captions:
        from .youtube_captions import fetch
        cues, origin, warning = fetch(data, subtitle_language)
        for source in result['media']:
            source.update(subtitle_cues=cues, subtitle_source=origin, subtitle_warning=warning)
    return result
