import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import FastAPI, HTTPException
from starlette.requests import Request
from server.catalog import Catalog
from server.browser_bridge import attach, BrowserCapture, BrowserResult, Client, Update, Control
from server.mcp_stdio import dispatch
from server.mcp_tools import diagnostics, extra_dispatch

ORIGIN='chrome-extension://paired'
def request(origin=ORIGIN, token='yes'):
    return Request({'type':'http','headers':[(b'origin',origin.encode()),(b'x-collector-token',token.encode())]})

class BrowserBridgeTests(unittest.TestCase):
    def test_resolution_child_is_owned_and_stopped_on_parent_cancel(self):
        key=self.submit();self.claim()
        self.routes['/browser/progress/{identity}'](key,Update(**self.client.model_dump(),backend_job={'kind':'resolve','jobId':'resolver'}),request())
        self.routes['/browser/control/{identity}'](key,Control(action='stop'),request())
        self.assertEqual(self.stopped,[{'kind':'resolve','jobId':'resolver'}])

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.catalog=Catalog(Path(self.tmp.name));self.app=FastAPI();self.stopped=[]
        def authorize(r):
            if r.headers.get('x-collector-token')!='yes':raise HTTPException(403)
        attach(self.app,authorize,{ORIGIN},self.catalog,'test',self.stopped.append)
        self.routes={r.path:r.endpoint for r in self.app.routes if r.path.startswith('/browser')}
        self.client=Client(client_id='one',release='test')
    def submit(self, **kw):
        result=self.routes['/browser/capture'](BrowserCapture(url='https://x.com/user/status/123?token=secret',**kw),request())
        return result['job_id']
    def claim(self, client=None, req=None):
        return self.routes['/browser/claim'](client or self.client,req or request())['item']
    def test_defaults_snapshot_and_closed_panel_queue(self):
        self.catalog.defaults({'include_comments':True,'comment_limit':6,'replies_per_comment':3})
        key=self.submit(mode='text',options={'comment_limit':4,'subtitle_mode':'with_video'})
        self.catalog.defaults({'comment_limit':99})
        item=self.claim();self.assertEqual(item['id'],key)
        opts=item['request']['options']
        self.assertEqual((opts['include_comments'],opts['comment_limit'],opts['replies_per_comment']),(True,4,3))
        self.assertEqual(opts['subtitle_mode'],'with_video')
        self.assertNotIn('secret',str(self.catalog.get_task(key)))
        self.assertIsNone(self.claim(Client(client_id='two',release='test')))
    def test_origin_version_and_client_ownership(self):
        key=self.submit()
        for c,r in [(self.client,request('https://evil.invalid')),(Client(client_id='one',release='old'),request())]:
            with self.assertRaises(HTTPException):self.claim(c,r)
        status=self.routes['/browser/status'](request());self.assertFalse(status['ready'])
        self.claim()
        with self.assertRaises(HTTPException):
            self.routes['/browser/result/{identity}'](key,BrowserResult(client_id='two',release='test',status='completed',message='x'),request())
    def test_control_progress_stop_and_late_result(self):
        key=self.submit();self.claim()
        control=self.routes['/browser/control/{identity}']
        control(key,Control(action='pause'),request())
        reply=self.routes['/browser/progress/{identity}'](key,Update(**self.client.model_dump(),child_id='child',backend_job={'kind':'video','jobId':'media'},progress={'percent':42,'message':'saving'}),request())
        self.assertEqual(reply['action'],'paused')
        self.assertEqual(self.catalog.get_task(key)['progress']['percent'],42)
        control(key,Control(action='resume'),request());control(key,Control(action='stop'),request())
        self.assertEqual(self.stopped[-1],{'kind':'video','jobId':'media'})
        result=BrowserResult(**self.client.model_dump(),child_id='child',status='stopped',message='stopped',result={'directory':'kept'})
        self.routes['/browser/result/{identity}'](key,result,request())
        self.assertEqual(self.catalog.get_task(key)['directory'],'kept')
        self.routes['/browser/result/{identity}'](key,result,request())
    def test_expiry_on_status_and_recovery_preserves_failed_subset(self):
        import time
        key=self.submit(scope='author');self.claim()
        child={'id':'batch','source':'https://x.com/user','mode':'author','options':{'collection_mode':'images'},'queue':['a','b'],'records':{'a':{'status':'saved'},'b':{'status':'failed'}},'completed':True}
        self.catalog.save_task(child)
        self.routes['/browser/progress/{identity}'](key,Update(**self.client.model_dump(),child_id='batch'),request())
        with patch('server.browser_bridge.time.time',return_value=time.time()+100):
            self.routes['/browser/status'](request())
        self.assertEqual(self.catalog.get_task(key)['status'],'interrupted')
        retry=self.routes['/browser/control/{identity}'](key,Control(action='retry'),request())
        self.assertNotEqual(retry['job_id'],key)
        item=self.claim()
        self.assertEqual(item['checkpoint']['records']['a']['status'],'saved')
        self.assertEqual(item['checkpoint']['records']['b']['status'],'pending')
        self.assertEqual(item['checkpoint']['retryKeys'],['b'])
    def test_waiting_timeout_and_cancel_do_not_run(self):
        import time
        key=self.submit()
        with patch('server.browser_bridge.time.time',return_value=time.time()+301):self.app.state.browser_bridge.expire()
        self.assertEqual(self.catalog.get_task(key)['status'],'failed')
        key=self.submit()
        self.routes['/browser/control/{identity}'](key,Control(action='stop'),request())
        self.assertIsNone(self.claim())

    def test_large_batch_failure_log_finishes_and_next_request_can_run(self):
        key = self.submit(scope='author'); self.claim()
        reason = 'Media read failed ' * 100
        child = {'id':'batch-large', 'records':{str(i):{'status':'failed', 'reason':reason} for i in range(100)}}
        self.catalog.save_task(child)
        result = BrowserResult(**self.client.model_dump(), child_id=child['id'], status='failed', message='100 works failed',
                               result={'directory':'kept', 'details':'\n'.join(row['reason'] for row in child['records'].values())})
        self.routes['/browser/result/{identity}'](key, result, request())
        record = self.catalog.get_task(key)
        self.assertEqual(record['status'], 'failed')
        self.assertTrue(record['records']['result']['result']['details_truncated'])
        self.assertEqual(self.catalog.get_task(child['id'])['records'], child['records'])
        next_key = self.submit()
        self.assertEqual(self.claim()['id'], next_key)

class McpBrowserTests(unittest.TestCase):
    def test_mcp_all_tasks_includes_completed_and_running_finds_server_owned_tasks(self):
        from urllib.parse import urlsplit, parse_qs
        with tempfile.TemporaryDirectory() as tmp:
            catalog = Catalog(Path(tmp))
            for key, status, done in [('done','completed',True), ('active','running',False), ('waiting','waiting_browser',False), ('paused','paused',False)]:
                catalog.save_task({'id':key, 'status':status, 'completed':done})
            class Backend:
                def api(self, path):
                    query = parse_qs(urlsplit(path).query)
                    return catalog.task_page(view=query.get('view', [None])[0])
            result = extra_dispatch('reftray_list_tasks', {'view':'all'}, Backend())
            self.assertEqual({r['id'] for r in result['items']}, {'done','active','waiting','paused'})
            result = extra_dispatch('reftray_list_tasks', {'view':'running'}, Backend())
            self.assertEqual({r['id'] for r in result['items']}, {'active','waiting'})
            self.assertEqual([r['id'] for r in catalog.task_page(view='running',active_id='active')['items']], ['active'])

    def test_missing_child_keeps_task_diagnostics_and_server_errors_are_reported(self):
        from urllib.error import HTTPError
        class Backend:
            code = 404
            def api(self, path):
                if path == '/tasks/job':
                    return {'item': {'id': 'job', 'child_id': 'missing', 'message': '20261109T123456Z-1234abcd'}}
                if path == '/tasks/missing':
                    raise HTTPError(path, self.code, 'missing', {}, None)
                return {'items': [{'id': '20261109T123456Z-1234abcd'}, {'id': 'unrelated'}]}
        backend = Backend()
        result = diagnostics(backend, {'job_id': 'job'})
        self.assertEqual(result['task']['id'], 'job')
        self.assertIsNone(result['child'])
        self.assertTrue(result['child_message'])
        self.assertEqual([row['id'] for row in result['diagnostics']], ['20261109T123456Z-1234abcd'])
        backend.code = 500
        with self.assertRaises(HTTPError):
            diagnostics(backend, {'job_id': 'job'})

    def test_full_schema_and_transmission(self):
        listing=dispatch('tools/list',{},None)['tools']
        schema=next(t['inputSchema'] for t in listing if t['name']=='reftray_capture_browser')
        self.assertEqual(schema['required'],['url'])
        for key in ('include_comments','include_replies','replies_per_comment','skip_gifs','video_action','output_format','subtitle_mode','video_quality','trim_start','destination','skip_posts'):
            self.assertIn(key,schema['properties']['options']['properties'])
        class Backend:
            def api(self,path,data=None):self.path=path;self.data=data;return {'job_id':'queued'}
        backend=Backend()
        args={'url':'https://x.com/user','scope':'author','mode':'text','options':{'include_comments':True,'comment_limit':5}}
        answer=dispatch('tools/call',{'name':'reftray_capture_batch','arguments':args},backend)
        self.assertFalse(answer['isError']);self.assertEqual(backend.data,args)
    def test_diagnostics_filter_uses_exact_ids_not_redacted_site(self):
        class Backend:
            def api(self,path):
                if path=='/tasks/job':return {'item':{'child_id':'child','message':'failure'}}
                if path=='/tasks/child':return {'item':{'error':'20261109T123456Z-1234abcd'}}
                return {'items':[{'id':'20261109T123456Z-1234abcd','code':'ACCESS'},{'id':'other','code':'ACCESS'}]}
        result=diagnostics(Backend(),{'job_id':'job'})
        self.assertEqual(len(result['diagnostics']),1)
