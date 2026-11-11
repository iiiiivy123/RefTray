"""Public distribution contracts; no personal runtime or project data is part of a release."""
import importlib.util,json,re,sys,tempfile,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import build_release
class DistributionTests(unittest.TestCase):
    def test_user_archive_contains_brand_and_redistribution_notices(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive=build_release.build('user',Path(tmp))
            with zipfile.ZipFile(archive) as z:
                names=set(z.namelist())
                for name in ['extension/reftray-a.svg','extension/reftray-a.ico','extension/reftray-a-dark.ico','docs/install.md','docs/update.md','docs/save-layout.md','docs/releases/release-1.0.1.md','help/save-layout.html','help/SAVE-LAYOUT-REVIEW-2026-11-11.html','licenses/CAT-LOGUE-LICENSE.txt','licenses/third-party-notices.md','licenses/third-party-media.md','licenses/ytdlp-license.md']:
                    self.assertIn(name,names)
                self.assertFalse(any(n.startswith(('docs/development/','docs/marketing/')) or n.endswith('review-fixes.md') for n in names))
                self.assertFalse(any('live-test.' in n or 'collector-settings.json' in n or '.sqlite' in n or n.startswith('data/') for n in names))
                self.assertIsNone(z.testzip())
    def test_setup_requires_version_parameter_and_preserves_upgrade_identity(self):
        setup=(ROOT/'installer/setup.iss').read_text('utf-8-sig')
        self.assertIn('#ifndef AppVersion',setup)
        self.assertIn('#error',setup)
        self.assertIn('293CFEA9-3205-4D70-96E6-A5F7491438CC',setup)
        self.assertIn('PrivilegesRequired=lowest',setup)
        self.assertNotIn('UninstallDelete',setup)
    def test_launcher_uses_manifest_release_proxy_free_health_logs_and_brand(self):
        code=(ROOT/'installer/Launcher.cs').read_text('utf-8-sig')
        self.assertNotIn('0.5.13',code)
        self.assertIn('manifest.json',code)
        self.assertIn('Proxy=null',code)
        self.assertIn('reftray-a.ico',code)
        self.assertIn('service-errors.log',code)
        self.assertIn('private_clipboard',code)
    def test_build_explicitly_passes_version_icon_and_extra_guides(self):
        code=(ROOT/'tools/build_windows.py').read_text('utf-8-sig')
        self.assertIn('/DAppVersion=',code)
        self.assertIn('/win32icon:',code)
        self.assertIn('install.md',code);self.assertIn('update.md',code)
        self.assertIn("if __name__",code)
if __name__=='__main__':unittest.main()
