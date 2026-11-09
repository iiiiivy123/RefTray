import threading
import unittest
from fastapi import FastAPI
from pydantic import BaseModel
from starlette.requests import Request
from server.media_jobs import attach


class Input(BaseModel):
    url: str


class MediaJobTests(unittest.TestCase):
    def test_returns_before_resolver_and_reports_result_and_failure(self):
        app = FastAPI(); gate = threading.Event(); entered = threading.Event()
        def resolve(value):
            entered.set(); gate.wait(3)
            if value.url == 'bad':
                raise ValueError('identity mismatch')
            return {'media':[{'id':value.url}]}
        busy = attach(app, lambda r: None, Input, resolve)
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
