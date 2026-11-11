import io
import json
import unittest
from urllib.error import HTTPError

from server.mcp_stdio import dispatch


class Backend:
    def __init__(self, error=False):
        self.requests=[]
        self.error=error

    def api(self, path, body=None):
        self.requests.append((path,body))
        if self.error:
            raise HTTPError(path,409,'busy',{},io.BytesIO('正在采集，请稍后更新'.encode()))
        return {'/updates/check':{'available':True,'version':'1.0.0'},
                '/updates/install':{'phase':'downloading','version':'1.0.0'},
                '/updates/status':{'phase':'completed','version':'1.0.0','backup':'saved-backup'},
                '/updates/restore':{'phase':'rolling_back','version':'0.5.49'}}[path]


class McpUpdateTests(unittest.TestCase):
    def call(self, backend, name, args=None):
        return dispatch('tools/call',{'name':name,'arguments':args or {}},backend)

    def test_discovery_and_each_entry_share_the_existing_update_service(self):
        backend=Backend()
        tools={tool['name']:tool for tool in dispatch('tools/list',{},backend)['tools']}
        self.assertEqual(tools['reftray_install_update']['inputSchema']['required'],['version'])
        for name,path,args in [('reftray_check_update','/updates/check',None),
                               ('reftray_install_update','/updates/install',{'version':'1.0.0'}),
                               ('reftray_update_status','/updates/status',None)]:
            with self.subTest(name=name):
                reply=self.call(backend,name,args)
                self.assertFalse(reply['isError'])
                self.assertEqual(backend.requests[-1],(path,args))
        saved=json.loads(reply['content'][0]['text'])
        self.assertEqual(saved['phase'],'completed')
        self.assertEqual(saved['backup'],'saved-backup')

    def test_bad_versions_never_start_and_backend_busy_reaches_the_caller(self):
        backend=Backend()
        for version in (None,True,'','../1.0.0','1.0.0-beta','https://example.org/setup.exe'):
            self.assertTrue(self.call(backend,'reftray_install_update',{'version':version})['isError'])
        self.assertEqual(backend.requests,[])
        reply=self.call(Backend(error=True),'reftray_install_update',{'version':'1.0.0'})
        self.assertTrue(reply['isError'])
        self.assertIn('正在采集',reply['content'][0]['text'])

    def test_install_acceptance_explains_connection_handoff_without_claiming_completion(self):
        reply=self.call(Backend(),'reftray_install_update',{'version':'1.0.0'})
        data=json.loads(reply['content'][0]['text'])
        self.assertEqual(data['phase'],'downloading')
        self.assertIn('reftray_update_status',data['message'])
        self.assertNotIn('更新完成',data['message'])

    def test_restore_uses_same_backend_and_preserves_busy_failure(self):
        backend=Backend()
        reply=self.call(backend,'reftray_restore_update')
        self.assertFalse(reply['isError'])
        self.assertEqual(backend.requests,[('/updates/restore',{})])
        self.assertEqual(json.loads(reply['content'][0]['text'])['phase'],'rolling_back')
        self.assertTrue(self.call(Backend(error=True),'reftray_restore_update')['isError'])


if __name__=='__main__':unittest.main()
