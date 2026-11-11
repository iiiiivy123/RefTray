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
    def test_huaban_preferred_browser_bytes_match_their_own_source_and_never_the_fallback(self):
        from server.image_sources import original_candidates
        original='https://gd-hbimg-edge.huaban.com/'+'c'*40+'-WE9Q4o?auth_key=fixture'
        preview=original.replace('?','_fw1200webp?')
        self.assertEqual(original_candidates('huaban',preview,original),[original])
        for invalid in [original.replace('c'*40,'d'*40),original.replace('huaban.com','evil.invalid'),original.replace('fixture','changed')]:
            self.assertEqual(original_candidates('huaban',preview,invalid),[])
        item=ImageItem(url=preview,preferred_url=original,data_url=original,data_base64=base64.b64encode(picture()).decode())
        with patch('server.storage.download_image',side_effect=AssertionError('Already prefetched original')) as fetch:
            result=self.storage.collect(self.request(platform='huaban',images=[item]))
            self.assertEqual(fetch.call_count,0);self.assertEqual(result['original_fallbacks'],0)
        meta=json.loads((Path(result['directory'])/'_来源记录/metadata.json').read_text('utf-8'))
        self.assertEqual(meta['images'][0]['download_url'],original)

    def test_high_resolution_candidates_keep_asset_identity_and_have_bounded_fallback(self):
        from server.image_sources import original_candidates
        pin='https://i.pinimg.com/736x/ab/cd/ef/'+'abcdef'*5+'ab.jpg'
        self.assertEqual(original_candidates('pinterest',pin),[pin.replace('/736x/','/originals/')])
        art='https://cdna.artstation.com/p/assets/images/images/080/155/104/large/artist-work.jpg?1723100000'
        expected=[art.replace('/large/',f'/{size}/') for size in ('8k','4k')]
        self.assertEqual(original_candidates('artstation',art),expected)
        for platform,url in [('artstation',art.replace('artstation.com','artstation.com.evil.invalid')),('artstation',art.replace('.jpg','.gif')),('pinterest',pin.replace('i.pinimg.com','avatars.pinimg.com')),('pinterest',pin.replace('.jpg','.gif'))]:
            self.assertEqual(original_candidates(platform,url),[])
        item=ImageItem(url=art,data_base64=base64.b64encode(picture('WEBP')).decode())
        with patch('server.storage.download_image',side_effect=[OSError('8k unavailable'),(picture(),'image/png')]) as fetch:
            result=self.storage.collect(self.request(platform='artstation',images=[item]))
            self.assertEqual([call.args[0] for call in fetch.call_args_list],expected)
            self.assertEqual(result['original_fallbacks'],0)
            self.assertEqual(result['failed_images'],0)

    def test_xhs_prefers_original_rendition_and_falls_back_without_counting_a_saved_image_as_failed(self):
        from server.image_sources import xhs_original_url
        url='https://sns-webpic-qc.xhscdn.com/202611111253/'+'a'*32+'/notes_pre_post/1040g3k031jht5c732g6g5nq1lh9087e3pkdarho!nd_dft_wlteh_webp_3'
        original=xhs_original_url(url)
        self.assertEqual(original,'https://ci.xiaohongshu.com/notes_pre_post/1040g3k031jht5c732g6g5nq1lh9087e3pkdarho?imageView2/format/png')
        for invalid in [url.replace('xhscdn.com','xhscdn.com.evil.invalid'),url.replace('/notes_pre_post/','/../'),url.replace('https:','http:'),'https://ci.xiaohongshu.com/file.gif']:
            self.assertIsNone(xhs_original_url(invalid))
        request=self.request(platform='xhs',images=[ImageItem(url=url)])
        with patch('server.storage.download_image',return_value=(picture(),'image/png')) as fetch:
            result=self.storage.collect(request)
            self.assertEqual(fetch.call_args.args[0],original)
            self.assertEqual(result['original_fallbacks'],0)
        folder=Path(result['directory']);metadata=json.loads((folder/'_来源记录/metadata.json').read_text('utf-8'))
        self.assertEqual(metadata['images'][0]['download_url'],original)
        with patch('server.storage.download_image',side_effect=[OSError('original unavailable'),(picture('WEBP'),'image/webp')]) as fetch:
            fallback=self.storage.collect(request.model_copy(update={'duplicate_policy':'refresh'}))
            self.assertEqual([c.args[0] for c in fetch.call_args_list],[original,url])
            self.assertEqual(fallback['failed_images'],0);self.assertEqual(fallback['original_fallbacks'],1)
            self.assertTrue(any('已保存网页图' in w for w in fallback['warnings']))
        self.assertTrue(next(folder.glob('*.png')).is_file(),'Earlier original stays intact')

    def test_xhs_browser_prefetch_is_fallback_not_a_reason_to_skip_original(self):
        url='https://sns-webpic-qc.xhscdn.com/202611111253/'+'b'*32+'/1040g3k031jht5c732g6g5nq1lh9087e3pkdarho!nd_dft_wlteh_webp_3'
        item=ImageItem(url=url,data_base64=base64.b64encode(picture('WEBP')).decode(),content_type='image/webp')
        request=self.request(platform='xhs',images=[item],duplicate_policy='refresh')
        with patch('server.storage.download_image',return_value=(picture(),'image/png')) as fetch:
            result=self.storage.collect(request)
            self.assertEqual(fetch.call_count,1)
            self.assertTrue(result['files'][0].endswith('.png'))
        with patch('server.storage.download_image',side_effect=OSError('original unavailable')) as fetch:
            result=self.storage.collect(request)
            self.assertEqual(fetch.call_count,1,'Fallback uses the already downloaded browser bytes')
            self.assertEqual(result['failed_images'],0)
            self.assertEqual(result['original_fallbacks'],1)

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
