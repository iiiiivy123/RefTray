"""Local-file-only remux. Downloads still pass the collector CDN/IP/size guards."""
import json
import os
import shutil
from pathlib import Path
import subprocess
import time
from urllib.parse import urlsplit

def executables():
    root = Path(__file__).resolve().parents[1]/'media-tools'
    ffmpeg = Path(os.environ.get('COLLECTOR_FFMPEG', str(root/'ffmpeg.exe')))
    ffprobe = Path(os.environ.get('COLLECTOR_FFPROBE', str(root/'ffprobe.exe')))
    # The local conversion component supports HEVC/AV1-only tracks as well as AVC.
    configured_full = os.environ.get('COLLECTOR_GIF_FFMPEG')
    if not configured_full and not any(os.environ.get(k) for k in ('COLLECTOR_FFMPEG','COLLECTOR_FFPROBE')):
        configured_full = shutil.which('ffmpeg')
    full = Path(configured_full or '')
    if full.is_absolute() and full.is_file() and full.with_name('ffprobe.exe').is_file():
        ffmpeg, ffprobe = full, full.with_name('ffprobe.exe')
    if not all(p.is_absolute() and p.is_file() for p in (ffmpeg, ffprobe)):
        raise ValueError('缺少B站音视频合并组件，请安装包含媒体组件的版本；未保存无声视频')
    return ffmpeg, ffprobe

def available():
    try:
        executables()
        return True
    except ValueError:
        return False

def source_headers(url):
    host = (urlsplit(url).hostname or '').lower()
    headers = {'User-Agent': 'Mozilla/5.0'}
    if any(host == h or host.endswith('.'+h) for h in ('bilivideo.com', 'bilivideo.cn')):
        headers['Referer'] = 'https://www.bilibili.com/'
    return headers

def run_local(command, checkpoint, timeout=120):
    # No shell, no URL inputs, and no pipe buffer that can deadlock a paused task.
    proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    started = time.monotonic()
    try:
        while proc.poll() is None:
            checkpoint()
            if time.monotonic()-started > timeout:
                raise ValueError('本地音视频合并超时')
            time.sleep(.1)
        checkpoint()
        if proc.returncode:
            raise ValueError('音视频合并失败，临时轨道不会标记为成功')
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)

def inspect(path):
    _, ffprobe = executables()
    result = subprocess.run([str(ffprobe), '-v', 'error', '-protocol_whitelist', 'file', '-show_entries',
                             'stream=codec_type,codec_name:format=duration,format_name', '-of', 'json', str(path)],
                            capture_output=True, timeout=30, check=True,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    return json.loads(result.stdout)

def mux(video, audio, output, checkpoint):
    ffmpeg, _ = executables()
    for file, kind in ((video, 'video'), (audio, 'audio')):
        streams = inspect(file).get('streams', [])
        if len(streams)!=1 or streams[0].get('codec_type')!=kind:
            raise ValueError('B站分轨内容与预期不符，未合并')
    run_local([str(ffmpeg), '-nostdin', '-v', 'error', '-n', '-protocol_whitelist', 'file', '-i', str(video),
               '-protocol_whitelist', 'file', '-i', str(audio), '-map', '0:v:0', '-map', '1:a:0',
               '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', str(output)], checkpoint)
    result = inspect(output)
    if sorted(s.get('codec_type') for s in result.get('streams', []))!=['audio', 'video'] or float(result.get('format', {}).get('duration', 0))<=0:
        raise ValueError('合并结果缺少有效音频或视频，未保存')
