"""Keep the public allowlist complete without admitting private work files."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]

@unittest.skipUnless(shutil.which("git") and (ROOT / ".git").exists(), "requires a Git checkout")
class RepositoryHygieneTests(unittest.TestCase):
    def test_tracked_public_files_are_not_ignored(self):
        result = subprocess.run(["git", "ls-files", "-ci", "--exclude-standard"], cwd=ROOT,
                                capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout.strip(), "")

    def test_local_data_and_unreviewed_files_remain_ignored(self):
        paths = [".env", "private.txt", "dist/release.zip", "build-windows/payload.exe",
                 "work/session.json", "source/server/.env.local", "source/server/state.sqlite",
                 "source/server/debug.log", "source/server/__pycache__/cache.pyc",
                 "source/extension/live-test.js", "installer/private.generated.iss",
                 "docs/private-notes.md", "docs/assets/private.svg",
                 "tests/collector/pinterest_public_evidence/private.json"]
        result = subprocess.run(["git", "check-ignore", "--no-index", "-z", "--stdin"], cwd=ROOT,
                                input=("\0".join(paths)+"\0").encode(), capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(set(result.stdout.decode().rstrip("\0").split("\0")), set(paths))

if __name__ == "__main__":
    unittest.main()
