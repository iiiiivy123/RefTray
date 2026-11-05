"""New Pinterest captures are flat; legacy user files stay byte-for-byte intact."""
import base64
import io
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from server.config import Settings
from server.models import CollectRequest, ImageItem
from server.storage import Storage


class PinterestLayoutTests(unittest.TestCase):
    def test_single_board_sources_dedup_and_legacy_preservation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            storage = Storage(Settings(root=root, save_directory=root / 'library'))
            legacy = root / 'library/图片/Pinterest/Old Pin/001.jpg'
            legacy.parent.mkdir(parents=True)
            legacy.write_bytes(b'old user file')
            old_board = root / 'library/批量/Pinterest/现代男/ivyyu4575/old.jpg'
            old_board.parent.mkdir(parents=True)
            old_board.write_bytes(b'old board file')
            def request(pin, color, **kwargs):
                data = io.BytesIO()
                Image.new('RGB', (4, 4), color).save(data, format='PNG')
                return CollectRequest(canonical_url=f'https://www.pinterest.com/pin/{pin}/',
                    page_title='同名标题', directory_schema='function-platform-v2',
                    capture_scope='single', capture_kind='images', ocr_enabled=False,
                    images=[ImageItem(url=f'https://i.pinimg.com/{pin}.png', data_base64=base64.b64encode(data.getvalue()).decode())], **kwargs)
            a, b = request('111', 'red'), request('222', 'blue')
            one, two = storage.collect(a), storage.collect(b)
            self.assertEqual(one['directory'], two['directory'])
            folder = Path(one['directory'])
            self.assertEqual(folder, root / 'library/图片/Pinterest')
            self.assertEqual(one['files'], ['同名标题_111.png'])
            self.assertEqual(two['files'], ['同名标题_222.png'])
            sources = json.loads((folder / '_来源记录/metadata.json').read_text(encoding='utf-8'))['sources']
            self.assertEqual(len(sources), 2)
            again = storage.collect(a)
            self.assertEqual((again['new_images'], again['duplicate_images']), (0, 1))
            board = storage.collect(a.model_copy(update={'capture_scope':'batch',
                'board_url':'https://www.pinterest.com/ivyyu4575/board/', 'board_name':'现代男',
                'list_url':'https://www.pinterest.com/ivyyu4575/board/', 'list_kind':'board',
                'list_name':'现代男', 'list_owner':'ivyyu4575'}))
            self.assertEqual(Path(board['directory']), old_board.parent.parent)
            self.assertEqual(board['files'], ['同名标题_111.png'])
            self.assertEqual(legacy.read_bytes(), b'old user file')
            self.assertEqual(old_board.read_bytes(), b'old board file')
            multi = storage.collect(b.model_copy(update={'images':a.images+b.images}))
            self.assertEqual(multi['total_images'], 2)
            fresh = storage.collect(a.model_copy(update={'canonical_url':'https://www.pinterest.com/pin/333/',
                'destination':str(root / 'fresh'), 'images':a.images+b.images}))
            self.assertEqual(fresh['files'], ['同名标题_333_01.png', '同名标题_333_02.png'])

if __name__ == '__main__':
    unittest.main()
