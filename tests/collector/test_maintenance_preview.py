import hashlib,json,tempfile,unittest
from pathlib import Path
from server.maintenance import cleanup_upgrade

class MaintenancePreviewTests(unittest.TestCase):
 def test_preview_neither_backs_up_nor_deletes_program_files(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp);root=base/'program';(root/'server').mkdir(parents=True)
   changed=root/'server/changed.py';changed.write_text('user edit')
   obsolete=root/'server/old.py';obsolete.write_text('old')
   previous={'schema_version':1,'files':{'server/changed.py':hashlib.sha256(b'original').hexdigest(),'server/old.py':hashlib.sha256(b'old').hexdigest()}}
   (root/'managed-files.json').write_text(json.dumps(previous))
   incoming=base/'incoming.json';incoming.write_text(json.dumps({'schema_version':1,'files':{'server/changed.py':'new'}}))
   before={str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*') if p.is_file()}
   cleanup_upgrade(root,incoming,state=base/'state',plan_only=True)
   self.assertEqual(before,{str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*') if p.is_file()})
   self.assertFalse((root/'preserved-program-files').exists())
