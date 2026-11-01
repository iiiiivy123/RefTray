"""Header-only video sizing; absent length stays unknown. Never read media bodies."""
import shutil
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener
from .video import validate_url, SafeRedirect
from .bilibili_media import source_headers


def probe(url, opener=None):
    validate_url(url)
    opener = opener or build_opener(SafeRedirect())
    try:
        with opener.open(Request(url, method='HEAD', headers=source_headers(url)), timeout=8) as response:
            content_type = response.headers.get('Content-Type', '').lower()
            length = response.headers.get('Content-Length')
            if 'text/html' in content_type or 'mpegurl' in content_type or 'dash+xml' in content_type:
                return {'bytes': None, 'reason': '返回网页或播放列表，非普通视频'}
            size = int(length) if length and length.isdigit() else None
            return {'bytes': size if size and response.status == 200 else None,
                    'reason': '' if size and response.status == 200 else '视频源未提供有效完整长度'}
    except (HTTPError, OSError, ValueError) as exc:
        return {'bytes': None, 'reason': f'无法获取视频大小：{type(exc).__name__}'}


def space(directory):
    path = Path(directory).expanduser()
    if not path.is_absolute(): raise ValueError('请使用完整目标路径')
    # Kept for API compatibility; no disk probing or reserve policy.
    return None
