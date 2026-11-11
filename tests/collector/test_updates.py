import asyncio
from contextlib import closing
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from starlette.requests import Request
from server.config import Settings
from server.updates import Updates, release_info, checksum_for, allowed_url, OfficialRedirect, backup_state, attach, atomic_json


def metadata(payload=b'installer'):
    number='1.0.0'; tag='v'+number
    name=f'InspirationCollector-{number}-Windows-x64-Setup.exe'
    names=[name,f'SHA256SUMS-{number}.txt']
    return {'tag_name':tag,'draft':False,'prerelease':False,'assets':[
        {'name':n,'state':'uploaded','size':len(payload),'digest':'sha256:'+hashlib.sha256(payload).hexdigest(),
         'browser_download_url':f'https://github.com/iiiiivy123/inspiration-collector/releases/download/{tag}/{n}'} for n in names]}


class UpdateTests(unittest.TestCase):
    def test_status_replace_retries_a_windows_reader_but_preserves_real_errors(self):
        original=os.replace;attempts=[]
        def replace(source,target):
            attempts.append(target)
            if len(attempts)<3: raise PermissionError('sharing violation')
            return original(source,target)
        path=self.manager.base/'status.json'
        with patch('server.updates.os.replace',side_effect=replace),patch('server.updates.time.sleep'):
            atomic_json(path,{'phase':'completed'})
        self.assertEqual(json.loads(path.read_text())['phase'],'completed');self.assertEqual(len(attempts),3)
        with patch('server.updates.os.replace',side_effect=PermissionError('denied')),patch('server.updates.time.sleep'),self.assertRaises(PermissionError):
            atomic_json(path,{'phase':'failed'})
        self.assertEqual(json.loads(path.read_text())['phase'],'completed')

    def test_interrupted_installer_does_not_lock_updates_forever(self):
        atomic_json(self.manager.base/'status.json', {'phase':'installing','version':'1.0.0','worker_pid':123})
        with patch('server.updates.update_worker_alive',return_value=False):
            self.assertEqual(self.manager.status()['phase'],'failed')
        with patch('server.updates.update_worker_alive',return_value=True):
            self.assertEqual(self.manager.status()['phase'],'installing')

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name);self.program=self.base/'program';self.program.mkdir()
        (self.program/'InspirationCollector.exe').write_bytes(b'old')
        (self.program/'managed-files.json').write_text(json.dumps({'release':'0.5.48','files':{'InspirationCollector.exe':hashlib.sha256(b'old').hexdigest()}}))
        self.root=self.base/'state';self.settings=Settings(self.root)
        self.manager=Updates(self.settings,'0.5.48',lambda:False,self.program)

    def test_only_new_official_complete_release_is_installable(self):
        value=metadata();self.assertTrue(release_info(value,'0.5.48')['available'])
        self.assertFalse(release_info(value,'1.0.0')['available'])
        self.assertFalse(release_info(value,'2.0.0')['available'])
        for change in ({'prerelease':True},{'draft':True},{'tag_name':'../../bad'},{'assets':[]}):
            with self.subTest(change=change),self.assertRaises(ValueError):release_info({**value,**change},'0.5.48')
        value['assets'][0]['browser_download_url']='https://github.com/other/project/installer.exe'
        with self.assertRaises(ValueError):release_info(value,'0.5.48')

    def test_redirect_and_checksum_boundaries(self):
        for url in ['http://github.com/a','https://evil.invalid/a','https://github.com@127.0.0.1/a','https://github.com:8082/a','file:///C:/a']:
            with self.subTest(url=url),self.assertRaises(ValueError):allowed_url(url)
        allowed_url('https://release-assets.githubusercontent.com/example?signature=redacted')
        with self.assertRaises(ValueError):OfficialRedirect().redirect_request(None,None,302,'',{},'https://evil.invalid/')
        line='a'*64+'  setup.exe'
        self.assertEqual(checksum_for(line,'setup.exe'),'a'*64)
        for text in ['',line+'\n'+line,'a'*64+'  other.exe']:
            with self.assertRaises(ValueError):checksum_for(text,'setup.exe')

    def run_download(self, payload=b'installer', wire=None, checksum=None, busy=False):
        self.manager.busy=lambda:busy
        info=release_info(metadata(payload),'0.5.48')
        sums=(checksum or hashlib.sha256(payload).hexdigest())+'  '+info['name']
        with patch.object(self.manager,'check',return_value=info),patch('server.updates.read_small',return_value=sums.encode()),patch('server.updates.open_official',return_value=io.BytesIO(payload if wire is None else wire)),patch.object(self.manager,'handoff') as handoff:
            self.manager.download('1.0.0')
            return handoff.call_count,json.loads((self.manager.base/'status.json').read_text())

    def test_verified_package_handed_to_launcher_without_replacing_app(self):
        count,status=self.run_download()
        self.assertEqual(count,1);self.assertEqual(status['phase'],'installing')
        self.assertEqual((self.program/'InspirationCollector.exe').read_bytes(),b'old')
        plan=json.loads((self.manager.base/'pending.json').read_text())
        self.assertEqual(Path(plan['program']),self.program)
        self.assertNotIn('secret',json.dumps(plan))

    def test_corrupt_short_oversized_or_changed_checksums_never_launch(self):
        for arguments in ({'wire':b'bad'},{'wire':b'badbadbad'},{'wire':b'installer extra'},{'checksum':'a'*64}):
            with self.subTest(arguments=arguments):
                count,status=self.run_download(**arguments)
                self.assertEqual(count,0);self.assertEqual(status['phase'],'failed')
                self.assertEqual(list(self.manager.base.rglob('*.part')),[])

    def test_busy_during_download_does_not_stop_collection(self):
        count,status=self.run_download(busy=True)
        self.assertEqual(count,0);self.assertEqual(status['phase'],'failed')
        with self.assertRaisesRegex(ValueError,'正在采集'):self.manager.start('1.0.0')

    def test_backup_restores_preferences_and_records_and_never_touches_materials(self):
        self.run_download()
        folder=self.root/'data/inspiration';materials=self.base/'素材';materials.mkdir()
        note=materials/'手改.md';note.write_text('my edits',encoding='utf-8')
        settings=folder/'collector-settings.json';settings.write_text(json.dumps({'save_directory':str(materials)}))
        original=settings.read_bytes()
        with closing(sqlite3.connect(folder/'collector-index.sqlite3')) as db:
            db.executescript("CREATE TABLE preferences (value TEXT); INSERT INTO preferences VALUES ('custom'); CREATE TABLE tasks (id TEXT); INSERT INTO tasks VALUES ('saved-task');")
        result=backup_state(self.root,self.program);saved=Path(result['directory'])
        self.assertEqual((saved/settings.name).read_bytes(),original);self.assertEqual(settings.read_bytes(),original)
        with closing(sqlite3.connect(saved/'collector-index.sqlite3')) as db:
            self.assertEqual(db.execute('select value from preferences').fetchone()[0],'custom')
            self.assertEqual(db.execute('select id from tasks').fetchone()[0],'saved-task')
        self.assertEqual(note.read_text(),'my edits')
        self.assertEqual((self.program/'InspirationCollector.exe').read_bytes(),b'old')

    def test_backup_rejects_tampered_package(self):
        self.run_download();package=next(self.manager.base.rglob('*Setup.exe'));package.write_bytes(b'modified')
        with self.assertRaisesRegex(ValueError,'校验失败'):backup_state(self.root,self.program)

    def test_all_update_routes_require_existing_authorization(self):
        app=FastAPI()
        def deny(request):raise HTTPException(403,'denied')
        attach(app,self.settings,'0.5.48',deny,lambda:False)
        request=Request({'type':'http','headers':[]})
        for route in app.routes:
            if route.path.startswith('/updates/'):
                with self.subTest(path=route.path),self.assertRaises(HTTPException):
                    result=route.endpoint(request)
                    if route.path.endswith('/install'):asyncio.run(result)

    def test_stale_download_is_not_reported_as_running(self):
        self.manager.write('downloading','test')
        self.assertEqual(self.manager.status()['phase'],'failed')

    def test_lost_handoff_reply_preserves_installer_owned_result(self):
        payload=b'installer';info=release_info(metadata(payload),'0.5.48')
        sums=hashlib.sha256(payload).hexdigest()+'  '+info['name']
        for phase in ('installing','completed','failed'):
            with self.subTest(phase=phase):
                def handoff():
                    self.manager.write(phase,'worker result',version='1.0.0',worker_pid=123)
                    raise OSError('pipe disconnected after acceptance')
                with patch.object(self.manager,'check',return_value=info),patch('server.updates.read_small',return_value=sums.encode()),patch('server.updates.open_official',return_value=io.BytesIO(payload)),patch.object(self.manager,'handoff',side_effect=handoff),patch('server.updates.update_worker_alive',return_value=True):
                    self.manager.download('1.0.0')
                result=json.loads((self.manager.base/'status.json').read_text())
                self.assertEqual(result['phase'],phase)
                self.assertEqual(result['message'],'worker result')


if __name__=='__main__':unittest.main()
