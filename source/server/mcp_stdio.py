"""Local MCP adapter for public downloads and paired Chrome capture."""
import json
import os
import re
import sys
import uuid
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler

if __package__:
    from .public_post import identity, resolve_post
    from .source_identity import canonical as video_post
else:  # Installed MCP clients start this file by path.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from server.public_post import identity, resolve_post
    from server.source_identity import canonical as video_post

from server import mcp_tools


class Backend:
    def process_local(self, path, format):
        from urllib.parse import urlencode
        source = Path(path)
        if format not in ('gif', 'audio') or not source.is_absolute() or not source.is_file():
            raise ValueError('请选择本地视频文件和输出格式')
        if source.suffix.lower() not in ('.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'):
            raise ValueError('请选择视频文件')
        size = source.stat().st_size
        if not 0 < size <= 512 * 1024 * 1024:
            raise ValueError('本地视频须为非空文件且不超过 512 MB')
        with self.opener.open(self.base+'/health', timeout=5) as response:
            token = json.load(response)['settings_token']
        with source.open('rb') as body:
            request = Request(self.base+'/tools/media?'+urlencode({'format':format, 'name':source.name}),
                              data=body, headers={'X-Collector-Token':token, 'Content-Type':'application/octet-stream',
                                                 'Content-Length':str(size)})
            with self.opener.open(request, timeout=110) as response:
                return {**json.load(response), 'kind':'local'}

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
        resolved = resolve_post(url)
        scope = resolved.pop('scope')
        warning = resolved.pop('warning')
        health = self.api('/health')
        job = self.api('/collect/start', {
            **resolved, 'collection_mode': 'images', 'ocr_enabled': False,
            'save_directory': health['inbox'], 'capture_scope': 'single', 'capture_kind': 'images',
            'directory_schema': 'function-platform-v3', 'idempotency_key': uuid.uuid4().hex,
            'extraction_warnings': [warning],
        })
        return {**job, 'scope': scope, 'warning': warning, 'complete_carousel': False}


TOOLS = [
    ('reftray_status', '读取本机后台状态（不返回凭据）', {}),
    ('reftray_download_post', '提交原帖链接并保存已核对身份的公开图片（Instagram 静态轮播、Pin 原图、静态故事图片或分享图）；明确报告尚未接入的登录会话，不保证完整轮播', {'url': {'type': 'string'}}),
    ('reftray_capture_browser', '在已配对的 Chrome 后台自动打开或复用网页并采集；支持登录页面、图文、评论、GIF、视频，无需打开弹窗；未传参数使用设置默认值', mcp_tools.CAPTURE),
    ('reftray_download_videos', '将原帖全部视频交给后台顺序下载，返回持久任务号；失败保留各项结果', {'url': {'type': 'string'}}),
    ('reftray_stop_queue', '停止指定的视频下载队列，已保存文件保留', {'job_id': {'type':'string'}}),
    ('reftray_find_saved', '核对当前作品在素材库的实际文件和采集范围，可查浏览器扩展已保存的各平台作品', {'url': {'type':'string'}}),
    ('reftray_resolve_video', '下载前预览视频数量和画质；普通下载会自动解析，无需先调用此工具', {'url': {'type': 'string'}}),
    ('reftray_download_video', '核对原帖身份并提交一个视频下载；多视频先返回数量，再用 media_index（从1开始）选择，避免并发占用和丢失任务编号', {'url': {'type': 'string'}, 'media_index': {'type': 'integer', 'minimum': 1}}),
    ('reftray_job_status', '读取下载任务结果及实际保存目录', {'job_id': {'type': 'string'}, 'kind': {'type': 'string', 'enum': ['collect', 'video', 'task', 'local']}}),
]

TOOLS += mcp_tools.TOOLS

def dispatch(method, params, backend):
    if method == 'initialize':
        return {'protocolVersion': '2024-11-05', 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'reftray-local', 'version': '0.1.0'}}
    if method == 'ping':
        return {}
    if method == 'tools/list':
        return {'tools': [{'name': name, 'description': description, 'inputSchema': {'type': 'object', 'properties': properties, 'required': mcp_tools.REQUIRED[name], 'additionalProperties': False}} for name, description, properties in TOOLS]}
    if method != 'tools/call':
        raise ValueError('Unsupported method')
    name, args = params['name'], params.get('arguments', {})
    try:
        if name == 'reftray_status':
            result = {**backend.api('/health'), 'browser':backend.api('/browser/status')}
        elif name in ('reftray_capture_browser', *[tool[0] for tool in mcp_tools.TOOLS]):
            result = mcp_tools.extra_dispatch(name, args, backend)
        elif name == 'reftray_download_videos':
            url, _ = video_post(args['url'])
            result = backend.api('/video/queue', {'url': url})
        elif name == 'reftray_stop_queue':
            if not re.fullmatch(r'[a-f0-9]{32}', args['job_id']):
                raise ValueError('无效的队列编号')
            result = backend.api('/video/queue/'+args['job_id']+'/stop', {})
        elif name == 'reftray_find_saved':
            item = backend.api('/history/lookup', {'url':args['url'], 'required':[]}).get('item')
            result = ({'status':'verified_local', **{key:item[key] for key in ('directory','files','coverage','platform')}}
                      if item else {'status':'no_verified_local_capture', 'files':[]})
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
                      'capture_scope': 'single', 'directory_schema': 'function-platform-v3'})
                result = {'jobs': [job], 'media_count': len(media), 'media_index': index or 1}
        elif name == 'reftray_job_status':
            if args['kind'] not in ('collect', 'video', 'task', 'local') or not re.fullmatch(r'[\w-]{1,100}', args['job_id']):
                raise ValueError('Invalid job')
            result = backend.api('/tasks/' + args['job_id'] if args['kind'] == 'task' else '/tools/media/'+args['job_id'] if args['kind']=='local' else '/' + args['kind'] + '/status/' + args['job_id'])
        else:
            raise ValueError('Unknown tool')
        return {'content': [{'type': 'text', 'text': json.dumps(result, ensure_ascii=False)}], 'isError': False}
    except Exception as exc:
        from urllib.error import HTTPError
        message = str(exc)
        if isinstance(exc, HTTPError):
            message = exc.read(4096).decode('utf-8', 'replace')
        if name in ('reftray_download_post', 'reftray_download_video', 'reftray_download_videos', 'reftray_capture_browser', 'reftray_capture_batch'):
            # Keep only an allowlisted work identity; share tokens and signed media URLs
            # must never enter the user-visible task journal.
            task_id = uuid.uuid4().hex
            try:
                if name in ('reftray_capture_browser', 'reftray_capture_batch'):
                    from urllib.parse import urlsplit, urlunsplit
                    parsed = urlsplit(args['url'])
                    source, platform = urlunsplit((parsed.scheme, parsed.hostname or '', parsed.path, '', '')), 'browser'
                elif name == 'reftray_download_post':
                    platform, post_id = identity(args['url'])
                    source = {'pinterest':'https://www.pinterest.com/pin/', 'instagram':'https://www.instagram.com/p/', 'x':'https://x.com/i/status/'}[platform] + post_id
                else:
                    source, platform = video_post(args['url'])
            except (KeyError, TypeError, ValueError):
                source, platform = '', ''
            stage = '提交 Chrome 采集' if name == 'reftray_capture_browser' else '提交图片采集' if name == 'reftray_download_post' else '提交视频下载'
            reason = re.sub(r'https?://[^\s\"<>]+', '[链接已省略]', message)[:500]
            try:
                backend.api('/tasks', {'id': task_id, 'data': {
                    'source': source, 'platform': platform, 'name': 'MCP · ' + stage,
                    'status': 'failed', 'completed': True, 'mode': 'current',
                    'records': {'result': {'url': source, 'status': 'failed', 'reason': stage + '失败（' + type(exc).__name__ + '），详见当次接口回执。'}},
                }})
                message = reason + '\n任务记录：' + task_id + '（kind=task）'
            except Exception:
                message = reason + '\n本机后台未确认写入失败记录。'
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
