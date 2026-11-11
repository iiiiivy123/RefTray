"""Local-file-only remux. Downloads still pass the collector CDN/IP/size guards."""
import json
import os
import shutil
from pathlib import Path
import subprocess
import time
import tempfile
from contextlib import ExitStack
from urllib.parse import urlsplit
from .media_urls import host_matches, PLATFORM_CDNS

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
    if host_matches(host, PLATFORM_CDNS['bilibili']):
        headers['Referer'] = 'https://www.bilibili.com/'
    return headers

def run_local(command, checkpoint, timeout=120, progress=None):
    with ExitStack() as stack:
        progress_file = None
        if progress:
            folder = stack.enter_context(tempfile.TemporaryDirectory(prefix='reftray-progress-'))
            progress_file = Path(folder) / 'progress.txt'
            command = [command[0], '-progress', str(progress_file), '-nostats', *command[1:]]
        error_output = stack.enter_context(tempfile.TemporaryFile())
        proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                stderr=error_output, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        def read_progress():
            if progress_file and progress_file.exists():
                with progress_file.open('rb') as stream:
                    stream.seek(max(0, progress_file.stat().st_size - 8192))
                    lines = stream.read().decode('utf-8', 'replace').splitlines()
                for line in reversed(lines):
                    if line.startswith('out_time_us='):
                        try:
                            seconds = max(0, int(line.split('=', 1)[1])) / 1000000
                        except ValueError:
                            continue
                        progress(seconds)
                        break
        started = time.monotonic()
        try:
            while proc.poll() is None:
                checkpoint()
                read_progress()
                if time.monotonic()-started > timeout:
                    raise ValueError('本地音视频处理超时')
                time.sleep(.1)
            checkpoint()
            if proc.returncode:
                from .diagnostics import failure
                error_output.seek(0, 2)
                size = error_output.tell()
                error_output.seek(0)
                detail = error_output.read(4000)
                if size > 4000:
                    error_output.seek(max(4000, size - 8000))
                    detail += b'\n...\n' + error_output.read(8000)
                raise failure('LOCAL_MEDIA', Path(command[0]).name + '\n' + detail.decode('utf-8', 'replace'),
                              exit_code=proc.returncode, elapsed=time.monotonic()-started,
                              stage='local-media', component=True)
            read_progress()
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
