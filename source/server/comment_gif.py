"""Fetch an explicitly identified X reply animation and reuse the local GIF converter."""
import re
import threading
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request

from . import gif_media
from .image_download import MAX_BYTES, public_opener

_conversion = threading.Lock()


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('评论动图源发生跳转，未保存')


def read_gif(url, timeout):
    source = urlsplit(url)
    if source.scheme != 'https' or source.netloc != 'video.twimg.com' or not re.fullmatch(r'/tweet_video/[\w-]+\.mp4', source.path):
        raise ValueError('未确认直接回复的动图来源')
    with _conversion, TemporaryDirectory(prefix='reftray-reply-') as temporary:
        path = Path(temporary) / 'input.mp4'
        with public_opener(NoRedirect()).open(Request(url), timeout=timeout) as response:
            if response.status != 200 or response.headers.get_content_type() != 'video/mp4':
                raise ValueError('评论动图源未返回完整 MP4')
            data = response.read(MAX_BYTES + 1)
            expected = response.headers.get('Content-Length')
            if len(data) > MAX_BYTES or data[4:8] != b'ftyp' or (expected is not None and len(data) != int(expected)):
                raise ValueError('评论动图源不完整或超过 30MB')
            path.write_bytes(data)
        target = path.with_suffix('.gif')
        gif_media.convert(path, target, lambda: None)
        if target.stat().st_size > MAX_BYTES:
            raise ValueError('评论动图超过图文附件的 30MB 上限')
        return target.read_bytes()
