"""Isolated API/lifecycle contracts: no live service, network, or material library."""
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import asyncio
import json
from urllib.parse import urlsplit


class TestClient:
    """Tiny ASGI harness avoids installing or changing live runtime dependencies."""
    def __init__(self, app): self.app = app
    def close(self): pass
    def __enter__(self): return self
    def __exit__(self, *args): self.close()
    def get(self, path, headers=None): return self.request('GET', path, headers)
    def post(self, path, headers=None, json=None): return self.request('POST', path, headers, json)
    def request(self, method, url, headers=None, payload=None):
        parsed = urlsplit(url)
        body = json.dumps(payload).encode() if payload is not None else b''
        request_headers = {**(headers or {}), 'content-type': 'application/json'}
        messages = []
        async def run():
            async def receive():
                return {'type': 'http.request', 'body': body, 'more_body': False}
            async def send(value): messages.append(value)
            await self.app({'type': 'http', 'asgi': {'version': '3.0', 'spec_version': '2.4'},
                'http_version': '1.1', 'method': method, 'path': parsed.path,
                'raw_path': parsed.path.encode(), 'root_path': '', 'scheme': 'http',
                'query_string': parsed.query.encode(), 'server': ('testserver', 80),
                'client': ('127.0.0.1', 1),
                'headers': [(k.lower().encode(), v.encode()) for k, v in request_headers.items()]}, receive, send)
        asyncio.run(run())
        content = b''.join(message.get('body', b'') for message in messages)
        return SimpleNamespace(status_code=messages[0]['status'], json=lambda: json.loads(content))


class RuntimeContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {'LIBLIB_ROOT': str(self.root)})
        self.env.start()
        from server.app import create_app
        from server.config import Settings
        self.started, self.finish = threading.Event(), threading.Event()
        self.calls = []
        owner = self
        from server.catalog import Catalog
        class Storage:
            catalog = Catalog(owner.root)
            def collect(self, request, progress):
                owner.calls.append(request)
                owner.started.set()
                owner.finish.wait(5)
                output = owner.root / 'saved.txt'
                output.write_text(request.collection_mode)
                return {'directory': str(owner.root), 'files': [str(output)]}
        self.app = create_app(SimpleNamespace(settings=Settings(self.root, save_directory=self.root),
            storage=Storage(), videos=SimpleNamespace(busy=lambda: False)))
        self.app.state.runtime.capability_cache.probe = lambda: {}
        self.client = TestClient(self.app)
        self.headers = {'X-Collector-Token': self.client.get('/health').json()['settings_token']}

    def tearDown(self):
        self.finish.set()
        deadline = time.monotonic() + 2
        while self.app.state.runtime.active_urls and time.monotonic() < deadline:
            time.sleep(.01)
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def submit(self, **changes):
        return self.client.post('/collect/start', headers=self.headers, json={
            'canonical_url': 'https://example.com/item?id=1', 'idempotency_key': 'request-a',
            'task_id': 'task-a', 'save_directory': str(self.root), **changes})

    def test_stop_is_acknowledged_only_after_post_boundary_and_repeated_key_is_stable(self):
        first = self.submit().json()['job_id']
        self.assertTrue(self.started.wait(1))
        self.assertEqual(first, self.submit().json()['job_id'])
        self.assertEqual(409, self.submit(collection_mode='text').status_code)
        stopping = self.client.post('/collect/control/' + first, headers=self.headers,
                                    json={'action': 'stopped'}).json()
        self.assertEqual('stopping', stopping['status'])
        self.assertFalse(stopping['cancel_acknowledged'])
        self.assertEqual('post_boundary', stopping['stop_mode'])
        self.assertTrue(self.client.get('/health').json()['busy'])
        self.assertEqual(409, self.submit(idempotency_key='request-b', task_id='task-b').status_code)
        self.finish.set()
        for _ in range(100):
            terminal = self.client.get('/collect/status/' + first, headers=self.headers).json()
            if terminal['status'] == 'stopped': break
            time.sleep(.01)
        self.assertEqual('stopped', terminal['status'])
        self.assertTrue(terminal['cancel_acknowledged'])
        self.assertTrue(Path(terminal['result']['files'][0]).is_file())
        self.assertFalse(self.client.get('/health').json()['busy'])
        self.assertEqual(first, self.submit().json()['job_id'])
        second = self.submit(idempotency_key='request-b', task_id='task-b', collection_mode='text').json()['job_id']
        self.assertNotEqual(first, second)

    def test_health_does_not_wait_for_twenty_second_component_probe(self):
        from server.components import CapabilityCache
        release = threading.Event()
        calls = []
        def slow():
            calls.append(1)
            release.wait(20)
            return {'mp4_remux': False}
        cache = CapabilityCache(slow)
        self.app.state.runtime.capability_cache.probe = slow
        try:
            started = time.monotonic()
            # A fresh instance ensures the first request triggers the slow probe.
            self.app.state.runtime.capability_cache.checked_at = 0
            self.app.state.runtime.capability_cache.running = False
            for _ in range(3):
                response = self.client.get('/health')
                self.assertEqual(200, response.status_code)
            self.assertLess(time.monotonic() - started, 1)
            self.assertEqual(1, len(calls))
        finally:
            release.set()

    def test_component_failure_is_cached(self):
        from server.components import CapabilityCache
        calls = []
        def fail():
            calls.append(1)
            raise OSError('broken tool')
        cache = CapabilityCache(fail)
        cache.snapshot()
        for _ in range(100):
            if not cache.running: break
            time.sleep(.001)
        self.assertEqual('unavailable', cache.snapshot()['state'])
        self.assertEqual(1, len(calls))

    def test_factory_instances_have_independent_tokens_and_jobs(self):
        from server.app import create_app
        from server.config import Settings
        app = create_app(SimpleNamespace(settings=Settings(self.root), storage=SimpleNamespace(catalog=None),
                                         videos=SimpleNamespace(busy=lambda: False)))
        with TestClient(app) as client:
            token = client.get('/health').json()['settings_token']
            self.assertNotEqual(token, self.headers['X-Collector-Token'])
            self.assertEqual(403, client.get('/tasks', headers=self.headers).status_code)
            self.assertEqual({}, app.state.runtime.jobs)

    def test_task_revision_conflicts_never_overwrite_newer_checkpoint(self):
        path = '/tasks'
        record = {'id': 'checkpoint', 'data': {'revision': 1, 'status': 'running', 'records': [1]}}
        saved = self.client.post(path, headers=self.headers, json=record)
        self.assertEqual(1, saved.json()['revision'])
        self.assertEqual(200, self.client.post(path, headers=self.headers, json=record).status_code)
        record['data'].update(revision=2, records=[1, 2])
        self.assertEqual(2, self.client.post(path, headers=self.headers, json=record).json()['revision'])
        record['data'].update(revision=1, records=[])
        self.assertEqual(409, self.client.post(path, headers=self.headers, json=record).status_code)
        current = self.client.get('/tasks/checkpoint', headers=self.headers).json()['item']
        self.assertEqual([1, 2], current['records'])
        self.assertEqual(2, current['revision'])
        record['data']['schema_version'] = 2
        self.assertEqual(409, self.client.post(path, headers=self.headers, json=record).status_code)
        self.assertEqual(404, self.client.get('/tasks/missing', headers=self.headers).status_code)

    def test_task_page_of_thousand_returns_only_summaries_and_details_are_lazy(self):
        catalog = self.app.state.runtime.storage.catalog
        with catalog.connect() as db:
            db.executemany('INSERT INTO tasks(id,data,updated) VALUES(?,?,?)',
                [(str(index), json.dumps({'id': str(index), 'revision': 1, 'records': list(range(100)),
                  'title': 'Task ' + str(index), 'status': 'completed'}), index) for index in range(1000)])
        with patch.object(catalog, 'tasks', side_effect=AssertionError('must not read every checkpoint')):
            page = self.client.get('/tasks?page=2&page_size=20', headers=self.headers).json()
        self.assertEqual(1000, page['total'])
        self.assertEqual(20, len(page['items']))
        self.assertEqual('979', page['items'][0]['id'])
        self.assertNotIn('records', page['items'][0])
        detail = self.client.get('/tasks/979', headers=self.headers).json()['item']
        self.assertEqual(list(range(100)), detail['records'])

    def test_upgrade_gate_refuses_unknown_or_busy_without_requesting_exit(self):
        from server.desktop import configure_shutdown
        stopped = []
        self.app.middleware_stack = None
        with patch.dict(os.environ, {'COLLECTOR_LAUNCHER_SECRET': 'isolated-secret'}):
            configure_shutdown(self.app, lambda: stopped.append(True))
        self.assertEqual(403, self.client.post('/internal/prepare-upgrade').status_code)
        self.app.state.runtime.folder_requests['picker'] = {'state': 'pending'}
        headers = {'X-Launcher-Secret': 'isolated-secret'}
        self.assertEqual(409, self.client.post('/internal/prepare-upgrade', headers=headers).status_code)
        self.assertFalse(stopped)


if __name__ == '__main__':
    unittest.main()
