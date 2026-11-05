"""Isolated native HTTP/HLS/DASH worker; never lets FFmpeg fetch remote URLs."""
import json
import re
import shutil
import sys
import time
from pathlib import Path


def run(recipe, root):
    from yt_dlp import YoutubeDL
    from yt_dlp.networking import _urllib
    from yt_dlp.downloader.http import HttpFD
    from yt_dlp.downloader.hls import HlsFD
    from yt_dlp.downloader import hls
    from yt_dlp.downloader.dash import DashSegmentsFD
    from .segmented_media import guard_url

    class NoRemoteFFmpeg(hls.FFmpegFD):
        @classmethod
        def available(cls, *args, **kwargs):
            return False

        def real_download(self, *args, **kwargs):
            raise ValueError('此分段格式不支持原生下载；未委托外部程序访问网络')

    hls.FFmpegFD = NoRemoteFFmpeg

    def checkpoint():
        control = root / 'control.txt'
        while control.is_file() and control.read_text('utf-8') == 'paused':
            time.sleep(.2)
        if control.is_file() and control.read_text('utf-8') == 'stopped':
            raise InterruptedError('下载已停止')

    class Redirect(_urllib.RedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            guard_url(newurl, recipe['platform'])
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    _urllib.RedirectHandler = Redirect

    class GuardedDL(YoutubeDL):
        def build_request_director(self, handlers, preferences=None):
            return super().build_request_director([_urllib.UrllibRH], preferences)

        def urlopen(self, request):
            checkpoint()
            guard_url(request if isinstance(request, str) else request.url, recipe['platform'])
            return super().urlopen(request)

    last_progress = 0
    def write_progress(downloaded, total):
        progress = root / 'progress.json'
        temporary = root / 'progress.json.tmp'
        try:
            temporary.write_text(json.dumps({'bytes':downloaded,'total':total,'track':i+1,'tracks':len(recipe['formats'])}), encoding='utf-8')
            temporary.replace(progress)
        except OSError:
            pass  # Optional UI telemetry must not interrupt a valid media transfer.

    def check(status):
        nonlocal last_progress
        checkpoint()
        used = sum(p.stat().st_size for p in root.glob('track*') if p.is_file())
        if used > recipe['limit']:
            raise ValueError('视频超过确认下载上限')
        stamp = time.monotonic()
        if stamp-last_progress >= .2 or status.get('status') == 'finished':
            last_progress = stamp
            # Only a measured byte total is a percentage denominator; estimates stay unknown.
            total = status.get('total_bytes')
            write_progress(status.get('downloaded_bytes') or 0, total if isinstance(total,(int,float)) and total>0 else None)

    options = {'quiet': True, 'no_warnings': True, 'socket_timeout': 15, 'retries': 1,
               'fragment_retries': 1, 'skip_unavailable_fragments': False, 'concurrent_fragment_downloads': 1,
               'hls_prefer_native': True, 'external_downloader': 'native', 'cachedir': False,
               'max_filesize': recipe['limit'], 'buffersize': 65536, 'noprogress': True}
    with GuardedDL(options) as downloader:
        for i, fmt in enumerate(recipe['formats']):
            last_progress = 0
            write_progress(0, None)
            protocol = fmt.get('protocol', 'https')
            cls = HlsFD if protocol in ('m3u8', 'm3u8_native') else DashSegmentsFD if protocol == 'http_dash_segments' else HttpFD
            fd = cls(downloader, options)
            fd.add_progress_hook(check)
            result = fd.download(str(root / f'track-{i}.media'), {**fmt, 'id': 'approved', 'title': 'approved', 'is_live': False})
            if not (result[0] if isinstance(result, tuple) else result):
                raise ValueError('媒体轨道未下载完整')


if __name__ == '__main__':
    sys.path.insert(0, sys.argv[1])
    path = Path(sys.argv[2])
    try:
        run(json.loads(path.read_text('utf-8')), path.parent)
    except Exception as exc:
        raw = str(exc)
        status = re.search(r'HTTP Error (\d{3})', raw)
        reason = '网站返回 HTTP ' + status[1] if status else '文件超过下载上限' if '上限' in raw or '空间' in raw else '分段不可用、连接失败或格式不支持（' + type(exc).__name__ + '）'
        (path.parent / 'error.json').write_text(json.dumps({'reason': reason}), encoding='utf-8')
        sys.exit(1)
