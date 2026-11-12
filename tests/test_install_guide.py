"""Run the optional documentation snippet in Windows PowerShell, without an installer."""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class InstallGuideTests(unittest.TestCase):
    def test_normal_install_does_not_require_checksum_commands(self):
        text = (ROOT / 'docs/install.md').read_text('utf-8')
        optional = text.index('## 可选：')
        self.assertLess(text.index('## 5.'), optional)
        self.assertNotIn('Get-FileHash', text[:optional])
        self.assertIn('不是必做', text[optional:])
        self.assertIn('首次仍需手动加载一次', text)
        self.assertNotIn('逐字对照', text)

    def test_user_guides_describe_current_features_without_intro_versions(self):
        files = list((ROOT / 'docs').glob('*.md')) + list(ROOT.glob('README*.md'))
        files += list((ROOT / 'docs/marketing').glob('*.md'))
        for file in files:
            with self.subTest(file=str(file.relative_to(ROOT))):
                text = file.read_text('utf-8')
                self.assertNotRegex(text, r'0\.5\.\d+\s*起|从\s*0\.5\.\d+\s*开始')

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell behavior test')
    def test_optional_checksum_snippet(self):
        text = (ROOT / 'docs/install.md').read_text('utf-8')
        snippet = re.search(r'```powershell\n(.*?)\n```', text, re.S)[1]
        name = 'InspirationCollector-1.0.1-Windows-x64-Setup.exe'
        checksum_name = 'SHA256SUMS-1.0.1.txt'
        data = b'test fixture only; not an executable'
        digest = hashlib.sha256(data).hexdigest()
        cases = [
            ('valid', f'{digest}  {name}', True, True),
            ('upper_and_star', f'{digest.upper()} *{name}', True, True),
            ('mismatch', f'{"0" * 64}  {name}', True, False),
            ('wrong_version', f'{digest}  InspirationCollector-1.0.0-Windows-x64-Setup.exe', True, False),
            ('duplicate', f'{digest}  {name}\n{digest}  {name}', True, False),
            ('malformed', f'invalid  {name}', True, False),
            ('missing_installer', f'{digest}  {name}', False, False),
            ('missing_sums', None, True, False),
        ]
        for case, sums, installer, passed in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory(prefix='RefTray 中文 [校验] ') as temp:
                folder = Path(temp)
                if installer:
                    (folder / name).write_bytes(data)
                if sums is not None:
                    (folder / checksum_name).write_text(sums + '\n', encoding='utf-8-sig')
                script = folder / 'check.ps1'
                script.write_text('[Console]::OutputEncoding = [Text.Encoding]::UTF8\nSet-Location -LiteralPath $PSScriptRoot\n' + snippet, encoding='utf-8-sig')
                env = os.environ.copy()
                env.pop('PSModulePath', None)
                result = subprocess.run(['powershell.exe', '-NoProfile', '-File', str(script)], cwd=temp,
                                        capture_output=True, encoding='utf-8', timeout=30, env=env)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('校验通过' if passed else '校验失败', result.stdout, result.stderr)
                self.assertNotIn('校验失败' if passed else '校验通过', result.stdout)
                if installer:
                    self.assertEqual((folder / name).read_bytes(), data)


if __name__ == '__main__':
    unittest.main()