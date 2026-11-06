"""Resolve post-owned public images without browser credentials."""
import codecs
import json
import re
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
from urllib.request import HTTPRedirectHandler, Request

from .image_download import public_opener


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = {}
        self.canonical_links = []
        self.head_complete = False

    def handle_starttag(self, tag, attrs):
        if self.head_complete:
            return
        attrs = dict(attrs)
        if tag == 'body':
            self.head_complete = True
        if tag == 'link' and 'canonical' in (attrs.get('rel') or '').lower().split():
            self.canonical_links.append(attrs.get('href', ''))
        if tag == 'meta' and attrs.get('property'):
            self.values[attrs['property']] = attrs.get('content', '')

    def handle_endtag(self, tag):
        if tag == 'head':
            self.head_complete = True


class PinPage(Metadata):
    """Read a completed public Pin response embedded in the requested HTML."""
    def __init__(self, pin_id):
        super().__init__()
        self.pin_id = pin_id
        self.in_response = False
        self.parts = []
        self.size = 0
        self.pin = None

    def handle_starttag(self, tag, attrs):
        super().handle_starttag(tag, attrs)
        if tag == 'script':
            self.in_response = 'data-relay-completed-request' in dict(attrs)
            self.parts.clear()
            self.size = 0

    def handle_endtag(self, tag):
        super().handle_endtag(tag)
        if tag == 'script':
            if self.in_response:
                self.read_response(''.join(self.parts))
            self.in_response = False
            self.parts.clear()

    def handle_data(self, data):
        if self.in_response:
            self.size += len(data)
            if self.size > 2 * 1024 * 1024:
                self.in_response = False
                self.parts.clear()
            else:
                self.parts.append(data)

    def read_response(self, data):
        call = re.fullmatch(r'\s*window\.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\((.*)\);?\s*', data, re.S)
        if not call:
            return
        try:
            request, response = json.loads('[' + call[1] + ']')
            variables = json.loads(unquote(request))['variables']
            pin = response['data']['v3GetPinQueryv2']['data']
            if variables['pinId'] == self.pin_id and pin['__typename'] == 'Pin' and pin['entityId'] == self.pin_id:
                self.pin = pin
        except (ValueError, KeyError, TypeError, RecursionError):
            return


def identity(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.username is not None or parsed.password is not None or parsed.port not in (None, 443):
        raise ValueError('需要 HTTPS 原作品链接')
    host = parsed.hostname
    if host in ('www.pinterest.com', 'pinterest.com'):
        match = re.fullmatch(r'/pin/(\d+)/?', parsed.path)
        platform = 'pinterest'
    elif host in ('x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'):
        match = re.fullmatch(r'/(?:[\w]+|i/web)/status/(\d+)/?', parsed.path)
        platform = 'x'
    else:
        match = None
    if not match:
        raise ValueError('当前接口支持 Pinterest Pin 和 X 原帖详情链接')
    return platform, match[1]


def resolve_post(url):
    expected = identity(url)
    class SourceRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            if identity(newurl) != expected:
                raise ValueError('网页重定向身份不匹配')
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    with public_opener(SourceRedirect()).open(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=15) as response:
        if identity(response.url) != expected:
            raise ValueError('网页重定向身份不匹配')
        decoder = codecs.getincrementaldecoder('utf-8')('replace')
        parser = PinPage(expected[1]) if expected[0] == 'pinterest' else Metadata()
        total = 0
        while not parser.head_complete:
            chunk = response.read1(65536)
            if not chunk:
                raise ValueError('分享页面头部不完整，未保存')
            total += len(chunk)
            if total > 8 * 1024 * 1024:
                raise ValueError('网页超过解析上限')
            parser.feed(decoder.decode(chunk))
        if isinstance(parser, PinPage) and not (parser.canonical_links or parser.values.get('og:url')):
            while parser.pin is None and total < 8 * 1024 * 1024:
                chunk = response.read1(min(65536, 8 * 1024 * 1024 - total))
                if not chunk:
                    parser.feed(decoder.decode(b'', final=True))
                    parser.close()
                    break
                total += len(chunk)
                parser.feed(decoder.decode(chunk))
    meta = parser.values
    identifiers = list(parser.canonical_links)
    if meta.get('og:url'):
        identifiers.append(meta['og:url'])
    pin = parser.pin if isinstance(parser, PinPage) else None
    if (not identifiers and not pin) or any(identity(link) != expected for link in identifiers):
        raise ValueError('分享元数据主帖身份不匹配或缺失')
    if 'Age-restricted' in meta.get('og:description', ''):
        raise ValueError('SESSION_REQUIRED: 接口尚未接入Chrome登录会话；不是用户未登录')
    if any(key.startswith('og:video') for key in meta) or meta.get('og:type','').lower().startswith('video'):
        raise ValueError('VIDEO_RESOLVE_REQUIRED: 请使用reftray_resolve_video，不把视频封面保存为图片')
    images = [meta.get('og:image', '')]
    scope, warning = 'verified_share_image', '当前接口仅确认分享图，不保证完整轮播。'
    if pin:
        if pin.get('isEligibleForImageDownload') is not True or pin.get('isViewerRestricted') is not False or pin.get('isHidden'):
            raise ValueError('当前 Pin 未确认允许下载，未保存')
        if pin.get('isVideo') is not False or any(pin.get(k) for k in ('videos','videoStatus','carouselData','embed','collectionPin')):
            raise ValueError('当前 Pin 含动态、轮播或嵌入内容，未将封面当作完整作品')
        images = [(pin.get('images_orig') or {}).get('url', '')]
        scope, warning = 'verified_pin_image', '已核对 Pin 编号及正文原图。'
        if pin.get('storyPinDataId') or pin.get('storyPinData'):
            story = pin.get('storyPinData') or {}
            pages = story.get('pages') or []
            if story.get('isDeleted') or not 1 <= len(pages) <= 100:
                raise ValueError('未取得完整且可用的故事页，未保存封面')
            images = []
            for page in pages:
                blocks = page.get('blocks') or []
                if not blocks or page.get('ad') or page.get('musicAttributions'):
                    raise ValueError('故事页包含未确认的媒体，未保存封面')
                for block in blocks:
                    if block.get('__typename') != 'StoryPinImageBlock' or len(images) >= 100:
                        raise ValueError('故事包含非静态图片或超出本次上限，未保存封面')
                    images.append((block.get('images_750x') or {}).get('url', ''))
            scope, warning = 'verified_story_images', '已核对当前故事每页的静态图片块，按页面提供的尺寸保存。'
        meta['og:title'] = pin.get('title') or pin.get('seoTitle') or meta.get('og:title', '')
    for image in images:
        parsed = urlsplit(image)
        valid = (parsed.hostname == 'pbs.twimg.com' and parsed.path.startswith('/media/')) if expected[0] == 'x' else (parsed.hostname == 'pinimg.com' or (parsed.hostname or '').endswith('.pinimg.com'))
        if parsed.scheme != 'https' or parsed.username is not None or parsed.password is not None or parsed.port not in (443,None) or not valid:
            raise ValueError('未找到已确认属于原作品的正文媒体；未保存头像或推荐图')
    return {'canonical_url': url, 'platform': expected[0], 'page_title': meta.get('og:title', ''),
            'images': [{'url': image} for image in dict.fromkeys(images)], 'scope': scope, 'warning': warning}
