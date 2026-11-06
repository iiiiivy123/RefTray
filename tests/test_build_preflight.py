import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import build_windows


class BuildPreflightTests(unittest.TestCase):
    def test_old_host_is_rejected_before_running_pip(self):
        with patch.object(build_windows.sys, 'version_info', (3, 10, 0)), patch.object(build_windows.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'Python >=3.11'):
                build_windows.preflight_dependencies()
            run.assert_not_called()

    def test_user_pip_routing_is_not_inherited_or_modified(self):
        with patch.dict(os.environ, {'PIP_USER': '1', 'PIP_TARGET': 'wrong', 'PIP_CONFIG_FILE': 'wrong.ini', 'PIP_INDEX_URL': 'https://invalid.example'}):
            env = build_windows.pip_environment()
            self.assertEqual(env['PIP_USER'], '0')
            self.assertEqual(env['PIP_CONFIG_FILE'], os.devnull)
            self.assertNotIn('PIP_TARGET', env)
            self.assertNotIn('PIP_INDEX_URL', env)
            self.assertEqual(os.environ['PIP_USER'], '1')

    def test_failed_preflight_prevents_payload_and_archive_creation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = root / 'source/extension/manifest.json'
            manifest.parent.mkdir(parents=True)
            manifest.write_text('{"version":"0.5.37"}', 'utf-8')
            with patch.object(build_windows, 'ROOT', root), patch.object(build_windows, 'preflight_dependencies', side_effect=ValueError('missing wheel')), patch.object(build_windows, 'build') as archive:
                with self.assertRaisesRegex(ValueError, 'missing wheel'):
                    build_windows.build_windows()
                archive.assert_not_called()
                self.assertFalse((root / 'build-windows').exists())
                self.assertFalse((root / 'dist').exists())

    def test_dependency_recipe_targets_runtime_not_host(self):
        command = build_windows.dependency_command('wheels', 'lock', 'target')
        self.assertEqual(command[command.index('--python-version') + 1], '3.13')
        self.assertEqual(command[command.index('--abi') + 1], 'cp313')
        self.assertIn('--no-index', command)
        self.assertIn('--require-hashes', command)

    def test_missing_compiler_is_rejected_before_payload_creation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = root / 'source/extension/manifest.json'
            manifest.parent.mkdir(parents=True)
            manifest.write_text('{"version":"0.5.37"}', 'utf-8')
            with patch.object(build_windows, 'ROOT', root), patch.object(build_windows, 'preflight_dependencies', return_value={}), patch.object(build_windows, 'CSHARP_COMPILER', root / 'missing-csc.exe'), patch.object(build_windows, 'build') as archive:
                with self.assertRaisesRegex(ValueError, 'missing C# compiler'):
                    build_windows.build_windows()
                archive.assert_not_called()
            self.assertFalse((root / 'build-windows').exists())
