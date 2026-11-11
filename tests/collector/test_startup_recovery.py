import tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from server.catalog import Catalog
from server.config import Settings
from server.app import create_app
from server.video import VideoDownloads

class StartupRecoveryTests(unittest.TestCase):
 def test_restart_preserves_records_and_advances_revision_once(self):
  with tempfile.TemporaryDirectory() as tmp:
   settings=Settings(Path(tmp));catalog=Catalog(settings.root)
   for mode in ('browser-capture','video-queue'):
    catalog.save_task({'id':mode,'mode':mode,'status':'running','completed':False,'records':{'one':{'status':'saved','result':{'path':'kept.mp4'}}}})
   catalog.save_task({'id':'done','mode':'video-queue','status':'completed','completed':True})
   before={x['id']:x for x in catalog.tasks()}
   runtime=SimpleNamespace(settings=settings,storage=SimpleNamespace(catalog=catalog),videos=VideoDownloads(catalog))
   create_app(runtime)
   for key in ('browser-capture','video-queue'):
    value=catalog.get_task(key)
    self.assertEqual(value['status'],'interrupted');self.assertEqual(value['revision'],before[key]['revision']+1)
    self.assertEqual(value['records'],before[key]['records'])
   self.assertEqual(catalog.get_task('done'),before['done'])
   first=catalog.tasks();create_app(runtime);self.assertEqual(catalog.tasks(),first)
