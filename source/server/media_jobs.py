"""Short HTTP requests for slow media discovery in a Chrome worker."""
import threading
import time
from uuid import uuid4
from fastapi import HTTPException, Request


def attach(app, authorize, model, resolve):
    jobs = {}
    lock = threading.Lock()

    def busy():
        with lock:
            return any(j['status'] == 'running' for j in jobs.values())

    def run(key, value):
        try:
            result = resolve(value)
            update = {'status': 'completed', 'result': result}
        except Exception as error:
            update = {'status': 'failed', 'message': str(error)}
        with lock:
            jobs[key].update(update, finished=time.monotonic())

    # The request model is supplied by the existing resolver route.
    def start(value, request: Request):
        authorize(request)
        with lock:
            now = time.monotonic()
            for key in list(jobs):
                if jobs[key].get('finished', now) < now - 600:
                    del jobs[key]
            finished = [key for key, job in jobs.items() if job['status'] != 'running']
            for key in finished[:max(0, len(jobs)-39)]:
                del jobs[key]
            if sum(j['status'] == 'running' for j in jobs.values()) >= 2:
                raise HTTPException(409, '正在读取其他视频，请稍后重试')
            key = uuid4().hex
            jobs[key] = {'status': 'running'}
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

    return busy
