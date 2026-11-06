"""Real local HTTP/file conversion contract; no remote media or user library."""
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Optional full FFmpeg is unavailable')
class LocalToolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        (root / 'data/inspiration/inbox').mkdir(parents=True)
        cls.sample = root / 'sample.mp4'
        ffmpeg = str(Path(shutil.which('ffmpeg')).resolve())
        subprocess.run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1', '-c:v', 'libx264', '-c:a', 'aac', str(cls.sample)], check=True)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0)); port = listener.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.opener = build_opener(ProxyHandler({}))
        cls.token = ''
        source = Path(__file__).resolve().parents[2] / 'source'
        command = f"import sys;sys.path.insert(0,{str(source)!r});import uvicorn;uvicorn.run('server.app:create_app',factory=True,host='127.0.0.1',port={port},access_log=False)"
        cls.server = subprocess.Popen([sys.executable, '-B', '-c', command], env={**os.environ, 'LIBLIB_ROOT': str(root), 'COLLECTOR_GIF_FFMPEG': ffmpeg}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try: cls.token = cls.api('/health')['settings_token']; break
                except OSError: time.sleep(.1)
            else: raise RuntimeError('Isolated backend did not start')
        except BaseException:
            cls.server.terminate(); cls.server.wait(10); cls.temp.cleanup(); raise

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate(); cls.server.wait(10); cls.temp.cleanup()

    @classmethod
    def api(cls, path, data=None, token=None):
        headers = {'Content-Type': 'application/octet-stream', 'X-Collector-Token': cls.token if token is None else token}
        with cls.opener.open(Request(cls.base + path, data=data, headers=headers), timeout=15) as response:
            return json.load(response)

    def test_local_host_guard_and_missing_history_status(self):
        with self.assertRaises(HTTPError) as bad_host:
            self.opener.open(Request(self.base + '/health', headers={'Host': 'rebinding.invalid'}), timeout=5)
        self.assertEqual(bad_host.exception.code, 400)
        with self.opener.open(Request(self.base + '/health', headers={'Host': 'localhost'}), timeout=5) as response:
            self.assertEqual(response.status, 200)
        with self.assertRaises(HTTPError) as missing:
            self.api('/history/2147483647/open', b'{}')
        self.assertEqual(missing.exception.code, 404)

    def test_health_pairs_browser_origin_and_keeps_native_clients(self):
        from server.extension_origin import paired_origins
        origin = next(iter(paired_origins()))
        for method,headers,code in [
                ('GET', {}, 200),
                ('POST', {'Origin':origin, 'Sec-Fetch-Mode':'cors'}, 200),
                ('GET', {'Sec-Fetch-Site':'none'}, 403),
                ('POST', {'Origin':'chrome-extension://'+'z'*32}, 403),
                ('POST', {'Origin':'https://example.org'}, 403)]:
            req=Request(self.base+'/health', method=method, headers=headers)
            if code==200:
                with self.opener.open(req,timeout=5) as response:
                    self.assertTrue(json.load(response).get('settings_token'))
            else:
                with self.assertRaises(HTTPError) as rejected:
                    self.opener.open(req,timeout=5)
                self.assertEqual(rejected.exception.code,code)
                self.assertNotIn(b'settings_token',rejected.exception.read())

    def test_real_gif_and_audio_preserve_source(self):
        original = hashlib.sha256(self.sample.read_bytes()).hexdigest()
        for format in ('gif', 'audio'):
            job = self.api('/tools/media?format=' + format, self.sample.read_bytes())['job_id']
            for _ in range(120):
                result = self.api('/tools/media/' + job)
                if result['status'] in ('completed', 'failed'): break
                time.sleep(.25)
            self.assertEqual(result['status'], 'completed', result)
            output = Path(result['path'])
            self.assertGreater(output.stat().st_size, 0)
            self.assertEqual(output.parent.name, '加工结果')
            if format == 'gif':
                from PIL import Image
                with Image.open(output) as image: self.assertGreater(image.n_frames, 1)
        self.assertEqual(hashlib.sha256(self.sample.read_bytes()).hexdigest(), original)

    def test_authentication_and_invalid_operation_are_rejected(self):
        for path, token, expected in [('/tools/media?format=gif', 'invalid', 403), ('/tools/media?format=invalid', None, 422)]:
            with self.assertRaises(HTTPError) as error:
                self.api(path, b'invalid', token=token)
            self.assertEqual(error.exception.code, expected)

    def test_stop_is_scoped_to_one_job_and_preserves_input(self):
        longer = Path(self.temp.name) / 'cancel-input.mp4'
        subprocess.run([shutil.which('ffmpeg'), '-v','error','-stream_loop','15','-i',str(self.sample),'-c','copy',str(longer)],check=True)
        original = longer.read_bytes()
        job = self.api('/tools/media?format=gif&name=cancel-input.mp4', original)['job_id']
        with self.assertRaises(HTTPError) as denied:
            self.api('/tools/media/' + job + '/stop', b'{}', token='bad')
        self.assertEqual(denied.exception.code,403)
        self.api('/tools/media/' + job + '/stop', b'{}')
        for _ in range(100):
            result = self.api('/tools/media/' + job)
            if result['status'] in ('stopped','completed','failed'): break
            time.sleep(.1)
        self.assertEqual(result['status'],'stopped',result)
        self.assertFalse(list(Path(self.temp.name).rglob('cancel-input_*.gif')))
        self.assertEqual(original,longer.read_bytes())
        self.assertEqual(self.api('/tools/media/' + job + '/stop', b'{}')['status'],'stopped')
