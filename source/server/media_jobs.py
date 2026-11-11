"""Short HTTP requests for slow media discovery in a Chrome worker."""
import threading
import time
from uuid import uuid4
from types import SimpleNamespace
from fastapi import HTTPException, Request


def attach(app, authorize, model, resolve):
    jobs = {}
    stops = {}
    lock = threading.Lock()
    active_states = ('running', 'stopping')

    def busy():
        with lock:
            return any(j['status'] in active_states for j in jobs.values())

    def stop(key):
        with lock:
            if key not in jobs:
                raise HTTPException(404, '视频读取任务已失效，请重试')
            if jobs[key]['status'] in active_states:
                stops[key].set()
                jobs[key]['status'] = 'stopping'
            return dict(jobs[key])

    def stop_all():
        with lock:
            for key, job in jobs.items():
                if job['status'] in active_states:
                    stops[key].set()
                    job['status'] = 'stopping'

    def run(key, value, propagate=False):
        caught = None
        def checkpoint():
            if stops[key].is_set():
                raise ValueError('USER_STOPPED')
        try:
            checkpoint()
            result = resolve(value, checkpoint=checkpoint)
            checkpoint()
            update = {'status': 'completed', 'result': result}
        except Exception as error:
            caught = error
            update = {'status': 'failed', 'message': str(error)}
        with lock:
            stopped = stops[key].is_set()
            if stopped:
                update = {'status': 'stopped', 'message': '视频读取已停止'}
            jobs[key].update(update, finished=time.monotonic())
        if propagate:
            if stopped:
                raise ValueError('USER_STOPPED')
            if caught:
                raise caught
            return result

    def allocate():
        with lock:
            now = time.monotonic()
            for key in list(jobs):
                if jobs[key].get('finished', now) < now - 600:
                    del jobs[key]
                    stops.pop(key, None)
            finished = [key for key, job in jobs.items() if job['status'] not in active_states]
            for key in finished[:max(0, len(jobs)-39)]:
                del jobs[key]
                stops.pop(key, None)
            if sum(j['status'] in active_states for j in jobs.values()) >= 2:
                raise HTTPException(409, '正在读取其他视频，请稍后重试')
            key = uuid4().hex
            jobs[key] = {'status': 'running'}
            stops[key] = threading.Event()
            return key

    # Legacy synchronous callers use the same busy/cancellation owner.
    def resolve_sync(value):
        return run(allocate(), value, propagate=True)

    # The request model is supplied by the existing resolver route.
    def start(value, request: Request):
        authorize(request)
        key = allocate()
        threading.Thread(target=run, args=(key, value), daemon=True).start()
        return {'job_id': key}

    start.__annotations__['value'] = model
    app.post('/media/resolve/start')(start)

    @app.get('/media/resolve/status/{key}')
    def status(key: str, request: Request):
        authorize(request)
        with lock:
            if key not in jobs:
                raise HTTPException(404, '视频读取任务已失效，请重试')
            return dict(jobs[key])

    @app.post('/media/resolve/stop/{key}')
    def cancel(key: str, request: Request):
        authorize(request)
        return stop(key)

    return SimpleNamespace(busy=busy, stop=stop, stop_all=stop_all, resolve=resolve_sync)
