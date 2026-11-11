import base64
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image
from server.catalog import Catalog, fingerprint
from server.history_preview import preview, remember_audio_cover, _trusted_cover


def picture():
    stream = io.BytesIO()
    Image.new('RGB', (960, 720), '#509080').save(stream, 'PNG')
    return stream.getvalue()


class HistoryPreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.catalog = Catalog(self.root)
        self.folder = self.root / '素材'
        self.folder.mkdir()

    def record(self, filename='picture.png', mode='images', data=None, coverage=None):
        path = self.folder / filename
        path.write_bytes(picture() if data is None else data)
        self.catalog.record('https://x.com/artist/status/123', '作品', '作者', mode,
                            self.folder, [filename], coverage or {'images': True, 'category': 'batch'})
        return self.catalog.search()[0]

    def test_local_preview_is_small_cached_and_never_changes_original_or_index(self):
        item = self.record()
        original = fingerprint(self.folder / 'picture.png')
        result = preview(self.catalog, item)
        data = base64.b64decode(result['image'].split(',', 1)[1])
        with Image.open(io.BytesIO(data)) as image:
            self.assertEqual(image.size, (320, 240))
        self.assertEqual(original, fingerprint(self.folder / 'picture.png'))
        self.assertEqual(item, self.catalog.get(item['id']))
        self.assertEqual(list(self.folder.iterdir()), [self.folder / 'picture.png'])
        with patch('server.history_preview._jpeg', side_effect=AssertionError('must reuse preview')):
            self.assertEqual(preview(self.catalog, item), result)

    def test_missing_changed_and_outside_files_never_supply_a_preview(self):
        item = self.record()
        (self.folder / 'picture.png').write_bytes(b'changed')
        self.assertIsNone(preview(self.catalog, item)['image'])
        outside = self.root / 'outside.png'
        outside.write_bytes(picture())
        item['files'] = [{'path': str(outside), 'size': outside.stat().st_size}]
        with patch('server.history_preview._jpeg', side_effect=AssertionError('outside record')):
            self.assertIsNone(preview(self.catalog, item)['image'])

    def test_batch_scope_keeps_concrete_content_type_for_old_records(self):
        for filename, mode, coverage, expected in (
            ('clip.mp4', 'images', {'videos': True}, 'video'),
            ('music.m4a', 'images', {}, 'audio'),
            ('note.md', 'text', {'text': True}, 'plain'),
        ):
            with self.subTest(filename=filename):
                folder = self.root / filename.replace('.', '-')
                folder.mkdir()
                (folder / filename).write_bytes(b'old data')
                self.catalog.record('https://x.com/a/status/1', '', 'a', mode, folder, [filename], {**coverage, 'category': 'batch'})
                row = self.catalog.search()[0]
                self.assertEqual((row['category'], row['content_kind']), ('batch', expected))
        item = self.record(mode='text', coverage={'text': True, 'images': True, 'category': 'batch'})
        self.assertEqual(item['content_kind'], 'text')

    def test_audio_uses_verified_platform_cover_without_adding_user_files(self):
        item = self.record('audio.m4a', data=b'audio', coverage={'category': 'batch'})
        value = SimpleNamespace(canonical_url=item['url'], cover_url='https://pbs.twimg.com/media/cover.jpg')
        with patch('server.image_download.download_image', return_value=(picture(), 'image/png')) as download:
            self.assertEqual(remember_audio_cover(self.catalog, value), '')
            download.assert_called_once_with(value.cover_url, 4)
        with patch('server.image_download.download_image', side_effect=AssertionError('history is local only')):
            self.assertTrue(preview(self.catalog, item)['image'].startswith('data:image/jpeg;'))
        self.assertEqual([p.name for p in self.folder.iterdir()], ['audio.m4a'])
        self.assertEqual(self.catalog.get(item['id']), item)

    def test_cover_failure_does_not_claim_success_or_change_audio(self):
        item = self.record('audio.m4a', data=b'audio')
        value = SimpleNamespace(canonical_url=item['url'], cover_url='https://pbs.twimg.com/media/cover.jpg')
        with patch('server.image_download.download_image', side_effect=OSError('offline')):
            self.assertIn('缩略图生成失败', remember_audio_cover(self.catalog, value))
        self.assertEqual((self.folder / 'audio.m4a').read_bytes(), b'audio')
        self.assertIsNone(preview(self.catalog, item)['image'])

    def test_cover_hosts_are_platform_scoped(self):
        source = 'https://www.bilibili.com/video/BV1KBJy69EHG'
        self.assertTrue(_trusted_cover('https://i0.hdslb.com/bfs/archive/cover.jpg', source))
        for url in ('http://i0.hdslb.com/a', 'https://i0.hdslb.com.evil.test/a',
                    'https://user@i0.hdslb.com/a', 'https://i0.hdslb.com:8000/a',
                    'https://pbs.twimg.com/a', 'https://127.0.0.1/a'):
            self.assertFalse(_trusted_cover(url, source), url)

    def test_video_preview_uses_only_the_recorded_video_and_is_cached(self):
        item = self.record('clip.mp4', data=b'video')
        with patch('server.history_preview._frame', return_value=b'jpeg') as frame:
            first = preview(self.catalog, item)
            self.assertEqual(preview(self.catalog, item), first)
            frame.assert_called_once_with(self.folder / 'clip.mp4')

    def test_endpoint_requires_authorization_and_record_identity(self):
        from fastapi import Request, HTTPException
        from server.app import create_app
        from server.config import Settings
        from server.video import VideoDownloads
        item = self.record()
        app = create_app(SimpleNamespace(settings=Settings(self.root), storage=SimpleNamespace(catalog=self.catalog), videos=VideoDownloads(self.catalog)))
        routes = {r.path: r.endpoint for r in app.routes if hasattr(r, 'endpoint')}
        request = Request({'type': 'http', 'method': 'GET', 'headers': [], 'query_string': b''})
        with self.assertRaises(HTTPException) as denied:
            routes['/history/{identity}/preview'](item['id'], request)
        self.assertEqual(denied.exception.status_code, 403)
        token = routes['/health'](request)['settings_token']
        allowed = Request({'type': 'http', 'method': 'GET', 'headers': [(b'x-collector-token', token.encode())]})
        self.assertIn('image', routes['/history/{identity}/preview'](item['id'], allowed))
        with self.assertRaises(HTTPException) as missing:
            routes['/history/{identity}/preview'](9000, allowed)
        self.assertEqual(missing.exception.status_code, 404)


if __name__ == '__main__':
    unittest.main()
