import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from server.video_queue import VideoQueue

class Catalog:
    def __init__(self): self.saved=[]
    def defaults(self): return {'max_video_mb': 12, 'duplicate_policy':'refresh'}
    def save_task(self, record): self.saved.append(record.copy())

class Videos:
    def __init__(self): self.values=[]
    def busy(self): return False
    def start(self, root, value): self.values.append(value); return 'child'
    def status(self, identity): return {'status':'completed','result':{}}

class QueueDefaultsTests(unittest.TestCase):
    def test_stop_interrupts_discovery_before_starting_any_download(self):
        catalog=Catalog();videos=Videos();queue=VideoQueue(videos,catalog,lambda:SimpleNamespace(inbox=Path('scratch')))
        def resolve(url, *, captions, checkpoint):
            queue.stop(); checkpoint()
        queue.active='test'
        record={'id':'test','source':'https://x.com/test/status/123','platform':'x','records':{}}
        with patch('server.video_queue.resolve',side_effect=resolve):
            queue._run(record,Path('scratch'),{})
        self.assertEqual(videos.values,[]);self.assertFalse(queue.busy())
        self.assertEqual(catalog.saved[-1]['status'],'stopped')

    def test_queued_children_use_one_settings_snapshot(self):
        catalog=Catalog();videos=Videos();queue=VideoQueue(videos,catalog,lambda:SimpleNamespace(inbox=Path('scratch')))
        pending=[]
        class Thread:
            def __init__(self, target, args, daemon): pending.append((target,args))
            def start(self): pass
        with patch('server.video_queue.threading.Thread',Thread):
            queue.start('https://x.com/test/status/123')
        catalog.defaults=lambda:{'max_video_mb':999}
        with patch('server.video_queue.resolve',return_value={'media':[{'url':'https://video.twimg.com/test.mp4'}]*2}):
            fn,args=pending[0];fn(*args)
        self.assertEqual([v.max_video_mb for v in videos.values],[12,12])
        self.assertEqual([v.duplicate_policy for v in videos.values],['refresh','refresh'])
        self.assertFalse(queue.busy())
        self.assertEqual(catalog.saved[-1]['status'],'completed')

    def test_bad_defaults_do_not_leave_busy_queue(self):
        catalog=Catalog();catalog.defaults=lambda:{'max_video_mb':-1}
        queue=VideoQueue(Videos(),catalog,lambda:SimpleNamespace(inbox=Path('scratch')))
        with self.assertRaises(ValueError): queue.start('https://x.com/test/status/123')
        self.assertFalse(queue.busy())
        self.assertEqual(catalog.saved,[])
