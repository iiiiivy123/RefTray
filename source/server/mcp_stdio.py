"""Local MCP stdio adapter. No browser automation, credential export or new service."""
import json
import os
import re
import sys
import uuid
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler

if __package__:
    from .public_post import identity, resolve_post
    from .media_resolver import canonical as video_post
else:  # Installed MCP clients start this file by path.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from server.public_post import identity, resolve_post
    from server.media_resolver import canonical as video_post


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
        resolved = resolve_post(url)
        scope = resolved.pop('scope')
        warning = resolved.pop('warning')
        health = self.api('/health')
        job = self.api('/collect/start', {
            **resolved, 'collection_mode': 'images', 'ocr_enabled': False,
            'save_directory': health['inbox'], 'capture_scope': 'single', 'capture_kind': 'images',
            'directory_schema': 'function-platform-v2', 'idempotency_key': uuid.uuid4().hex,
            'extraction_warnings': [warning],
        })
        return {**job, 'scope': scope, 'warning': warning, 'complete_carousel': False}


TOOLS = [
    ('reftray_status', '读取本机后台状态（不返回凭据）', {}),
    ('reftray_download_post', '提交原帖链接并保存已核对身份的公开图片（Pin 原图、静态故事图片或分享图）；明确报告尚未接入的登录会话，不保证完整轮播', {'url': {'type': 'string'}}),
    ('reftray_find_saved', '核对当前作品在素材库的实际文件和采集范围，可查浏览器扩展已保存的各平台作品', {'url': {'type':'string'}}),
    ('reftray_resolve_video', '调用原有视频解析器，保留主帖身份校验', {'url': {'type': 'string'}}),
    ('reftray_download_video', '核对原帖身份并提交一个视频下载；多视频先返回数量，再用 media_index（从1开始）选择，避免并发占用和丢失任务编号', {'url': {'type': 'string'}, 'media_index': {'type': 'integer', 'minimum': 1}}),
    ('reftray_job_status', '读取下载任务结果及实际保存目录', {'job_id': {'type': 'string'}, 'kind': {'type': 'string', 'enum': ['collect', 'video', 'task']}}),
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
                      'capture_scope': 'single', 'directory_schema': 'function-platform-v2'})
                result = {'jobs': [job], 'media_count': len(media), 'media_index': index or 1}
        elif name == 'reftray_job_status':
            if args['kind'] not in ('collect', 'video', 'task') or not re.fullmatch(r'[\w-]{1,100}', args['job_id']):
                raise ValueError('Invalid job')
            result = backend.api('/tasks/' + args['job_id'] if args['kind'] == 'task' else '/' + args['kind'] + '/status/' + args['job_id'])
        else:
            raise ValueError('Unknown tool')
        return {'content': [{'type': 'text', 'text': json.dumps(result, ensure_ascii=False)}], 'isError': False}
    except Exception as exc:
        from urllib.error import HTTPError
        message = str(exc)
        if isinstance(exc, HTTPError):
            message = exc.read(4096).decode('utf-8', 'replace')
        if name in ('reftray_download_post', 'reftray_download_video'):
            # Keep only an allowlisted work identity; share tokens and signed media URLs
            # must never enter the user-visible task journal.
            task_id = uuid.uuid4().hex
            try:
                if name == 'reftray_download_post':
                    platform, post_id = identity(args['url'])
                    source = ('https://www.pinterest.com/pin/' if platform == 'pinterest' else 'https://x.com/i/status/') + post_id
                else:
                    source, platform = video_post(args['url'])
            except (KeyError, TypeError, ValueError):
                source, platform = '', ''
            stage = '提交图片采集' if name == 'reftray_download_post' else '提交视频下载'
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
