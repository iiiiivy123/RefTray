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

    def test_single_work_routes_use_shared_canonical_and_keep_part(self):
        for link, expected, platform in [
                ('https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk', 'youtube'),
                ('https://www.bilibili.com/video/BV1234567890?p=2', 'https://www.bilibili.com/video/BV1234567890/?p=2', 'bilibili')]:
            with self.subTest(link=link):
                backend = Backend(1)
                reply, _ = self.call(backend, url=link)
                self.assertFalse(reply['isError'])
                self.assertEqual(backend.starts[0]['canonical_url'], expected)
                self.assertEqual(backend.starts[0]['platform'], platform)
        for link in ['https://www.youtube.com/abcdefghijk', 'https://www.youtube.com/playlist?list=123']:
            backend = Backend(1)
            reply, _ = self.call(backend, url=link)
            self.assertTrue(reply['isError'])
            self.assertEqual(backend.starts, [])

    def test_preflight_error_returns_a_durable_sanitized_task_id(self):
        class Journal(Backend):
            def api(self, path, body=None):
                if path == '/media/resolve':
                    raise ValueError('Unavailable https://video.example/test?token=private')
                if path == '/tasks':
                    self.record = body
                    return {'ok': True}
                if path == '/tasks/' + self.record['id']:
                    return {'item': self.record['data']}
                raise AssertionError(path)
        backend = Journal()
        reply, _ = self.call(backend, url='https://x.com/example/status/123?secret=private')
        self.assertTrue(reply['isError'])
        self.assertIn(backend.record['id'], reply['content'][0]['text'])
        self.assertNotIn('private', json.dumps(backend.record))
        status = dispatch('tools/call', {'name':'reftray_job_status', 'arguments':{'kind':'task','job_id':backend.record['id']}}, backend)
        self.assertEqual(json.loads(status['content'][0]['text'])['item']['status'], 'failed')

class PublicPinTests(unittest.TestCase):
    def resolve(self, patch_pin=None, query_id='123', extra_head=''):
        from unittest.mock import MagicMock, patch
        from urllib.parse import quote
        from server.public_post import resolve_post
        pin = {'entityId':'123', '__typename':'Pin', 'isEligibleForImageDownload':True,
               'isViewerRestricted':False, 'isVideo':False,'images_orig':{'url':'https://i.pinimg.com/originals/example.jpg'}}
        pin.update(patch_pin or {})
        request = quote(json.dumps({'variables':{'pinId':query_id}}))
        args = json.dumps(request) + ',' + json.dumps({'data':{'v3GetPinQueryv2':{'data':pin}}})
        html = ('<html><head>'+extra_head+'</head><body><script data-relay-completed-request>'
                'window.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__('+args+');</script></body></html>').encode()
        response = MagicMock(url='https://www.pinterest.com/pin/123/')
        response.read1.side_effect = [html[pos:pos+19] for pos in range(0,len(html),19)] + [b'']
        with patch('server.public_post.public_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value = response
            return resolve_post(response.url)

    def test_incremental_source_must_match_pin_and_explicit_rights(self):
        self.assertEqual(self.resolve()['scope'], 'verified_pin_image')
        for patch_pin, query in [({}, '456'), ({'entityId':'456'}, '123'), ({'isViewerRestricted':True}, '123'),
                                 ({'isVideo':True}, '123'), ({'images_orig':{'url':'https://i.pinimg.com.evil.invalid/a'}}, '123')]:
            with self.subTest(patch=patch_pin,query=query), self.assertRaises(ValueError):
                self.resolve(patch_pin, query)
        with self.assertRaises(ValueError):
            self.resolve(extra_head='<link rel="canonical" href="https://www.pinterest.com/pin/456/">')

    def test_mixed_story_cannot_save_only_its_cover(self):
        block = {'__typename':'StoryPinImageBlock','images_750x':{'url':'https://i.pinimg.com/750x/a.jpg'}}
        story = {'storyPinData':{'pages':[{'blocks':[block]}]}}
        self.assertEqual(self.resolve(story)['scope'], 'verified_story_images')
        story['storyPinData']['pages'].append({'blocks':[{'__typename':'StoryPinVideoBlock'}]})
        with self.assertRaises(ValueError):
            self.resolve(story)

class InstagramPublicTests(unittest.TestCase):
    def test_mixed_carousel_preserves_order_and_excludes_movie_cover(self):
        from server.instagram_post import images_from_record
        url='https://test.cdninstagram.com/a.jpg'
        nodes=[{'id':str(i),'is_video':video,'display_url':url+str(i)} for i,video in enumerate([False,True,False])]
        media={'shortcode':'example','id':'parent','__typename':'GraphSidecar','is_video':False,
               'edge_sidecar_to_children':{'edges':[{'node':node} for node in nodes]}}
        record={'context':{'shortcode':'example','copyright_blocked':False,'type':'GraphSidecar'},'gql_data':{'shortcode_media':media}}
        saved=images_from_record(record,'example')
        self.assertEqual([i['url'] for i in saved['images']],[url+'0',url+'2'])
        for changed in [{'id':'0'}, {'is_video':None}, {'display_url':'https://cdninstagram.com.evil.example/x'}]:
            with self.subTest(changed=changed),self.assertRaises(ValueError):
                from copy import deepcopy
                other=deepcopy(record)
                other['gql_data']['shortcode_media']['edge_sidecar_to_children']['edges'][2]['node'].update(changed)
                images_from_record(other,'example')
        with self.assertRaises(ValueError):images_from_record(record,'other')
        record['context']['copyright_blocked']=True
        with self.assertRaises(ValueError):images_from_record(record,'example')
