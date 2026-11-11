import hashlib
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import prepare_build_inputs as prepare


class PrepareBuildInputsTests(unittest.TestCase):
    def test_full_preparation_checks_cached_inputs_and_copies_reviewed_media(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / 'build-tools'
            target.mkdir()
            media = root / 'reviewed-media'
            media.mkdir()
            for name in prepare.MEDIA_FILES:
                (media / name).write_bytes(name.encode())
            with zipfile.ZipFile(target / 'python-3.13.17-embed-amd64.zip', 'w') as archive:
                archive.writestr('python.exe', b'fixture runtime')
            (target / 'innosetup-7.1.1-x64.exe').write_bytes(b'fixture compiler')
            hashes = {name: hashlib.sha256((target / name).read_bytes()).hexdigest() for name in prepare.INPUTS}
            with patch.object(prepare, 'ROOT', root), patch.object(prepare, 'TARGET', target), patch.object(prepare, 'EXPECTED', hashes), patch.object(sys, 'argv', ['prepare', '--media-source', str(media)]), patch.object(prepare.subprocess, 'run') as run, patch.object(prepare.urllib.request, 'urlopen') as download, patch.dict(os.environ, {'PIP_USER': '1', 'PIP_TARGET': 'wrong'}):
                prepare.main()
            download.assert_not_called()
            self.assertEqual(run.call_args.kwargs['env']['PIP_USER'], '0')
            self.assertNotIn('PIP_TARGET', run.call_args.kwargs['env'])
            self.assertEqual(len(json.loads((target / 'inputs.json').read_text())), 2)
            self.assertEqual((target / 'media-minimal/ffmpeg.exe').read_bytes(), b'ffmpeg.exe')

    def test_missing_media_rejected_before_network_or_output_creation(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'build-tools'
            with patch.object(prepare, 'TARGET', target), patch.object(sys, 'argv', ['prepare']), patch.object(prepare.subprocess, 'run') as run:
                with self.assertRaises(SystemExit):
                    prepare.main()
            run.assert_not_called()
            self.assertFalse(target.exists())

    def test_every_official_input_has_a_pinned_digest(self):
        self.assertEqual(set(prepare.INPUTS), set(prepare.EXPECTED))
        for digest in prepare.EXPECTED.values():
            self.assertRegex(digest, r'^[0-9a-f]{64}$')
