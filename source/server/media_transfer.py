"""One file/track transfer, with bounded same-track CDN failover and no byte splicing."""
import hashlib
from http.client import IncompleteRead, RemoteDisconnected
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, unquote

from .media_urls import supports_cdn, validate_file_url


def candidates(primary, backups, platform):
    values = list(dict.fromkeys([primary, *backups]))[:4]
    if len(values) > 1:
        # A different path can identify another work/quality/track. Never infer
        # interchangeable content merely because both addresses use a known CDN.
        path = unquote(urlsplit(primary).path)
        for value in values:
            if not supports_cdn(value, platform) or unquote(urlsplit(value).path) != path:
                raise ValueError('备用地址不属于当前媒体轨道，未开始下载')
            validate_file_url(value)
    return values


def transfer(target, urls, *, open_source, checkpoint, sniff, limit, progress, switching=lambda:None):
    """Caller owns the unique temporary path. Only transport failures try a backup."""
    for attempt, url in enumerate(urls):
        checkpoint()
        if attempt:
            switching()
        digest = hashlib.sha256()
        received = expected = 0
        try:
            with open_source(url) as response:
                if response.status != 200:
                    raise HTTPError(url, response.status, 'incomplete response', response.headers, None)
                expected = int(response.headers.get('Content-Length') or 0)
                if expected < 0 or expected > limit:
                    raise ValueError('视频或音轨超过文件上限或预检确认值，请重新预检')
                with target.open('xb') as output:
                    while True:
                        checkpoint()
                        chunk = response.read(128 * 1024)
                        if not chunk:
                            break
                        if not received:
                            suffix, mime = sniff(chunk)
                        received += len(chunk)
                        if received > limit:
                            raise ValueError('视频或音轨超过文件上限或预检确认值，已停止下载')
                        output.write(chunk)
                        digest.update(chunk)
                        progress(received, expected)
                checkpoint()
                if not received or expected and received != expected:
                    raise ConnectionError('视频或音轨下载不完整')
            return received, digest, suffix, mime, expected
        except InterruptedError:
            raise
        except (HTTPError, URLError, TimeoutError, ConnectionError, IncompleteRead, RemoteDisconnected):
            # The caller's .part is disposable. Disk errors and validation errors
            # propagate instead of turning into a new network request.
            target.unlink(missing_ok=True)
            checkpoint()
            if attempt + 1 == len(urls):
                raise
    raise ValueError('没有可下载的媒体地址')
