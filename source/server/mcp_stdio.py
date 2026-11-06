"""Local MCP stdio adapter. No browser automation, credential export or new service."""
import json
import os
import re
import sys
import uuid
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler

if __package__:
    from .media_resolver import canonical as video_post
else:  # Installed MCP clients start this file by path.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from server.media_resolver import canonical as video_post


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('property'):
            self.values[attrs['property']] = attrs.get('content', '')


def identity(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
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


class Backend:
    def __init__(self):
        port = int(os.environ.get('REFTRAY_MCP_PORT', '8766'))
        if not 1 <= port <= 65535:
            raise ValueError('Invalid local port')
        self.base = f'http://127.0.0.1:{port}'
        self.opener = build_opener(ProxyHandler({}))

    def api(self, path, data=None):
        with self.opener.open(self.base + '/health', timeout=5) as response:
            health = json.load(response)
        if path == '/health':
            return {key: value for key, value in health.items() if key != 'settings_token'}
        request = Request(self.base + path,
                          data=json.dumps(data).encode() if data is not None else None,
                          headers={'Content-Type': 'application/json', 'X-Collector-Token': health['settings_token']})
        with self.opener.open(request, timeout=110) as response:
            return json.load(response)

    def download_post(self, url):
        expected = identity(url)
        class SourceRedirect(HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                if identity(newurl) != expected:
                    raise ValueError('网页重定向身份不匹配')
                return super().redirect_request(req, fp, code, msg, headers, newurl)
        with build_opener(SourceRedirect()).open(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=15) as response:
            if identity(response.url) != expected:
                raise ValueError('网页重定向身份不匹配')
            body = response.read(8 * 1024 * 1024 + 1)
        if len(body) > 8 * 1024 * 1024:
            raise ValueError('网页超过解析上限')
        parser = Metadata()
        parser.feed(body.decode('utf-8', 'replace'))
        meta = parser.values
        if identity(meta.get('og:url', '')) != expected:
            raise ValueError('分享元数据主帖身份不匹配或缺失')
        if 'Age-restricted' in meta.get('og:description', ''):
            raise ValueError('SESSION_REQUIRED: 接口尚未接入Chrome登录会话；不是用户未登录')
        if any(key.startswith('og:video') for key in meta):
            raise ValueError('VIDEO_RESOLVE_REQUIRED: 请使用reftray_resolve_video，不把视频封面保存为图片')
        image = meta.get('og:image', '')
        parsed = urlsplit(image)
        valid = (parsed.hostname == 'pbs.twimg.com' and parsed.path.startswith('/media/')) if expected[0] == 'x' else (parsed.hostname == 'pinimg.com' or (parsed.hostname or '').endswith('.pinimg.com'))
        if parsed.scheme != 'https' or not valid:
            raise ValueError('未找到已确认属于原作品的正文媒体；未保存头像或推荐图')
        health = self.api('/health')
        return {**self.api('/collect/start', {
            'canonical_url': url, 'platform': expected[0], 'page_title': meta.get('og:title', ''),
            'collection_mode': 'images', 'images': [{'url': image}], 'ocr_enabled': False,
            'save_directory': health['inbox'], 'capture_scope': 'single', 'capture_kind': 'images',
            'directory_schema': 'function-platform-v2', 'idempotency_key': uuid.uuid4().hex,
            'extraction_warnings': ['当前接口仅确认分享图，不保证完整轮播。'],
        }), 'scope': 'verified_share_image', 'complete_carousel': False}


TOOLS = [
    ('reftray_status', '读取本机后台状态（不返回凭据）', {}),
    ('reftray_download_post', '提交原帖链接并保存已核对身份的分享图片；明确报告尚未接入的登录会话，不保证完整轮播', {'url': {'type': 'string'}}),
    ('reftray_resolve_video', '调用原有视频解析器，保留主帖身份校验', {'url': {'type': 'string'}}),
    ('reftray_download_video', '核对原帖身份并提交一个视频下载；多视频先返回数量，再用 media_index（从1开始）选择，避免并发占用和丢失任务编号', {'url': {'type': 'string'}, 'media_index': {'type': 'integer', 'minimum': 1}}),
    ('reftray_job_status', '读取下载任务结果及实际保存目录', {'job_id': {'type': 'string'}, 'kind': {'type': 'string', 'enum': ['collect', 'video']}}),
]


def dispatch(method, params, backend):
    if method == 'initialize':
        return {'protocolVersion': '2024-11-05', 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'reftray-local', 'version': '0.1.0'}}
    if method == 'ping':
        return {}
    if method == 'tools/list':
        return {'tools': [{'name': name, 'description': description, 'inputSchema': {'type': 'object', 'properties': properties, 'required': [key for key in properties if key != 'media_index'], 'additionalProperties': False}} for name, description, properties in TOOLS]}
    if method != 'tools/call':
        raise ValueError('Unsupported method')
    name, args = params['name'], params.get('arguments', {})
    try:
        if name == 'reftray_status':
            result = backend.api('/health')
        elif name == 'reftray_download_post':
            result = backend.download_post(args['url'])
        elif name == 'reftray_resolve_video':
            url, _ = video_post(args['url'])
            result = backend.api('/media/resolve', {'url': url, 'captions': False})
        elif name == 'reftray_download_video':
            url, platform = video_post(args['url'])
            media = backend.api('/media/resolve', {'url': url, 'captions': False})['media']
            if not media:
                raise ValueError('未解析到原帖视频')
            index = args.get('media_index')
            if index is not None and (isinstance(index, bool) or not isinstance(index, int) or not 1 <= index <= len(media)):
                raise ValueError('media_index 必须在 1 到 '+str(len(media))+' 之间')
            if len(media) > 1 and index is None:
                result = {'status': 'selection_required', 'media_count': len(media), 'jobs': [],
                          'message': '原帖包含多个视频。请用 media_index 选择；本次尚未启动下载。'}
            else:
                health = backend.api('/health')
                source = media[(index or 1) - 1]
                job = backend.api('/video/start', {**source, 'canonical_url': url,
                      'platform': platform, 'save_directory': health['inbox'], 'capture_kind': 'video',
                      'capture_scope': 'single', 'directory_schema': 'function-platform-v2'})
                result = {'jobs': [job], 'media_count': len(media), 'media_index': index or 1}
        elif name == 'reftray_job_status':
            if args['kind'] not in ('collect', 'video') or not re.fullmatch(r'[\w-]{1,100}', args['job_id']):
                raise ValueError('Invalid job')
            result = backend.api('/' + args['kind'] + '/status/' + args['job_id'])
        else:
            raise ValueError('Unknown tool')
        return {'content': [{'type': 'text', 'text': json.dumps(result, ensure_ascii=False)}], 'isError': False}
    except Exception as exc:
        from urllib.error import HTTPError
        message = str(exc)
        if isinstance(exc, HTTPError):
            message = exc.read(4096).decode('utf-8', 'replace')
        return {'content': [{'type': 'text', 'text': message}], 'isError': True}


def main():
    backend = Backend()
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            if 'id' not in request:
                continue
            result = dispatch(request['method'], request.get('params', {}), backend)
            reply = {'jsonrpc': '2.0', 'id': request['id'], 'result': result}
        except Exception as exc:
            reply = {'jsonrpc': '2.0', 'id': request.get('id'), 'error': {'code': -32602, 'message': str(exc)}}
        print(json.dumps(reply, ensure_ascii=True), flush=True)


if __name__ == '__main__':
    main()
