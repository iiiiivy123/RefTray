"""Shared URL rules for media selection and transport; no task or file ownership."""
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler
from .image_download import validate_url as validate_public_url

PLATFORM_CDNS = {
    'bilibili': ('bilivideo.com', 'bilivideo.cn'),
    'youtube': ('googlevideo.com',),
    'x': ('twimg.com',),
}
FILE_CDNS = ('artstation.com', 'xhscdn.com', 'xhscdn.net', 'xiaohongshu.com',
             'pinimg.com', 'hbimg.com', 'huaban.com', 'video.twimg.com',
             'cdninstagram.com', 'fbcdn.net', 'weibocdn.com', 'sinaimg.cn',
             *PLATFORM_CDNS['bilibili'], *PLATFORM_CDNS['youtube'])


def host_matches(host, domains):
    host = (host or '').lower()
    return any(host == domain or host.endswith('.' + domain) for domain in domains)


def supports_cdn(value, platform):
    """Pure candidate filter. DNS/public-address validation still runs before I/O."""
    try:
        url = urlsplit(value or '')
        return (url.scheme == 'https' and url.username is None and url.password is None
                and url.port in (None, 443)
                and host_matches(url.hostname, PLATFORM_CDNS.get(platform, ())))
    except ValueError:
        return False


def validate_file_url(value):
    url = urlsplit(value)
    if (url.scheme not in ('http', 'https') or url.username is not None or url.password is not None
            or url.port not in (None, 80, 443)):
        raise ValueError('仅支持普通 HTTP(S) 视频地址')
    if not host_matches(url.hostname, FILE_CDNS):
        raise ValueError('该视频域名暂未接入下载；目前支持已接入平台的视频 CDN')
    if url.path.lower().endswith(('.m3u8', '.mpd')):
        raise ValueError('这是分段流媒体，不是普通视频文件；本版不处理播放列表')
    validate_public_url(value)
    return value


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_file_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)
