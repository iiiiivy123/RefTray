import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

class ImportBoundaryTests(unittest.TestCase):
    def test_importing_factory_does_not_create_real_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'not-created'
            env={**os.environ,'LIBLIB_ROOT':str(root)}
            result=subprocess.run([sys.executable,'-c',"from server.app import create_app; import os; from pathlib import Path; assert not Path(os.environ['LIBLIB_ROOT']).exists()"],env=env,capture_output=True,text=True,timeout=15)
            self.assertEqual(0,result.returncode,result.stderr)
