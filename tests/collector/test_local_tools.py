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
