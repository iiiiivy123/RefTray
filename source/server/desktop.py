"""Installer-owned service with an authenticated, idle-only shutdown handshake."""
import os
import secrets
import threading

import uvicorn
from fastapi import Request
from fastapi.responses import JSONResponse
from .app import app, active_urls, videos, folder_requests


def configure_shutdown(application, stop):
    secret = os.environ.get('COLLECTOR_LAUNCHER_SECRET', '')
    state = {'draining': False, 'requests': 0}

    @application.middleware('http')
    async def upgrade_gate(request: Request, call_next):
        if request.url.path == '/internal/prepare-upgrade':
            if request.method != 'POST' or not secret or not secrets.compare_digest(
                    request.headers.get('X-Launcher-Secret', ''), secret):
                return JSONResponse({'detail': 'Forbidden'}, status_code=403)
            if (state['requests'] or active_urls or videos.busy()
                    or any(item.get('state') == 'pending' for item in folder_requests.values())):
                return JSONResponse({'detail': '正在采集或处理请求，请结束任务后重试'}, status_code=409)
            if not state['draining']:
                state['draining'] = True
                timer = threading.Timer(.5, stop)
                timer.daemon = True
                timer.start()
            return JSONResponse({'ready': True})
        if state['draining'] and request.url.path != '/health':
            return JSONResponse({'detail': '后台正在退出，请等待更新完成'}, status_code=503)
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
