"""API and isolated Windows preference checks, NOT login/install acceptance."""
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4

from test_runtime_contracts import TestClient
from server.config import Settings, load_settings
from server.app import create_app
from server import startup


class OnboardingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'state'
        self.env = patch.dict(os.environ, {'LIBLIB_ROOT': str(self.root)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = TestClient(create_app())
        self.headers = {'X-Collector-Token': self.client.get('/health').json()['settings_token']}

    def test_first_choice_persists_and_upgrade_keeps_files_and_defaults(self):
        self.assertFalse(self.client.get('/health').json()['library_configured'])
        library = self.root.parent / '素材库 中文 [test]'
        library.mkdir()
        old = library / 'existing.png'
        old.write_bytes(b'keep-user-content')
        response = self.client.post('/settings/directory', headers=self.headers, json={'directory': str(library)})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['library_configured'])
        self.assertEqual(Path(response.json()['inbox']), library)
        defaults = self.client.get('/settings/defaults', headers=self.headers).json()
        defaults['limit'] = 37
        self.assertEqual(self.client.post('/settings/defaults', headers=self.headers, json=defaults).status_code, 200)
        reopened = TestClient(create_app())
        self.assertTrue(reopened.get('/health').json()['library_configured'])
        self.assertEqual(load_settings().inbox, library)
        self.assertEqual(old.read_bytes(), b'keep-user-content')
        headers = {'X-Collector-Token': reopened.get('/health').json()['settings_token']}
        self.assertEqual(reopened.get('/settings/defaults', headers=headers).json()['limit'], 37)

    def test_new_folder_and_failed_selection_preserve_saved_choice(self):
        library = self.root.parent / 'new-library'
        self.assertEqual(self.client.post('/settings/directory', headers=self.headers, json={'directory': str(library)}).status_code, 200)
        self.assertTrue(library.is_dir())
        config = self.root / 'data/inspiration/collector-settings.json'
        before = config.read_bytes()
        bad = self.root.parent / 'not-a-folder'
        bad.write_bytes(b'existing file')
        for directory in ('', 'relative', str(bad)):
            response = self.client.post('/settings/directory', headers=self.headers, json={'directory': directory})
            self.assertGreaterEqual(response.status_code, 400)
            self.assertEqual(config.read_bytes(), before)
        with patch('server.config.tempfile.TemporaryFile', side_effect=PermissionError('read-only')):
            response = self.client.post('/settings/directory', headers=self.headers, json={'directory': str(library)})
        self.assertEqual(response.status_code, 400)
        self.assertIn('read-only', response.json()['detail'])
        self.assertEqual(config.read_bytes(), before)

    def test_legacy_inbox_is_already_configured(self):
        legacy = self.root / 'data/inspiration/inbox'
        legacy.mkdir(parents=True)
        self.assertTrue(load_settings().library_configured)
        self.assertEqual(load_settings().inbox, legacy)

    def test_startup_auth_and_error_are_explicit(self):
        with patch('server.startup.preference', return_value={'enabled': True}) as preference:
            self.assertEqual(self.client.post('/settings/startup', json={'enabled': True}).status_code, 403)
            preference.assert_not_called()
            self.assertEqual(self.client.post('/settings/startup', headers=self.headers, json={'enabled': True}).json(), {'enabled': True})
            preference.assert_called_once_with(True)
        with patch('server.startup.preference', side_effect=PermissionError('denied')):
            failed = self.client.post('/settings/startup', headers=self.headers, json={'enabled': False})
            self.assertEqual(failed.status_code, 400)
            self.assertIn('denied', failed.json()['detail'])

    @unittest.skipUnless(os.name == 'nt', 'Windows registry fixture')
    def test_preference_roundtrip_only_in_disposable_registry_key(self):
        import winreg
        key = r'Software\RefTray-Test-' + uuid4().hex
        self.addCleanup(lambda: winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key))
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key) as handle:
            winreg.SetValueEx(handle, 'Unrelated', 0, winreg.REG_SZ, 'keep')
        with patch.object(startup, 'RUN_KEY', key), patch.object(startup, 'command', return_value='"C:\\program with spaces\\InspirationCollector.exe" --autostart'):
            self.assertFalse(startup.preference()['enabled'])
            self.assertTrue(startup.preference(True)['enabled'])
            self.assertTrue(startup.preference()['enabled'])
            self.assertFalse(startup.preference(False)['enabled'])
            self.assertFalse(startup.preference()['enabled'])
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as handle:
            self.assertEqual(winreg.QueryValueEx(handle, 'Unrelated')[0], 'keep')


if __name__ == '__main__':
    unittest.main()
