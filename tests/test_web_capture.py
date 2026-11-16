import base64
import hashlib
import io
import json
import tempfile
import sqlite3
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
from fastapi import FastAPI, HTTPException
from PIL import Image
from server.catalog import Catalog
from server.config import Settings
from server.image_validation import validate_image
from server.page_snapshots import attach
from server.models import CollectRequest
from server.storage import Storage
from test_runtime_contracts import TestClient


SVG=b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="a"><stop stop-color="red"/></linearGradient></defs><rect width="64" height="64" fill="url(#a)"/></svg>'

class VectorTests(unittest.TestCase):
    def test_preserves_original_vector_and_catalog(self):
        self.assertEqual(validate_image(SVG),'.svg')
        with tempfile.TemporaryDirectory() as root:
            storage=Storage(Settings(Path(root),save_directory=Path(root)))
            result=storage.collect(CollectRequest(canonical_url='https://example.com/logo.svg',page_title='Vector test',platform='generic',images=[{'url':'https://example.com/logo.svg','data_base64':base64.b64encode(SVG).decode()}],ocr_enabled=False),lambda *args:None)
            files=list(Path(result['directory']).glob('*.svg'))
            self.assertEqual(len(files),1)
            self.assertEqual(files[0].read_bytes(),SVG)
            with storage.catalog.connect() as db:
                record=json.loads(db.execute('select files from captures').fetchone()[0])
            self.assertTrue(any(f['sha']==hashlib.sha256(SVG).hexdigest() for f in record))

    def test_rejects_active_or_broken_vectors(self):
        cases=['<script>alert(1)</script>','<foreignObject/>','<rect onload="alert(1)"/>','<use href="https://example.com/a.svg#a"/>','<style>@import "https://example.com/a.css";</style>','<rect fill="url(https://example.com/a)"/>','<style>rect{fill:url(https://example.com/a</style>','<image href="data:image/png;base64,AA"/>']
        for body in cases:
            with self.subTest(body=body),self.assertRaises(ValueError):validate_image(('<svg xmlns="http://www.w3.org/2000/svg">'+body+'</svg>').encode())
        for data in [b'<svg',b'<!DOCTYPE svg><svg/>',b'<html/>',b'<svg>'+b' '*2097152+b'</svg>']:
            with self.subTest(data=data[:30]),self.assertRaises(ValueError):validate_image(data)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.catalog=Catalog(self.root);self.settings=Settings(self.root,save_directory=self.root/'library')
        app=FastAPI()
        def authorize(request):
            if request.headers.get('X-Collector-Token')!='test':raise HTTPException(403,'no')
        self.busy,self.stop=attach(app,lambda:self.settings,self.catalog,authorize,lambda:False)
        self.client=TestClient(app);self.headers={'X-Collector-Token':'test'}

    def tearDown(self):self.temp.cleanup()
    def post(self,path,value):return self.client.post('/page-snapshots/'+path,headers=self.headers,json=value)
    def start(self):
        r=self.post('start',{'url':'https://example.com/layout?original=yes','title':'完整布局'})
        self.assertEqual(r.status_code,200,r.json());return r.json()['id']
    def png(self):
        out=io.BytesIO();Image.new('RGB',(100,600),'white').save(out,format='PNG')
        return dict(png=base64.b64encode(out.getvalue()).decode(),width=100,height=600,css_width=100,css_height=600,device_scale=1,tiles=3)
    def test_full_artifact_provenance_record_and_busy(self):
        identity=self.start();self.assertTrue(self.busy())
        self.assertEqual(self.post('start',{'url':'https://example.com'}).status_code,409)
        result=self.post(identity+'/finish',self.png());self.assertEqual(result.status_code,200,result.json())
        folder=Path(result.json()['directory']);self.assertFalse(self.busy())
        self.assertEqual(Image.open(folder/'整页.png').size,(100,600))
        self.assertIn('https://example.com/layout?original=yes',(folder/'来源.md').read_text('utf-8'))
        meta=json.loads((folder/'来源.json').read_text('utf-8'));self.assertEqual(meta['tiles'],3)
        with self.catalog.connect() as db:
            record=db.execute('select files from captures').fetchone()
            task=json.loads(db.execute('select data from tasks').fetchone()[0])
        self.assertEqual(len(json.loads(record[0])),3);self.assertEqual(task['status'],'completed')
        self.assertEqual(meta['sha256'],hashlib.sha256((folder/'整页.png').read_bytes()).hexdigest())

    def test_bad_dimensions_fail_without_partial_folder(self):
        identity=self.start();value=self.png();value['height']=601
        r=self.post(identity+'/finish',value);self.assertEqual(r.status_code,400)
        self.assertFalse(self.busy());self.assertFalse((self.root/'library').exists())
        with self.catalog.connect() as db:self.assertEqual(json.loads(db.execute('select data from tasks').fetchone()[0])['status'],'failed')

    def test_stop_auth_and_expiration(self):
        self.assertEqual(self.client.post('/page-snapshots/start',json={'url':'https://example.com'}).status_code,403)
        identity=self.start();self.stop()
        self.assertEqual(self.post(identity+'/finish',self.png()).status_code,409)

        identity=self.start()
        with patch('server.page_snapshots.time.monotonic',return_value=10**15):self.assertFalse(self.busy())
        self.assertEqual(self.post(identity+'/finish',self.png()).status_code,409)

    def test_record_failure_keeps_written_image_and_reports_failure(self):
        identity=self.start()
        with patch.object(self.catalog,'record',side_effect=sqlite3.OperationalError('disk error')):
            r=self.post(identity+'/finish',self.png())
        self.assertEqual(r.status_code,500);self.assertIn('已写文件保留',r.json()['detail'])
        self.assertFalse(self.busy());self.assertEqual(len(list(self.root.rglob('整页.png'))),1)

    def test_flat_layout_and_no_root_change_mid_capture(self):
        self.catalog.defaults({'layout':'organized_flat'})
        identity=self.start();self.settings=Settings(self.root,save_directory=self.root/'new-library')
        r=self.post(identity+'/finish',self.png());self.assertEqual(r.status_code,200)
        self.assertEqual(Path(r.json()['directory']).parent,self.root/'library'/'图片')

    def test_app_busy_blocks_new_capture_but_allows_status_read(self):
        from server.app import create_app
        app=create_app(SimpleNamespace(settings=self.settings,storage=Storage(self.settings),videos=SimpleNamespace(busy=lambda:False,request_stop_all=lambda:None)))
        client=TestClient(app)
        headers={'X-Collector-Token':client.get('/health').json()['settings_token']}
        r=client.post('/page-snapshots/start',headers=headers,json={'url':'https://example.com'})
        self.assertEqual(r.status_code,200,r.json())
        self.assertTrue(client.get('/health').json()['busy'])
        self.assertEqual(client.get('/collect/status/missing',headers=headers).status_code,404)
        self.assertEqual(client.post('/collect/start',headers=headers,json={'canonical_url':'https://example.com','images':[]}).status_code,409)
        app.state.runtime.request_stop_all()
        self.assertFalse(client.get('/health').json()['busy'])

