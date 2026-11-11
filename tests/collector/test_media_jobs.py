import threading
import unittest
from fastapi import FastAPI
from pydantic import BaseModel
from starlette.requests import Request
from server.media_jobs import attach


class Input(BaseModel):
    url: str


class MediaJobTests(unittest.TestCase):
    def test_application_shutdown_stops_both_sync_and_async_discovery(self):
        import tempfile, time
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import patch
        from fastapi import HTTPException
        from server.app import create_app
        from server.config import Settings
        from server.catalog import Catalog
        from server.video import VideoDownloads
        entered=threading.Event(); escape=threading.Event()
        def slow(*args, checkpoint=lambda: None):
            entered.set()
            while not escape.wait(.01): checkpoint()
            return {'media': []}
        with tempfile.TemporaryDirectory() as folder:
            settings=Settings(Path(folder));catalog=Catalog(settings.root)
            runtime=SimpleNamespace(settings=settings,storage=SimpleNamespace(catalog=catalog),videos=VideoDownloads(catalog))
            with patch('server.media_resolver.resolve',side_effect=slow):
                app=create_app(runtime)
                routes={r.path:r.endpoint for r in app.routes}
                token=routes['/health'](Request({'type':'http','method':'GET','query_string':b'','headers':[]}))['settings_token']
                request=Request({'type':'http','headers':[(b'x-collector-token',token.encode())]})
                start=routes['/media/resolve/start']
                payload=start.__annotations__['value'](url='https://x.com/example/status/123',captions=False)
                try:
                    key=start(payload,request)['job_id']
                    self.assertTrue(entered.wait(1));self.assertTrue(app.state.runtime.busy())
                    app.state.runtime.request_stop_all()
                    for _ in range(100):
                        result=routes['/media/resolve/status/{key}'](key,request)
                        if result['status']=='stopped':break
                        time.sleep(.01)
                    self.assertEqual(result['status'],'stopped');self.assertFalse(app.state.runtime.busy())
                    entered.clear();responses=[]
                    def call_sync():
                        try:routes['/media/resolve'](payload,request)
                        except HTTPException as error:responses.append(error)
                    worker=threading.Thread(target=call_sync)
                    worker.start();self.assertTrue(entered.wait(1));self.assertTrue(app.state.runtime.busy())
                    app.state.runtime.request_stop_all();worker.join(3)
                    self.assertFalse(worker.is_alive());self.assertEqual(responses[0].status_code,422)
                    self.assertFalse(app.state.runtime.busy())
                finally:escape.set()

    def test_cancel_kills_and_reaps_real_resolver_process(self):
        import os, sys, time, subprocess
        from unittest.mock import patch
        from server.media_resolver import run_worker
        processes=[]; original=subprocess.Popen; calls=0
        def launch(*args, **kw):
            process=original(*args, **kw); processes.append(process); return process
        def checkpoint():
            nonlocal calls
            calls+=1
            if calls>=3: raise ValueError('USER_STOPPED')
        started=time.monotonic()
        with patch('server.media_resolver.subprocess.Popen', side_effect=launch):
            with self.assertRaisesRegex(ValueError,'USER_STOPPED'):
                run_worker([sys.executable,'-c','import time; time.sleep(30)'],os.environ.copy(),checkpoint)
        self.assertLess(time.monotonic()-started,3)
        self.assertEqual(len(processes),1); self.assertIsNotNone(processes[0].poll())

    def test_stopping_resolver_keeps_busy_until_worker_acknowledges(self):
        app = FastAPI(); entered = threading.Event(); stopped = threading.Event(); release = threading.Event()
        def resolve(value, checkpoint=lambda: None):
            entered.set()
            try:
                while not release.wait(.01):
                    checkpoint()
            except ValueError:
                stopped.set(); release.wait(2)
                raise
            return {'media': []}
        handle = attach(app, lambda r: None, Input, resolve)
        routes = {r.path:r.endpoint for r in app.routes}
        request = Request({'type':'http','headers':[]})
        key = routes['/media/resolve/start'](Input(url='post'),request)['job_id']
        try:
            self.assertTrue(entered.wait(1))
            handle.stop_all()
            self.assertTrue(stopped.wait(1))
            self.assertTrue(handle.busy())
            self.assertEqual(routes['/media/resolve/status/{key}'](key,request)['status'],'stopping')
        finally:
            release.set()
        import time
        for _ in range(100):
            if not handle.busy(): break
            time.sleep(.01)
        self.assertFalse(handle.busy())
        self.assertEqual(routes['/media/resolve/status/{key}'](key,request)['status'],'stopped')

    def test_returns_before_resolver_and_reports_result_and_failure(self):
        app = FastAPI(); gate = threading.Event(); entered = threading.Event()
        def resolve(value, checkpoint=lambda: None):
            entered.set(); gate.wait(3)
            if value.url == 'bad':
                raise ValueError('identity mismatch')
            return {'media':[{'id':value.url}]}
        busy = attach(app, lambda r: None, Input, resolve).busy
        routes = {r.path:r.endpoint for r in app.routes}
        request = Request({'type':'http','headers':[]})
        start = routes['/media/resolve/start']; status = routes['/media/resolve/status/{key}']
        key = start(Input(url='post'), request)['job_id']
        self.assertTrue(entered.wait(1)); self.assertTrue(busy())
        self.assertEqual(status(key,request)['status'],'running')
        gate.set()
        import time
        for _ in range(100):
            if not busy(): break
            time.sleep(.01)
        self.assertEqual(status(key,request)['result']['media'][0]['id'],'post')
        key = start(Input(url='bad'),request)['job_id']
        for _ in range(100):
            if not busy(): break
            time.sleep(.01)
        self.assertEqual(status(key,request)['message'],'identity mismatch')
