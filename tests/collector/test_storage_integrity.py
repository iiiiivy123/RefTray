"""Offline storage contracts; all files and indexes live in temporary directories."""
import base64
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from server.catalog import Catalog, fingerprint, public_url, source_id
from server.config import Settings
from server.destinations import source_key
from server.models import CollectRequest, ImageItem
from server.storage import Storage


def picture(format='PNG'):
    output = io.BytesIO()
    Image.new('RGB', (4, 4), 'red').save(output, format=format)
    return output.getvalue()


class StorageIntegrityTests(unittest.TestCase):
    def test_comment_images_keep_their_role_and_render_once_outside_body_ocr(self):
        from server.models import CommentItem
        def colored(color, url, **kwargs):
            output = io.BytesIO()
            Image.new('RGB', (4, 4), color).save(output, format='PNG')
            return ImageItem(url=url, data_base64=base64.b64encode(output.getvalue()).decode(), **kwargs)
        images = [colored('red', 'https://example.org/body1'), colored('green', 'https://example.org/body2'),
                  colored('blue', 'https://example.org/reply', role='comment', comment_id='reply1')]
        with patch('server.storage.recognize', return_value={'status': 'completed', 'text': 'body OCR'}) as recognize:
            result = self.storage.collect(self.request(images=images, ocr_enabled=True, comments_requested=True,
                comments=[CommentItem(id='reply1', text='reply', images=['https://example.org/reply'])]))
        self.assertEqual(recognize.call_count, 2)
        root = Path(result['directory'])
        data = json.loads((root / '_来源记录' / 'metadata.json').read_text('utf-8'))
        self.assertEqual([i['role'] for i in data['images']], ['body', 'body', 'comment'])
        self.assertEqual(data['images'][2]['comment_id'], 'reply1')
        markdown = (root / data['reading_file']).read_text('utf-8')
        self.assertEqual(markdown.count('![评论图片]'), 1)
        self.assertEqual(markdown.count('![正文图片]'), 2)
        self.assertEqual(markdown.count(data['images'][2]['file']), 1)

    def test_reply_animation_converts_into_a_linked_gif_and_preserves_text_on_failure(self):
        from email.message import Message
        from unittest.mock import MagicMock
        from server.models import CommentItem
        import shutil
        import subprocess
        source = self.root / 'source.mp4'
        subprocess.run([shutil.which('ffmpeg'), '-v', 'error', '-f', 'lavfi', '-i',
                        'testsrc2=size=80x60:rate=10', '-t', '0.6', '-c:v', 'libx264', str(source)], check=True)
        response = MagicMock(status=200)
        response.headers = Message()
        response.headers['Content-Type'] = 'video/mp4'
        response.read.return_value = source.read_bytes()
        url = 'https://video.twimg.com/tweet_video/test.mp4'
        images = [ImageItem(url=url, source_kind='comment_gif', role='comment', comment_id='123')]
        request = self.request(images=images, comments_requested=True, comments=[CommentItem(id='123', text='reply', images=[url])])
        with patch('server.comment_gif.public_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value = response
            result = self.storage.collect(request)
            self.assertEqual(result['failed_images'], 0)
            folder = Path(result['directory'])
            gif = next(folder.rglob('*.gif'))
            with Image.open(gif) as animation:
                self.assertGreater(animation.n_frames, 1)
            self.assertIn(gif.name, next(folder.rglob('*.md')).read_text('utf-8'))
            response.read.return_value = b'incomplete'
            result = self.storage.collect(request.model_copy(update={'duplicate_policy': 'refresh'}))
            self.assertTrue(result['partial'])
            self.assertTrue(gif.exists())

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.storage = Storage(Settings(root=self.root, save_directory=self.root / 'library'))

    def request(self, **changes):
        return CollectRequest(**{'canonical_url': 'https://example.org/read?id=1',
            'collection_mode': 'text', 'page_title': 'Title', 'body_text': 'Body',
            'ocr_enabled': False, **changes})

    def item(self, data=None):
        return ImageItem(url='https://example.org/image', data_base64=base64.b64encode(data or picture()).decode(), content_type='image/jpeg')

    def test_generic_content_identity_and_tracking(self):
        a = 'https://example.org/read?id=1&utm_source=x#part'
        b = 'https://example.org/read?id=2'
        self.assertNotEqual(source_key(a), source_key(b))
        self.assertEqual(source_key(a), source_key('https://example.org/read?utm_source=y&id=1'))
        self.assertEqual(public_url(a), source_key(a))
        self.assertEqual(source_id(a), source_key(a))
        one = self.storage.collect(self.request(canonical_url=a, page_title='One'))
        two = self.storage.collect(self.request(canonical_url=b, page_title='Two', body_text='Second'))
        self.assertNotEqual(one['directory'], two['directory'])
        self.assertIn('Body', next(Path(one['directory']).glob('*.md')).read_text(encoding='utf-8'))
        self.assertIsNone(self.storage.catalog.lookup('https://example.org/read?id=3', ['text']))
        self.assertEqual(source_key('https://en.wikipedia.org/w/index.php?title=A&oldid=2'), 'https://en.wikipedia.org/w/index.php?oldid=2&title=A')
        self.assertIn('p=2', source_key('https://www.bilibili.com/video/BV1234567890?p=2'))
        self.assertEqual(source_key('https://www.pinterest.com/pin/123/?foo=bar'), 'https://www.pinterest.com/pin/123')
        self.assertEqual(source_key('https://www.youtube.com/watch?v=abcdefghijk&utm_source=x'), 'https://www.youtube.com/watch?v=abcdefghijk')

    def test_image_progress_advances_for_written_and_existing_items(self):
        request = self.request(collection_mode='images', images=[self.item(), self.item()])
        for repeat in range(2):
            progress = []
            result = self.storage.collect(request, lambda value, text: progress.append((value, text)))
            processed = [(value, text) for value, text in progress if text.startswith('已处理图片')]
            self.assertEqual(processed, [(45, '已处理图片 1/2'), (80, '已处理图片 2/2')])
            self.assertTrue(result['files'])

    def test_storage_frame_limit_returns_only_confirmed_files_and_omission(self):
        frames = []
        for index in range(5):
            output = io.BytesIO()
            Image.new('RGB', (4, 4), (index * 40, 0, 0)).save(output, format='PNG')
            frames.append(self.item(output.getvalue()).model_copy(update={'source_kind': 'video_frame', 'frame_time': index}))
        result = self.storage.collect(self.request(collection_mode='images', images=frames, max_images=2))
        self.assertEqual((result['new_images'], len(result['files']), result['omitted_images'], result['partial']), (2, 2, 3, True))
        self.assertIsNone(self.storage.catalog.lookup('https://example.org/read?id=1', ['images']))

    def test_refresh_reuses_generated_document_and_protects_hand_edits(self):
        folder = Path(self.storage.collect(self.request())['directory'])
        original, = folder.glob('*.md')
        self.storage.collect(self.request(duplicate_policy='refresh'))
        self.assertEqual(list(folder.glob('*.md')), [original])
        original.write_text('My edits',encoding='utf-8')
        self.storage.collect(self.request(duplicate_policy='refresh', body_text='New source'))
        self.assertEqual(original.read_text('utf-8'),'My edits')
        self.assertEqual(len(list(folder.glob('*.md'))),2)
    def test_handwritten_markdown_is_preserved(self):
        first = self.storage.collect(self.request())
        target = next(Path(first['directory']).glob('*.md'))
        target.write_text('My edits', encoding='utf-8')
        self.storage.collect(self.request(body_text='Changed'))
        self.assertEqual(target.read_text(encoding='utf-8'), 'My edits')

    def test_legacy_coverage_cannot_skip_missing_or_invalid_attachments(self):
        folder = self.root / 'old'
        folder.mkdir()
        document = folder / 'note.md'
        document.write_text('OCR text', encoding='utf-8')
        self.storage.catalog.record('https://example.org/old', 'Old', '', 'text', folder, ['note.md'], {'images': True, 'text': True})
        self.assertIsNone(self.storage.catalog.lookup('https://example.org/old', ['images']))
        invalid = folder / 'bad.jpg'
        invalid.write_bytes(b'<html>login</html>')
        self.storage.catalog.record('https://example.org/old', 'Old', '', 'text', folder, ['bad.jpg'], {'images': True})
        self.assertIsNone(self.storage.catalog.lookup('https://example.org/old', ['images']))

    def test_invalid_media_rejected_and_actual_format_used(self):
        for bad in (b'<html>login</html>', b'{"status":"denied"}', picture('JPEG')[:-20]):
            with self.subTest(data=bad[:10]), self.assertRaises(ValueError):
                self.storage._download(self.item(bad))
            with patch('server.storage.download_image', return_value=(bad, 'image/png')):
                with self.assertRaises(ValueError):
                    self.storage._download(ImageItem(url='https://example.org/image'))
        for format, suffix in [('PNG', '.png'), ('JPEG', '.jpg')]:
            self.assertEqual(self.storage._download(self.item(picture(format)))[1], suffix)

    def test_bad_legacy_cache_is_invalidated_and_downloaded_again(self):
        bad = self.root / 'cached.jpg'
        bad.write_bytes(b'<html>login</html>')
        self.storage.catalog.register_asset('https://example.org/image', bad, fingerprint(bad))
        with patch('server.storage.download_image', return_value=(picture(), 'image/png')) as download:
            result = self.storage.collect(self.request(images=[ImageItem(url='https://example.org/image')]))
        self.assertEqual(result['new_images'], 1)
        download.assert_called_once()
        with self.storage.catalog.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM assets WHERE path=?', (str(bad.resolve()),)).fetchone()[0], 0)
        self.assertTrue(bad.exists())  # Never delete an old user file while invalidating its index.

    def test_ocr_only_then_fill_or_refresh_attaches_image_and_keeps_ocr(self):
        for policy in ('fill', 'refresh'):
            with self.subTest(policy=policy):
                request = self.request(canonical_url='https://example.org/read?id=' + policy,
                    images=[self.item()], include_images=False, ocr_enabled=True)
                with patch('server.storage.recognize', return_value={'status': 'completed', 'text': 'Recognized'}) as ocr:
                    first = self.storage.collect(request)
                    self.assertIsNone(self.storage.catalog.lookup(request.canonical_url, ['images']))
                    second = self.storage.collect(request.model_copy(update={'include_images': True, 'duplicate_policy': policy}))
                    self.assertEqual(ocr.call_count, 1)
                self.assertEqual(first['new_images'], 0)
                self.assertEqual(second['new_images'], 1)
                captured = self.storage.catalog.lookup(request.canonical_url, ['images', 'ocr'])
                self.assertIsNotNone(captured)
                metadata = json.loads((Path(second['directory']) / '_来源记录' / 'metadata.json').read_text(encoding='utf-8'))
                md = (Path(second['directory']) / metadata['reading_file']).read_text(encoding='utf-8')
                self.assertIn('Recognized', md)
                self.assertIn('![', md)


if __name__ == '__main__':
    unittest.main()
