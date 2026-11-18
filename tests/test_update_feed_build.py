import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_update_feed import build


class UpdateFeedBuildTests(unittest.TestCase):
    def test_only_verified_matching_official_files_enter_public_feed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package = root / 'InspirationCollector-1.0.11-Windows-x64-Setup.exe'
            package.write_bytes(b'installer fixture')
            sums = root / 'SHA256SUMS-1.0.11.txt'
            digest = hashlib.sha256(package.read_bytes()).hexdigest()
            sums.write_text(digest + '  ' + package.name)
            notes = root / 'notes.md'
            notes.write_text('Update fix')
            path = build(package, sums, notes, root / 'out')
            data = json.loads(path.read_text())
            self.assertEqual(data['schema_version'], 1)
            self.assertEqual(data['tag_name'], 'v1.0.11')
            self.assertFalse(data['draft'] or data['prerelease'])
            self.assertEqual(data['assets'][0]['digest'], 'sha256:' + digest)
            self.assertEqual(data['assets'][0]['size'], len(package.read_bytes()))
            self.assertEqual(path, build(package, sums, notes, root / 'out'))
            original = path.read_bytes()
            sums.write_text('0' * 64 + '  ' + package.name)
            with self.assertRaises(ValueError): build(package, sums, notes, root / 'out')
            self.assertEqual(path.read_bytes(), original)


if __name__ == '__main__': unittest.main()
