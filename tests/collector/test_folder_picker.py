import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request
from server import folder_picker


class FolderPickerTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'nt', 'Windows native picker')
    def test_cancel_reaps_only_owned_helper_and_releases_lock(self):
        original = subprocess.Popen
        processes = []
        cancel = threading.Event()
        def launch(*args, **kwargs):
            process = original([sys.executable, '-c', 'import time; time.sleep(30)'],
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            processes.append(process)
            threading.Timer(.1, cancel.set).start()
            return process
        started = time.monotonic()
        with patch.object(folder_picker.subprocess, 'Popen', side_effect=launch):
            self.assertEqual(folder_picker.choose_folder(tempfile.gettempdir(), cancel), {'cancelled': True})
        self.assertLess(time.monotonic() - started, 3)
        self.assertIsNotNone(processes[0].poll())
        self.assertTrue(folder_picker._lock.acquire(blocking=False))
        folder_picker._lock.release()

    def test_cancelled_request_stays_busy_until_helper_has_closed(self):
        from server.app import create_app
        from server.config import Settings
        from server.catalog import Catalog
        from server.video import VideoDownloads
        entered, cancelled, closed = (threading.Event() for _ in range(3))
        def choose(initial, cancel):
            entered.set()
            cancel.wait(3)
            cancelled.set()
            closed.wait(3)
            return {'directory': 'must-not-win', 'cancelled': False}
        with tempfile.TemporaryDirectory() as temporary:
            settings = Settings(Path(temporary))
            catalog = Catalog(settings.root)
            runtime = SimpleNamespace(settings=settings, storage=SimpleNamespace(catalog=catalog), videos=VideoDownloads(catalog))
            with patch('server.app.choose_folder', side_effect=choose):
                app = create_app(runtime)
                routes = {(r.path, next(iter(r.methods))): r.endpoint for r in app.routes if getattr(r, 'methods', None)}
                token = routes['/health', 'GET'](Request({'type': 'http', 'method': 'GET', 'query_string': b'', 'headers': []}))['settings_token']
                request = Request({'type': 'http', 'headers': [(b'x-collector-token', token.encode())]})
                key = routes['/settings/choose-folder', 'POST'](request)['id']
                self.assertTrue(entered.wait(1))
                with self.assertRaises(HTTPException) as refused:
                    routes['/settings/choose-folder/{identity}/cancel', 'POST'](key, Request({'type': 'http', 'headers': []}))
                self.assertEqual(refused.exception.status_code, 403)
                routes['/settings/choose-folder/{identity}/cancel', 'POST'](key, request)
                self.assertTrue(cancelled.wait(1))
                value = routes['/settings/choose-folder/{identity}', 'GET'](key, request)
                self.assertEqual(value, {'state': 'cancelling'})
                with self.assertRaises(HTTPException) as busy:
                    routes['/settings/choose-folder', 'POST'](request)
                self.assertEqual(busy.exception.status_code, 409)
                closed.set()
                for _ in range(100):
                    value = routes['/settings/choose-folder/{identity}', 'GET'](key, request)
                    if value['state'] == 'done': break
                    time.sleep(.01)
                self.assertEqual(value, {'state': 'done', 'cancelled': True})


if __name__ == '__main__': unittest.main()
