"""Short-lived requests delivered to a paired extension while its panel is open."""
import threading
import time
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from typing import Literal


class BrowserCapture(BaseModel):
    url: str = Field(max_length=4096)
    mode: Literal['images', 'text', 'video'] = 'images'


class BrowserResult(BaseModel):
    status: Literal['completed', 'partial', 'failed']
    message: str = Field(max_length=1000)
    result: dict = Field(default_factory=dict)


def attach(app, authorize, origins, catalog):
    pending = {}
    lock = threading.RLock()

    def persist(item, status, message, result=None):
        catalog.save_task({'id': item['id'], 'source': item['source'],
            'name': 'MCP · Chrome 页面采集', 'mode': 'browser-capture',
            'status': status, 'completed': status in ('completed', 'partial', 'failed'),
            'message': message, 'records': {'result': {'status': status, 'url': item['source'],
                'reason': message, 'result': result or {}}}})

    def paired(request):
        authorize(request)
        if request.headers.get('origin') not in origins:
            raise HTTPException(403, '请通过已配对的 Chrome 扩展接收采集请求')

    def expire():
        now = time.monotonic()
        for key, item in list(pending.items()):
            limit = 14400 if item.get('owner') else 300
            if now - item['created'] > limit:
                persist(item, 'failed', '等待 Chrome 扩展超时，请打开目标页面和采集弹窗后重试')
                del pending[key]

    @app.post('/browser/capture')
    def submit(value: BrowserCapture, request: Request):
        authorize(request)
        parsed = urlsplit(value.url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            raise HTTPException(422, '请提供已在 Chrome 打开的网页链接')
        with lock:
            expire()
            if len(pending) >= 20:
                raise HTTPException(409, '等待 Chrome 的任务过多，请先处理现有请求')
            item = {'id': uuid4().hex, 'url': value.url, 'mode': value.mode,
                    'source': urlunsplit((parsed.scheme, parsed.netloc, parsed.path, '', '')),
                    'created': time.monotonic()}
            persist(item, 'running', '等待 Chrome。请保持目标页面和灵感采集弹窗打开')
            pending[item['id']] = item
            return {'job_id': item['id'], 'kind': 'task', 'status': 'waiting_browser',
                    'message': '请在目标 Chrome 页面打开灵感采集弹窗，扩展将使用该页面采集'}

    @app.post('/browser/claim')
    def claim(request: Request):
        paired(request)
        with lock:
            expire()
            # One claimed request at a time protects the extension's task state.
            if any(item.get('owner') for item in pending.values()):
                return {'item': None}
            item = next(iter(pending.values()), None)
            if item:
                item['owner'] = request.headers['origin']
                item['created'] = time.monotonic()
                return {'item': {key: item[key] for key in ('id', 'url', 'mode')}}
            return {'item': None}

    @app.post('/browser/result/{identity}')
    def finish(identity: str, value: BrowserResult, request: Request):
        paired(request)
        with lock:
            item = pending.get(identity)
            if not item or item.get('owner') != request.headers['origin']:
                raise HTTPException(409, '浏览器请求已失效或由其他扩展接收')
            if len(str(value.result)) > 100000:
                raise HTTPException(422, '浏览器结果过大')
            persist(item, value.status, value.message, value.result)
            del pending[identity]
            return {'ok': True}
