"""Durable browser requests, bounded leases, and one paired extension executor."""
import threading
import time
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4
from typing import Literal
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from .capture_request import CaptureOptions, snapshot
from .diagnostics import redact

class BrowserCapture(BaseModel):
    model_config = ConfigDict(extra='forbid')
    url: str = Field(min_length=1, max_length=4096)
    mode: Literal['images', 'text', 'plain', 'video'] = 'images'
    scope: Literal['single', 'author', 'board'] = 'single'
    operation: Literal['capture', 'preview', 'scan'] = 'capture'
    options: CaptureOptions = Field(default_factory=CaptureOptions)

class Client(BaseModel):
    client_id: str = Field(pattern=r'^[\w-]{1,100}$')
    release: str = Field(max_length=32)

class Update(Client):
    child_id: str | None = Field(default=None, max_length=100)
    backend_job: dict | None = None
    progress: dict = Field(default_factory=dict)

class BrowserResult(Update):
    status: Literal['completed', 'partial', 'failed', 'stopped', 'interrupted']
    message: str = Field(max_length=1000)
    result: dict = Field(default_factory=dict)

class Control(BaseModel):
    action: Literal['pause', 'resume', 'stop', 'retry']

def attach(app, authorize, origins, catalog, release, stop_child):
    pending, clients = {}, {}
    lock = threading.RLock()
    terminal = {'completed', 'partial', 'failed', 'stopped', 'interrupted'}

    def clean_url(url):
        p = urlsplit(url)
        query = '&'.join(x for x in p.query.split('&') if x.split('=')[0] in ('p', 'v', 'list'))
        return urlunsplit((p.scheme, p.netloc, p.path, query, ''))

    def persist(item, **updates):
        prior = catalog.get_task(item['id']) or {}
        prior.pop('revision', None)
        return catalog.save_task({**prior, **updates, 'id': item['id']})

    def paired(request, value):
        authorize(request)
        origin = request.headers.get('origin')
        if origin not in origins:
            raise HTTPException(403, '请通过已配对的 Chrome 扩展接收采集请求')
        clients[(origin, value.client_id)] = {'release': value.release, 'seen': time.time()}
        if value.release != release:
            raise HTTPException(409, f'扩展 {value.release} 与后台 {release} 版本不同，请重新加载扩展')
        return origin, value.client_id

    def expire():
        with lock:
            now = time.time()
            for key, item in list(pending.items()):
                owned = bool(item.get('owner'))
                if not owned and item['control'] == 'paused':
                    continue
                last_contact = max((c['seen'] for c in clients.values() if c['release'] == release), default=item['created'])
                last_seen = item.get('seen', max(item['created'], last_contact))
                if now - last_seen > (90 if owned else 300):
                    message = 'Chrome 执行连接中断，已保存内容保留，可继续任务' if owned else 'Chrome 扩展未接单，请确认 Chrome 已运行且扩展已加载'
                    persist(item, status='interrupted' if owned else 'failed', completed=False, message=message)
                    if owned:
                        stop_child((catalog.get_task(key) or {}).get('backend_job'))
                    del pending[key]

    def enqueue(value, previous=None, checkpoint=None):
        p = urlsplit(value.url)
        if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
            raise HTTPException(422, '请提供普通网页链接')
        expire()
        if len(pending) >= 20:
            raise HTTPException(409, '等待 Chrome 的任务已满')
        request = value.model_dump()
        request['options'] = snapshot(catalog.defaults(), value.options.model_dump(exclude_unset=True))
        item = {'id': uuid4().hex, 'request': request, 'created': time.time(), 'control': 'running'}
        if checkpoint:
            item['checkpoint'] = checkpoint
        persist(item, source=clean_url(value.url), name='MCP · Chrome 采集', mode='browser-capture',
                status='waiting_browser', completed=False, message='已排队，等待 Chrome 后台接单',
                request={**request, 'url': clean_url(value.url)}, records={}, previous_id=previous)
        pending[item['id']] = item
        return {'job_id': item['id'], 'kind': 'task', 'status': 'waiting_browser',
                'message': '已排队，Chrome 扩展将在后台执行，无需打开弹窗'}

    @app.post('/browser/capture')
    def submit(value: BrowserCapture, request: Request):
        authorize(request)
        with lock:
            return enqueue(value)

    @app.get('/browser/status')
    def status(request: Request):
        authorize(request)
        expire()
        with lock:
            now = time.time()
            connected = [v for v in clients.values() if now-v['seen'] < 75]
            return {'ready': any(v['release'] == release for v in connected), 'backend_release': release,
                    'extensions': [{'release': v['release'], 'seconds_ago': round(now-v['seen'])} for v in connected],
                    'waiting': sum(not i.get('owner') for i in pending.values()),
                    'running': [i['id'] for i in pending.values() if i.get('owner')]}

    @app.post('/browser/claim')
    def claim(value: Client, request: Request):
        with lock:
            owner = paired(request, value)
            expire()
            if any(item.get('owner') for item in pending.values()):
                return {'item': None}
            item = next((i for i in pending.values() if i['control'] == 'running'), None)
            if not item:
                return {'item': None}
            item.update(owner=owner, seen=time.time())
            persist(item, status='running', message='Chrome 已接单', executor=list(owner))
            return {'item': {k: v for k, v in item.items() if k in ('id', 'request', 'checkpoint')}}

    def owned(identity, value, request):
        owner = paired(request, value)
        item = pending.get(identity)
        if not item or item.get('owner') != owner:
            raise HTTPException(409, '浏览器任务已中断或由其他 Chrome 接收')
        item['seen'] = time.time()
        return item

    @app.post('/browser/progress/{identity}')
    def progress(identity: str, value: Update, request: Request):
        with lock:
            item = owned(identity, value, request)
            keys = ('percent', 'stage', 'done', 'total', 'bytes', 'current', 'unit', 'batch')
            compact = {k: v for k, v in value.progress.items() if k in keys}
            if len(str(compact)) > 12000:
                raise HTTPException(422, '进度内容过大')
            if 'message' in value.progress:
                compact['message'] = redact(value.progress['message'])[:1000]
            state = {'running': 'running', 'paused': 'paused', 'stopped': 'stopping'}[item['control']]
            job = value.backend_job or {}
            if job and (job.get('kind') not in ('collect', 'video', 'resolve') or not isinstance(job.get('jobId'), str) or len(job['jobId']) > 100):
                raise HTTPException(422, '无效的后台任务编号')
            persist(item, status=state, progress=compact, child_id=value.child_id,
                    backend_job={k: job[k] for k in ('kind', 'jobId') if k in job})
            return {'action': item['control']}

    @app.post('/browser/result/{identity}')
    def finish(identity: str, value: BrowserResult, request: Request):
        with lock:
            owner = paired(request, value)
            record = catalog.get_task(identity)
            if identity not in pending and record and record.get('executor') == list(owner):
                if record.get('status') in ('completed', 'partial', 'failed', 'stopped'):
                    return {'ok': True}
                if record.get('status') != 'interrupted':
                    raise HTTPException(409, '任务已结束')
                item = {'id': identity}
            else:
                item = owned(identity, value, request)
            result = dict(value.result)
            # Batch already stores each work in its child task. Bound its duplicated
            # aggregate log so a long failure list cannot block result delivery.
            if isinstance(result.get('details'), str) and len(result['details']) > 60000:
                result['details'] = result['details'][:60000]
                result['details_truncated'] = True
            if len(str(result)) > 100000:
                raise HTTPException(422, '浏览器结果过大')
            record = catalog.get_task(identity)
            message = redact(value.message)[:1000]
            persist(item, status=value.status, completed=value.status in ('completed', 'partial', 'failed'),
                    message=message, child_id=value.child_id or record.get('child_id'),
                    directory=result.get('directory'),
                    records={'result': {'status': value.status, 'url': record['source'], 'reason': message,
                                        'result': result}})
            pending.pop(identity, None)
            return {'ok': True}

    @app.post('/browser/control/{identity}')
    def control(identity: str, value: Control, request: Request):
        authorize(request)
        with lock:
            expire()
            record = catalog.get_task(identity)
            if not record or record.get('mode') != 'browser-capture':
                raise HTTPException(404, 'Chrome 采集任务不存在')
            item = pending.get(identity)
            if item:
                if value.action == 'retry':
                    raise HTTPException(409, '任务仍在执行，请先停止')
                item['control'] = {'pause': 'paused', 'resume': 'running', 'stop': 'stopped'}[value.action]
                state = {'pause': 'paused', 'resume': 'running' if item.get('owner') else 'waiting_browser', 'stop': 'stopping' if item.get('owner') else 'stopped'}[value.action]
                persist(item, status=state, message={'pause': '已请求暂停', 'resume': '继续执行', 'stop': '已请求停止'}[value.action])
                if value.action == 'stop':
                    stop_child(record.get('backend_job'))
                    if not item.get('owner'):
                        del pending[identity]
                return {'job_id': identity, 'kind': 'task', 'status': state}
            if value.action not in ('retry', 'resume') or record.get('status') not in terminal:
                raise HTTPException(409, '此任务当前不能执行该操作')
            if not record.get('request'):
                raise HTTPException(409, '旧任务缺少请求参数，请重新提交链接')
            checkpoint = catalog.get_task(record.get('child_id') or '')
            if checkpoint and 'queue' in checkpoint and 'options' in checkpoint:
                checkpoint = {**checkpoint, 'completed': False}
                if value.action == 'retry':
                    failed = [k for k, r in checkpoint.get('records', {}).items() if r.get('status') in ('failed', 'partial', 'pending')]
                    if not failed:
                        raise HTTPException(409, '没有需要重试的失败作品')
                    checkpoint['retryKeys'] = failed
                    checkpoint['records'] = {k: {**r, 'status': 'pending'} if k in failed else r for k, r in checkpoint['records'].items()}
            else:
                checkpoint = None
            return enqueue(BrowserCapture.model_validate(record['request']), identity, checkpoint)

    def busy():
        expire()
        return bool(pending)

    def stop_all():
        with lock:
            for item in list(pending.values()):
                item['control'] = 'stopped'
                record = catalog.get_task(item['id'])
                stop_child(record.get('backend_job'))
                persist(item, status='stopping' if item.get('owner') else 'stopped', message='正在退出，已停止接单')
                if not item.get('owner'):
                    pending.pop(item['id'], None)

    from types import SimpleNamespace
    app.state.browser_bridge = SimpleNamespace(expire=expire, busy=busy, stop_all=stop_all)
