"""The bridge updater must work on both sides of the repository rename."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

from server.config import Settings
from server.updates import LATEST, LEGACY_LATEST, Updates, release_info


NEW = 'iiiiivy123/RefTray'
OLD = 'iiiiivy123/inspiration-collector'
PAYLOAD = b'bridge installer fixture'
NAME = 'InspirationCollector-1.0.1-Windows-x64-Setup.exe'
SUMS = 'SHA256SUMS-1.0.1.txt'


def metadata(repository):
    return {'tag_name': 'v1.0.1', 'draft': False, 'prerelease': False, 'assets': [
        {'name': name, 'state': 'uploaded', 'size': len(PAYLOAD),
         'digest': 'sha256:' + hashlib.sha256(PAYLOAD).hexdigest(),
         'browser_download_url': f'https://github.com/{repository}/releases/download/v1.0.1/{name}'}
        for name in (NAME, SUMS)]}


def missing():
    return urllib.error.HTTPError(LATEST, 404, 'Not Found', {}, None)


class RepositoryMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.program = self.root / 'program'
        self.program.mkdir()
        (self.program / 'InspirationCollector.exe').write_bytes(b'original program')
        self.manager = Updates(Settings(self.root / 'state'), '1.0.0', lambda: False, self.program)

    def test_both_repository_names_keep_the_legacy_installer_contract(self):
        for repository in (OLD, NEW):
            with self.subTest(repository=repository):
                info = release_info(metadata(repository), '1.0.0')
                self.assertTrue(info['available'])
                self.assertEqual(info['name'], NAME)
                self.assertIn('/' + repository + '/', info['url'])
                self.assertIn('/' + repository + '/', info['checksum_url'])

    def test_canonical_release_takes_priority_after_rename(self):
        with patch('server.updates.read_small', return_value=json.dumps(metadata(NEW)).encode()) as read:
            info = self.manager.check()
        self.assertTrue(info['available'])
        read.assert_called_once_with('https://api.github.com/repos/iiiiivy123/RefTray/releases/latest', 2 * 1024 * 1024)

    def test_before_rename_only_a_404_uses_the_old_repository(self):
        with patch('server.updates.read_small', side_effect=[missing(), json.dumps(metadata(OLD)).encode()]) as read:
            self.assertTrue(self.manager.check()['available'])
        self.assertEqual([call.args[0] for call in read.call_args_list], [LATEST, LEGACY_LATEST])

    def test_errors_and_invalid_canonical_metadata_never_fall_back(self):
        for code in (401, 403, 429, 500):
            error = urllib.error.HTTPError(LATEST, code, 'test', {}, None)
            with self.subTest(code=code), patch('server.updates.read_small', side_effect=error) as read:
                with self.assertRaises(urllib.error.HTTPError):
                    self.manager.check()
                self.assertEqual(read.call_count, 1)
        for error in (TimeoutError('timeout'), ValueError('rate limited')):
            with self.subTest(error=error), patch('server.updates.read_small', side_effect=error) as read:
                with self.assertRaises(type(error)):
                    self.manager.check()
                self.assertEqual(read.call_count, 1)
        for body in (b'{invalid', json.dumps(metadata('other/RefTray')).encode()):
            with self.subTest(body=body), patch('server.updates.read_small', return_value=body) as read:
                with self.assertRaises(ValueError):
                    self.manager.check()
                self.assertEqual(read.call_count, 1)

    def test_current_canonical_release_does_not_consult_legacy_metadata(self):
        self.manager.current = '1.0.1'
        with patch('server.updates.read_small', return_value=json.dumps(metadata(NEW)).encode()) as read:
            self.assertFalse(self.manager.check()['available'])
        self.assertEqual(read.call_count, 1)

    def test_missing_legacy_release_is_an_error_not_up_to_date(self):
        with patch('server.updates.read_small', side_effect=[missing(), missing()]) as read:
            with self.assertRaises(urllib.error.HTTPError):
                self.manager.check()
        self.assertEqual(read.call_count, 2)

    def test_exact_repo_tag_filename_and_https_boundaries_remain(self):
        for index in (0, 1):
            original = metadata(NEW)['assets'][index]['browser_download_url']
            urls = [original.replace('/iiiiivy123/', '/other/'),
                    original.replace('/RefTray/', '/RefTray-copy/'),
                    original.replace('/v1.0.1/', '/v1.0.2/'),
                    original + '?download=1', original + '#fragment',
                    original.replace('https:', 'http:'),
                    original.replace('github.com/', 'github.com.evil.invalid/'),
                    original.replace('/releases/', '/%2e%2e/releases/'),
                    original.rsplit('/', 1)[0] + '/other.exe']
            for url in urls:
                with self.subTest(asset=index, url=url):
                    value = metadata(NEW)
                    value['assets'][index]['browser_download_url'] = url
                    with self.assertRaises(ValueError):
                        release_info(value, '1.0.0')

    def test_download_verifies_both_sources_and_hands_off_unchanged_package_name(self):
        for repository in (OLD, NEW):
            with self.subTest(repository=repository):
                data = metadata(repository)
                checksum = (hashlib.sha256(PAYLOAD).hexdigest() + '  ' + NAME).encode()
                def read(url, limit):
                    if url == LATEST and repository == OLD:
                        raise missing()
                    if url in (LATEST, LEGACY_LATEST):
                        return json.dumps(data).encode()
                    self.assertEqual(url, data['assets'][1]['browser_download_url'])
                    return checksum
                with patch('server.updates.read_small', side_effect=read), \
                        patch('server.updates.open_official', return_value=io.BytesIO(PAYLOAD)) as download, \
                        patch.object(self.manager, 'handoff') as handoff:
                    self.manager.download('1.0.1')
                handoff.assert_called_once_with()
                download.assert_called_once_with(data['assets'][0]['browser_download_url'])
                self.assertEqual((self.manager.base / '1.0.1' / NAME).read_bytes(), PAYLOAD)
                plan = json.loads((self.manager.base / 'pending.json').read_text())
                self.assertEqual(plan['version'], '1.0.1')
                self.assertEqual(plan['current'], '1.0.0')
                self.assertEqual(plan['sha256'], hashlib.sha256(PAYLOAD).hexdigest())
                self.assertEqual((self.program / 'InspirationCollector.exe').read_bytes(), b'original program')


if __name__ == '__main__':
    unittest.main()
