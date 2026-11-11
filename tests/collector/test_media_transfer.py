import io
import hashlib
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import build_opener, ProxyHandler
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from unittest.mock import patch

from server.media_transfer import transfer, candidates


class Response(io.BytesIO):
    status=200
    def __init__(self, body, expected=None):
        super().__init__(body)
        self.headers={'Content-Length':str(expected if expected is not None else len(body))}


class TransferTests(unittest.TestCase):
    def test_real_socket_disconnect_restarts_track_and_matches_complete_digest(self):
        complete=b'media-track-'+b'1234567890'*30000
        requests=[]
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append(self.path)
                self.send_response(200);self.send_header('Content-Length',str(len(complete)));self.end_headers()
                self.wfile.write(b'incomplete-prefix'*9000 if self.path=='/first' else complete)
                self.wfile.flush();self.close_connection=True
            def log_message(self,*args):pass
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        try:
            with tempfile.TemporaryDirectory() as temporary:
                base='http://127.0.0.1:'+str(server.server_port)
                target=Path(temporary)/'track.part';switches=[]
                result=transfer(target,[base+'/first',base+'/backup'],
                    open_source=lambda url:build_opener(ProxyHandler({})).open(url,timeout=5),
                    checkpoint=lambda:None,sniff=lambda _:('.mp4','video/mp4'),limit=len(complete),
                    progress=lambda *_:None,switching=lambda:switches.append(True))
                self.assertEqual(target.read_bytes(),complete)
                self.assertEqual(result[1].hexdigest(),hashlib.sha256(complete).hexdigest())
                self.assertEqual(requests,['/first','/backup']);self.assertEqual(switches,[True])
        finally:
            server.shutdown();server.server_close();worker.join(timeout=5)

    def test_midstream_disconnect_discards_partial_and_saves_one_complete_track(self):
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'track.part';calls=[];switches=[]
            def open_source(url):
                calls.append(url)
                return Response(b'bad-prefix',30) if url=='first' else Response(b'correct-media')
            result=transfer(path,['first','backup'],open_source=open_source,checkpoint=lambda:None,
                            sniff=lambda _:('.mp4','video/mp4'),limit=100,progress=lambda *_:None,switching=lambda:switches.append(True))
            self.assertEqual(path.read_bytes(),b'correct-media')
            self.assertEqual(result[0],13)
            self.assertEqual(calls,['first','backup']);self.assertEqual(switches,[True])

    def test_stop_and_size_limit_never_try_another_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            for failure in ('cancel','size'):
                with self.subTest(failure=failure):
                    calls=[];points=0
                    def checkpoint():
                        nonlocal points
                        points+=1
                        if failure=='cancel' and points==2:raise InterruptedError('stopped')
                    def open_source(url):calls.append(url);return Response(b'1234567890')
                    with self.assertRaises(InterruptedError if failure=='cancel' else ValueError):
                        transfer(Path(temporary)/failure,['first','backup'],open_source=open_source,checkpoint=checkpoint,
                                 sniff=lambda _:('.mp4','video/mp4'),limit=100 if failure=='cancel' else 5,progress=lambda *_:None)
                    self.assertEqual(calls,['first'])

    def test_invalid_content_and_disk_errors_propagate(self):
        with tempfile.TemporaryDirectory() as temporary:
            calls=[]
            def open_source(url):calls.append(url);return Response(b'<html>login</html>')
            def sniff(_):raise ValueError('not video')
            with self.assertRaisesRegex(ValueError,'not video'):
                transfer(Path(temporary)/'media',['first','backup'],open_source=open_source,checkpoint=lambda:None,sniff=sniff,limit=100,progress=lambda *_:None)
            self.assertEqual(calls,['first'])

    def test_backup_cannot_switch_work_track_platform_or_private_address(self):
        main='https://a.bilivideo.com/upgcxcode/1/2/3/audio.m4s'
        with patch('server.media_transfer.validate_file_url',side_effect=lambda url:url) as validated:
            self.assertEqual(len(candidates(main,[main.replace('a.','b.')],'bilibili')),2)
            self.assertEqual(validated.call_count,2)
            for url in (main.replace('audio.m4s','video.m4s'),main.replace('bilivideo.com','googlevideo.com'),main.replace('a.bilivideo.com','127.0.0.1')):
                with self.assertRaisesRegex(ValueError,'当前媒体轨道'):candidates(main,[url],'bilibili')


if __name__=='__main__':unittest.main()
