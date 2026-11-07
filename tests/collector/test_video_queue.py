import copy
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from server.video_queue import VideoQueue

class Journal:
    def __init__(self): self.records = {}
    def save_task(self, value): self.records[value['id']] = copy.deepcopy(value)

class Videos:
    def __init__(self, fail=None, wait=False):
        self.started=[]; self.active=None; self.fail=fail; self.wait=wait; self.stopped=False
        self.entered=threading.Event()
    def busy(self): return self.active is not None
    def start(self, root, value):
        if self.active: raise AssertionError('concurrent downloads')
        self.started.append(value.url); self.active=str(len(self.started));self.entered.set();return self.active
    def status(self, identity):
        if self.wait and not self.stopped: return {'status':'running'}
        self.active=None
        return {'status':'stopped' if self.stopped else 'failed' if int(identity)==self.fail else 'completed',
                'result':{'path':'saved-'+identity+'.mp4'}}
    def control(self, identity, action): self.stopped = action == 'stopped'

class QueueTests(unittest.TestCase):
    def run_queue(self, videos, stop=False):
        journal=Journal(); queue=VideoQueue(videos,journal,lambda:SimpleNamespace(inbox=Path('test-output')))
        sources=[{'url':'https://video.twimg.com/'+str(i)+'.mp4'} for i in range(3)]
        with patch('server.video_queue.resolve', return_value={'media':sources}):
            result=queue.start('https://x.com/example/status/123')
            if stop:
                self.assertTrue(videos.entered.wait(2))
                with self.assertRaises(ValueError):queue.start('https://x.com/example/status/456')
                queue.stop(result['job_id'])
            deadline=time.monotonic()+3
            while queue.busy() and time.monotonic()<deadline:time.sleep(.01)
            self.assertFalse(queue.busy())
        return journal.records[result['job_id']]
    def test_all_media_are_serial_and_each_result_survives(self):
        videos=Videos();record=self.run_queue(videos)
        self.assertEqual(len(videos.started),3)
        self.assertEqual(record['status'],'completed')
        self.assertEqual([r['result']['path'] for r in record['records'].values()],['saved-1.mp4','saved-2.mp4','saved-3.mp4'])
    def test_failed_child_does_not_discard_other_results(self):
        record=self.run_queue(Videos(fail=2))
        self.assertEqual(record['status'],'partial')
        self.assertEqual([r['status'] for r in record['records'].values()],['saved','failed','saved'])
    def test_stop_cancels_current_child_and_prevents_next(self):
        videos=Videos(wait=True);record=self.run_queue(videos,True)
        self.assertEqual(record['status'],'stopped')
        self.assertEqual(len(videos.started),1)

class QueueMediaTests(unittest.TestCase):
    def test_queue_runs_real_media_workers_and_writes_two_decodable_files(self):
        import io
        import json
        import shutil
        import subprocess
        import tempfile
        from urllib.response import addinfourl
        from unittest.mock import Mock
        from server.video import VideoDownloads
        if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
            self.skipTest('Full media tools unavailable')
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            clips={}
            for index,color in enumerate(('red','blue')):
                path=root/f'input-{index}.mp4'
                subprocess.run([shutil.which('ffmpeg'),'-v','error','-f','lavfi','-i',f'color={color}:s=160x120:r=10',
                    '-f','lavfi','-i','sine=frequency=440','-t','0.5','-c:v','libx264','-c:a','aac',str(path)],check=True)
                clips[f'https://video.twimg.com/queue-{index}.mp4']=path.read_bytes()
            opener=Mock()
            def open_media(request, **kwargs):
                data=clips[request.full_url]
                return addinfourl(io.BytesIO(data),{'Content-Length':str(len(data))},request.full_url,code=200)
            opener.open.side_effect=open_media
            journal=Journal(); videos=VideoDownloads()
            queue=VideoQueue(videos,journal,lambda:SimpleNamespace(inbox=root/'saved'))
            with patch('server.video_queue.resolve',return_value={'media':[{'url':url,'page_title':'Queue test'} for url in clips]}),patch('server.video.public_opener',return_value=opener),patch('server.video.validate_url',side_effect=lambda url:url):
                identity=queue.start('https://x.com/example/status/123')['job_id']
                deadline=time.monotonic()+15
                while queue.busy() and time.monotonic()<deadline:time.sleep(.05)
                self.assertFalse(queue.busy())
            result=journal.records[identity]
            self.assertEqual(result['status'],'completed',result)
            paths=[r['result']['path'] for r in result['records'].values()]
            self.assertEqual(len(set(paths)),2)
            for path in paths:
                report=json.loads(subprocess.check_output([shutil.which('ffprobe'),'-v','error','-show_entries','stream=codec_name','-of','json',path]))
                self.assertEqual({s['codec_name'] for s in report['streams']},{'h264','aac'})
