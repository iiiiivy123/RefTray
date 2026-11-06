import json
import unittest

from server.mcp_stdio import dispatch


class Backend:
    def __init__(self, count=2):
        self.media = [{'url': 'https://video.example/'+str(i)} for i in range(count)]
        self.starts = []

    def api(self, path, body=None):
        if path == '/media/resolve':
            return {'media': self.media}
        if path == '/health':
            return {'inbox': 'scratch'}
        if path == '/video/start':
            if self.starts:
                raise ValueError('409 busy')
            self.starts.append(body)
            return {'id': 'first-job'}
        raise AssertionError(path)


class McpVideoDispatchTests(unittest.TestCase):
    def call(self, backend, **args):
        result = dispatch('tools/call', {'name': 'reftray_download_video', 'arguments': {'url': 'https://x.com/example/status/123', **args}}, backend)
        return result, json.loads(result['content'][0]['text']) if not result['isError'] else None

    def test_multiple_media_needs_selection_before_starting_any_job(self):
        backend = Backend()
        reply, data = self.call(backend)
        self.assertFalse(reply['isError'])
        self.assertEqual(data['status'], 'selection_required')
        self.assertEqual(data['media_count'], 2)
        self.assertEqual(backend.starts, [])

    def test_selection_starts_exactly_one_and_preserves_job_id(self):
        backend = Backend()
        reply, data = self.call(backend, media_index=2)
        self.assertFalse(reply['isError'])
        self.assertEqual(data['jobs'][0]['id'], 'first-job')
        self.assertEqual(backend.starts[0]['url'], backend.media[1]['url'])

    def test_single_media_retains_existing_call_contract(self):
        reply, data = self.call(Backend(1))
        self.assertFalse(reply['isError'])
        self.assertEqual(data['jobs'][0]['id'], 'first-job')

    def test_invalid_selection_never_starts_a_job(self):
        for index in (0, 3, True, '1'):
            backend = Backend()
            reply, _ = self.call(backend, media_index=index)
            self.assertTrue(reply['isError'])
            self.assertEqual(backend.starts, [])
