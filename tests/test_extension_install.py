import json
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'source'))
from server.extension_install import sync_extensions


class ExtensionUpgradeTests(unittest.TestCase):
    def extension(self, root, name, version):
        path = root / name
        path.mkdir()
        (path / 'manifest.json').write_text(json.dumps({'name': '灵感采集', 'manifest_version': 3,
            'version': version, 'background': {'service_worker': 'background.js'}}, ensure_ascii=False), 'utf-8')
        (path / 'background.js').write_text(version)
        (path / 'reftray-a.ico').write_bytes(b'icon')
        return path

    def test_only_proven_obsolete_files_removed_and_unknown_source_files_not_copied(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            current = self.extension(root, 'new', '0.5.39')
            prior = self.extension(root, 'registered', '0.5.38')
            incoming = {f.relative_to(current):hashlib.sha256(f.read_bytes()).hexdigest() for f in current.iterdir()}
            stale = {Path(n):hashlib.sha256(b'original').hexdigest() for n in ('removed.js','edited.js')}
            (prior / 'removed.js').write_bytes(b'original')
            (prior / 'edited.js').write_bytes(b'user edit')
            (current / 'unowned.js').write_bytes(b'not from package')
            sync_extensions(current, [prior], incoming, stale)
            self.assertFalse((prior / 'removed.js').exists())
            self.assertFalse((prior / 'unowned.js').exists())
            self.assertEqual((prior / 'edited.js').read_bytes(), b'user edit')

    def test_old_loaded_path_updates_across_multiple_install_locations(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            loaded = self.extension(root, 'chrome-loaded-old-path', '0.5.29')
            current = self.extension(root, 'new-install', '0.5.31')
            (loaded / 'user-notes.txt').write_text('keep')
            paths = sync_extensions(current, [loaded])
            self.assertEqual((loaded / 'manifest.json').read_bytes(), (current / 'manifest.json').read_bytes())
            moved = self.extension(root, 'later-install', '0.5.32')
            sync_extensions(moved, paths)
            for path in (loaded, current):
                self.assertEqual((path / 'background.js').read_text(), '0.5.32')
            self.assertEqual((loaded / 'user-notes.txt').read_text(), 'keep')
            sync_extensions(moved, paths)  # Repeat upgrade is safe.

    def test_unrelated_folder_rejected_before_any_update(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = self.extension(root, 'source', '0.5.31')
            old = self.extension(root, 'old', '0.5.29')
            unrelated = root / 'user-art'
            unrelated.mkdir()
            with self.assertRaises(ValueError):
                sync_extensions(source, [old, unrelated])
            self.assertEqual((old / 'background.js').read_text(), '0.5.29')

    def test_replacement_failure_rolls_back_prior_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = self.extension(root, 'source', '0.5.31')
            old = self.extension(root, 'old', '0.5.29')
            import os
            replace = os.replace
            count = 0
            def fail_second(*args):
                nonlocal count
                count += 1
                if count == 2:
                    raise PermissionError('locked file')
                return replace(*args)
            with patch('server.extension_install.os.replace', side_effect=fail_second):
                with self.assertRaises(PermissionError):
                    sync_extensions(source, [old])
            self.assertEqual((old / 'background.js').read_text(), '0.5.29')
            self.assertEqual(json.loads((old / 'manifest.json').read_text('utf-8'))['version'], '0.5.29')


if __name__ == '__main__':
    unittest.main()
