import io
import json
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.response import addinfourl

from server.models import VideoDownloadRequest
from server.video import VideoDownloads


class VideoFinalizeTests(unittest.TestCase):
    def run_download(self, root, *, catalog=None, subtitle_error=None):
        downloads = VideoDownloads(catalog)
        downloads.jobs['test'] = {'status': 'running', 'control': 'running', 'lease': time.monotonic()}
        value = VideoDownloadRequest(url='https://cdn.example/video.mp4', canonical_url='https://example.org/post',
            page_title='safe fixture', save_directory=str(root), subtitle_mode='with_video')
        content = b'\0\0\0\x18ftypisom' + b'fixture-media' * 20
        response = addinfourl(io.BytesIO(content), {'Content-Length': str(len(content))}, value.url, code=200)
        opener = Mock()
        opener.open.return_value = response
        def transform(source, destination, *_):
            shutil.copy2(source, destination)
            return 1
        with patch('server.video.validate_url', return_value=value.url), patch('server.video.build_opener', return_value=opener), patch('server.media_output.transform', side_effect=transform), patch('server.subtitles.save', side_effect=subtitle_error, return_value=(None, None)):
            downloads._run('test', root, value)
        return downloads.jobs['test'], content

    def test_subtitle_interruption_keeps_file_source_record_and_partial_result(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            job, content = self.run_download(root, subtitle_error=InterruptedError('stop requested'))
            self.assertEqual(job['status'], 'completed')
            self.assertTrue(job['result']['partial'])
            self.assertEqual(Path(job['result']['path']).read_bytes(), content)
            self.assertTrue(list(root.rglob('_来源记录/*.json')))
            self.assertFalse(list(root.rglob('*.part')))
            self.assertNotIn('临时视频已清理', job['message'])

    def test_history_failure_keeps_file_and_records_failure_in_sidecar(self):
        catalog = Mock()
        catalog.cached.return_value = None
        catalog.record.side_effect = OSError('fixture database busy')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            job, content = self.run_download(root, catalog=catalog)
            self.assertEqual(job['status'], 'completed')
            self.assertTrue(job['result']['partial'])
            self.assertEqual(Path(job['result']['path']).read_bytes(), content)
            sidecar = next(p for p in root.rglob('*.json') if json.loads(p.read_text('utf-8')).get('catalog_status') == 'failed')
            self.assertIn('database busy', sidecar.read_text('utf-8'))

    def test_source_record_failure_still_returns_actual_saved_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            original = Path.write_text
            def write(path, *args, **kwargs):
                if path.suffix == '.tmp':
                    raise OSError('fixture source record denied')
                return original(path, *args, **kwargs)
            with patch.object(Path, 'write_text', write):
                job, content = self.run_download(root)
            self.assertTrue(job['result']['partial'])
            self.assertEqual(Path(job['result']['path']).read_bytes(), content)
            self.assertIn('收尾未完成', job['message'])
