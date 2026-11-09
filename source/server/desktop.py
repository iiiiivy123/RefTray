"""Installer-owned service with an authenticated, idle-only shutdown handshake."""
import os
import secrets
import threading
import time

import uvicorn
from fastapi import Request
from fastapi.responses import JSONResponse
from .app import app


def configure_shutdown(application, stop):
    secret = os.environ.get('COLLECTOR_LAUNCHER_SECRET', '')
    state = {'draining': False, 'requests': 0, 'lease': 0, 'exit_scheduled': False}
    runtime = application.state.runtime

    @application.middleware('http')
    async def upgrade_gate(request: Request, call_next):
        if request.url.path == '/internal/prepare-upgrade':
            if request.method != 'POST' or not secret or not secrets.compare_digest(
                    request.headers.get('X-Launcher-Secret', ''), secret):
                return JSONResponse({'detail': 'Forbidden'}, status_code=403)
            mode = request.query_params.get('mode', '')
            if mode == 'resume' and not state['exit_scheduled']:
                state.update(draining=False, lease=0)
                return JSONResponse({'ready': False, 'resumed': True})
            if mode not in ('', 'wait', 'stop'):
                return JSONResponse({'detail': 'Invalid shutdown mode'}, status_code=422)
            busy = state['requests'] or runtime.busy()
            if busy and not mode:
                return JSONResponse({'detail': '正在采集或处理请求，请选择等待或本篇结束后停止'}, status_code=409)
            state.update(draining=True, lease=time.monotonic() + 30)
            if mode == 'stop':
                runtime.request_stop_all()
            if busy:
                return JSONResponse({'ready': False, 'phase': 'draining', 'mode': mode,
                                     'message': '正在收尾；目录选择窗口请完成或取消'}, status_code=202)
            if not state['exit_scheduled']:
                state['exit_scheduled'] = True
                timer = threading.Timer(.5, stop)
                timer.daemon = True
                timer.start()
            return JSONResponse({'ready': True})
        if state['draining'] and not state['exit_scheduled'] and time.monotonic() > state['lease']:
            state['draining'] = False
        controls = request.url.path.startswith(('/collect/control/', '/video/control/', '/browser/progress/', '/browser/result/', '/browser/control/'))
        if state['draining'] and request.method != 'GET' and not controls and request.url.path != '/tasks':
            return JSONResponse({'detail': '后台正在收尾，请等待更新或取消退出'}, status_code=503)
        if request.url.path == '/health':
            return await call_next(request)
        state['requests'] += 1
        try:
            return await call_next(request)
        finally:
            state['requests'] -= 1


def main():
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1',
        port=int(os.environ.get('LIBLIB_COLLECTOR_PORT', '8766')), access_log=False))
    configure_shutdown(app, lambda: setattr(server, 'should_exit', True))
    server.run()


if __name__ == '__main__':
    main()
