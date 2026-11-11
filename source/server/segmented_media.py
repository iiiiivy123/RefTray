"""Server-owned selections bridge preflight to yt-dlp's native downloaders."""
import copy
import json
import os
import secrets
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
from .media_urls import supports_cdn

_recipes = {}
_lock = threading.Lock()
PROTOCOLS = ('https', 'http', 'm3u8', 'm3u8_native', 'http_dash_segments')


def guard_url(url, platform):
    if platform not in ('youtube', 'x') or not supports_cdn(url, platform):
        raise ValueError('分段来源与作品平台不匹配')
    from .image_download import validate_url
    validate_url(url)



def register(item, canonical, platform):
    formats = item.get('requested_formats') or [item]
    if len(formats) > 2 or not formats:
        raise ValueError('视频轨道组合不支持')
    selected = []
    keys = ('url', 'ext', 'protocol', 'format_id', 'vcodec', 'acodec', 'height', 'width',
            'filesize', 'filesize_approx', 'fragments', 'fragment_base_url', 'http_headers')
    for f in formats:
        if f.get('has_drm') or f.get('protocol', 'https') not in PROTOCOLS:
            raise ValueError('不支持受保护、直播或非HTTP分段媒体')
        guard_url(f['url'], platform)
        selected.append({key: copy.deepcopy(f[key]) for key in keys if key in f})
    recipe = {'canonical': canonical, 'platform': platform, 'formats': selected, 'duration': item.get('duration'), 'media_id': item.get('id')}
    token = secrets.token_urlsafe(24)
    with _lock:
        now = time.monotonic()
        for key, (when, _) in list(_recipes.items()):
            if now - when > 21600:
                del _recipes[key]
        if len(_recipes) >= 1000:
            raise ValueError('待下载作品过多，请先完成当前任务')
        _recipes[token] = (now, recipe)
    return token


def selection(token, canonical=None, url=None):
    with _lock:
        value = _recipes.get(token)
        if not value or time.monotonic() - value[0] > 21600:
            raise ValueError('视频预检已过期或后台已重启，请重新开始任务')
        result = copy.deepcopy(value[1])
    if canonical is not None:
        from .source_identity import canonical as normalize
        if normalize(canonical)[0] != result['canonical'] or url != result['formats'][0]['url']:
            raise ValueError('下载与预检作品不一致，请重新预检')
    return result


def estimate(token):
    recipe = selection(token)
    sizes = [f.get('filesize') for f in recipe['formats']]
    # Approximate or manifest lengths cannot serve as a hard byte approval.
    size = sum(sizes) if all(isinstance(n, (int, float)) and n > 0 for n in sizes) else None
    return {'bytes': size, 'local': False}


def download(token, canonical, url, directory, limit, reserve, checkpoint, progress, control=lambda: 'running', phase=lambda *_: None):
    recipe = selection(token, canonical, url)
    recipe.update(limit=limit, reserve=reserve)
    root = Path(directory)
    recipe_path = root / 'selection.json'
    recipe_path.write_text(json.dumps(recipe), encoding='utf-8')
    control_path = root / 'control.txt'
    control_path.write_text('running', encoding='utf-8')
    from .components import ytdlp_path
    package = ytdlp_path()
    if not (package / 'yt_dlp/__main__.py').is_file():
        raise ValueError('本机下载组件未就绪')
    command = [sys.executable, '-X', 'utf8', '-B', '-m', 'server.download_public_media', str(package), str(recipe_path)]
    started = time.monotonic()
    with (root / 'engine.log').open('wb') as log:
        process = subprocess.Popen(command, cwd=Path(__file__).resolve().parents[1], stdout=log, stderr=log, stdin=subprocess.DEVNULL,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            while process.poll() is None:
                control_path.write_text(control(), encoding='utf-8')
                checkpoint()
                control_path.write_text('running', encoding='utf-8')
                if time.monotonic() - started > 10800:
                    raise ValueError('视频下载超时')
                used = sum(p.stat().st_size for p in root.glob('track*') if p.is_file())
                if used > limit:
                    raise ValueError('视频超过确认下载上限')
                status = root / 'progress.json'
                try:
                    details = json.loads(status.read_text('utf-8')) if status.is_file() else {}
                except (OSError, ValueError):
                    details = {}  # Report received bytes with an unknown total instead.
                progress(used, details)
                time.sleep(.2)
            checkpoint()
            if process.returncode:
                error = root / 'error.json'
                reason = json.loads(error.read_text('utf-8'))['reason'] if error.is_file() else '下载组件退出'
                raise ValueError('分段下载未完成：' + reason)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
    paths = [root / f'track-{i}.media' for i in range(len(recipe['formats']))]
    if any(not p.is_file() or not p.stat().st_size for p in paths) or sum(p.stat().st_size for p in paths) > limit:
        raise ValueError('音视频轨道缺失或超过确认上限')
    from .bilibili_media import executables, inspect, run_local
    # Disk reserve policy removed; OS write errors still propagate.
    track_streams=[s for p in paths for s in inspect(p).get('streams',[])]
    mp4_copy=bool(track_streams) and all(s.get('codec_name') in ('h264','aac') for s in track_streams)
    container='mp4' if mp4_copy else 'matroska'
    target = root / ('merged.mp4' if mp4_copy else 'merged.mkv')
    phase('processing', '正在合并视频轨道…' if len(paths)>1 else '正在整理视频文件…')
    command = [str(executables()[0]), '-nostdin', '-v', 'error', '-n']
    for p in paths:
        command += ['-protocol_whitelist', 'file', '-i', str(p)]
    command += ['-map', '0:v:0', '-map', '1:a:0' if len(paths) == 2 else '0:a:0?', '-c', 'copy', '-f', container, str(target)]
    run_local(command, checkpoint)
    phase('verifying', '正在校验视频完整性…')
    result = inspect(target)
    streams = result.get('streams', [])
    if not any(s['codec_type'] == 'video' for s in streams):
        raise ValueError('下载结果缺少视频轨道')
    has_audio = len(recipe['formats'])==2 or any(f.get('acodec') not in (None, 'none') for f in recipe['formats'])
    if has_audio and not any(s['codec_type'] == 'audio' for s in streams):
        raise ValueError('下载结果缺少音轨')
    duration = float(result.get('format', {}).get('duration', 0))
    expected = recipe.get('duration')
    if duration <= 0 or expected and abs(duration - float(expected)) > max(2, float(expected) * .02):
        raise ValueError('分段下载时长不完整')
    return target
