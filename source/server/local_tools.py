"""User-started local post-processing; independent of webpage media extraction."""
import os
import re
import tempfile
import threading
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException, Request


def attach(app, settings, authorize):
    jobs = {}
    gate = threading.Lock()
    cancel = threading.Event()
    state_lock = threading.Lock()
    stop_requests = {}

    @app.post('/tools/media')
    async def start(request: Request, format: str, name: str = 'video'):
        authorize(request)
        if format not in ('gif', 'audio'):
            raise HTTPException(422, '请选择视频转GIF或提取音频')
        if not gate.acquire(blocking=False):
            raise HTTPException(409, '已有本地加工任务，请等待完成')
        cancel.clear()
        temporary = tempfile.TemporaryDirectory(prefix='reftray-local-')
        source = Path(temporary.name) / 'source.bin'
        try:
            size = 0
            with source.open('xb') as output:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > 512 * 1024 * 1024:
                        raise HTTPException(413, '本地加工文件上限为512 MB')
                    output.write(chunk)
            if not size:
                raise HTTPException(422, '请选择非空视频文件')
            key = uuid4().hex
            stem = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', Path(name).stem).strip(' .')[:100] or 'video'
            directory = settings().inbox / '加工结果'
            directory.mkdir(parents=True, exist_ok=True)
            target = directory / (stem + '_' + key[:8] + ('.gif' if format == 'gif' else '.m4a'))
            for old in list(jobs):
                if len(jobs) < 20: break
                if jobs[old]['status'] in ('completed', 'failed', 'stopped'): jobs.pop(old)
            job = jobs[key] = {'status': 'processing', 'message': '正在转换GIF…' if format == 'gif' else '正在提取音频…'}
            with state_lock:
                stop_requests[key] = requested = threading.Event()
        except BaseException:
            temporary.cleanup()
            gate.release()
            raise

        def run():
            def checkpoint():
                if cancel.is_set() or requested.is_set(): raise InterruptedError('加工已停止，原文件保留')
            try:
                if format == 'gif':
                    from .gif_media import convert
                    convert(source, target, checkpoint, min_free_mb=0)
                else:
                    from .media_output import transform
                    transform(source, target, SimpleNamespace(output_format='audio', trim_start=0, trim_end=0), checkpoint)
                with state_lock:
                    checkpoint()
                    job.update(status='completed', message='加工完成，原文件保留', path=str(target), bytes=target.stat().st_size)
            except Exception as error:
                target.unlink(missing_ok=True)
                with state_lock:
                    job.update(status='stopped' if isinstance(error, InterruptedError) else 'failed', message=str(error))
            finally:
                with state_lock:
                    stop_requests.pop(key, None)
                temporary.cleanup()
                gate.release()
        threading.Thread(target=run, daemon=True).start()
        return {'job_id': key}

    @app.get('/tools/media/{job_id}')
    def state(job_id: str, request: Request):
        authorize(request)
        if job_id not in jobs: raise HTTPException(404, '加工任务不存在或后台已重启')
        return dict(jobs[job_id])

    @app.post('/tools/media/{job_id}/stop')
    def stop(job_id: str, request: Request):
        authorize(request)
        with state_lock:
            job = jobs.get(job_id)
            if not job: raise HTTPException(404, '加工任务不存在或后台已重启')
            if job['status'] == 'processing':
                stop_requests[job_id].set()
                job.update(status='stopping', message='正在停止并清理本次加工…')
            return dict(job)

    @app.post('/tools/media/{job_id}/open')
    def open_result(job_id: str, request: Request):
        authorize(request)
        job = jobs.get(job_id)
        if not job or job['status'] != 'completed': raise HTTPException(404, '尚无加工结果')
        os.startfile(str(Path(job['path']).parent))
        return {'ok': True}

    return gate.locked, cancel.set
