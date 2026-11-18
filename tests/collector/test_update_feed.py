import io
import json
import tempfile
import unittest
import urllib.error
from fastapi import FastAPI, HTTPException, Request
from pathlib import Path
from unittest.mock import patch

from server.config import Settings
from server.updates import Updates, open_official, UpdateRequestError, attach
from test_update_migration import metadata, NEW

FEED = 'https://github.com/iiiiivy123/RefTray/releases/latest/download/RefTray-update.json'


class UpdateFeedTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.manager = Updates(Settings(Path(self.tmp.name)), '1.0.0', lambda: False)

    def test_public_feed_works_without_any_api_request_and_repeated_checks_share_cache(self):
        body = json.dumps({'schema_version': 1, **metadata(NEW)}).encode()
        with patch('server.updates.read_small', return_value=body) as read:
            self.assertEqual(self.manager.check()['version'], '1.0.1')
            self.assertEqual(self.manager.check()['version'], '1.0.1')
        self.assertEqual([call.args[0] for call in read.call_args_list], [FEED])

    def test_invalid_feed_is_not_replaced_by_an_api_success(self):
        for body in (b'{}', b'{broken', b'[]', json.dumps({'schema_version': 2, **metadata(NEW)}).encode()):
            with self.subTest(body=body), patch('server.updates.read_small', return_value=body) as read:
                with self.assertRaises(ValueError): self.manager.check()
                self.assertEqual(read.call_count, 1)

    def test_rate_limit_retains_actual_reason_and_reset_without_exposing_ip(self):
        error = urllib.error.HTTPError(FEED, 403, 'Forbidden',
            {'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000'},
            io.BytesIO(b'{"message":"API rate limit exceeded for 192.0.2.10."}'))
        with patch('server.updates.urllib.request.build_opener') as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaises(ValueError) as result: open_official(FEED)
        self.assertIn('额度', str(result.exception))
        self.assertEqual(result.exception.retry_at, 2000000000)
        self.assertEqual(result.exception.upstream_status, 403)
        self.assertNotIn('192.0.2.10', str(result.exception))

    def test_unrelated_403_is_not_called_rate_limiting(self):
        error = urllib.error.HTTPError(FEED, 403, 'Forbidden', {}, io.BytesIO(b'Forbidden'))
        with patch('server.updates.urllib.request.build_opener') as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaises(ValueError) as result: open_official(FEED)
        self.assertIn('拒绝', str(result.exception))
        self.assertNotIn('限制请求', str(result.exception))
        self.assertEqual(result.exception.kind, 'forbidden')

    def test_cooldown_honors_upstream_reset_then_allows_a_new_check(self):
        failure = UpdateRequestError('rate_limit', '额度已用完', 403, 2000)
        body = json.dumps({'schema_version': 1, **metadata(NEW)}).encode()
        with patch('server.updates.time.time', return_value=1000), patch('server.updates.read_small', side_effect=failure) as read:
            for unused in range(3):
                with self.assertRaises(UpdateRequestError): self.manager.check()
            self.assertEqual(read.call_count, 1)
        evidence = json.loads((self.manager.base / 'check-error.json').read_text())
        self.assertEqual(evidence['retry_at'], 2000)
        self.assertEqual(evidence['upstream_status'], 403)
        with patch('server.updates.time.time', return_value=2001), patch('server.updates.read_small', return_value=body) as read:
            self.assertTrue(self.manager.check()['available'])
            self.assertEqual(read.call_count, 1)

    def test_api_preserves_limit_reason_and_retry_after_instead_of_generic_502(self):
        app = FastAPI()
        attach(app, self.manager.settings, '1.0.0', lambda request: None, lambda: False)
        route = next(r for r in app.routes if r.path == '/updates/check')
        with patch.object(app.state.updates, 'check', side_effect=UpdateRequestError('rate_limit', '额度已用完', 403, 2000)), patch('server.updates.time.time', return_value=1000):
            with self.assertRaises(HTTPException) as result:
                route.endpoint(Request({'type': 'http', 'headers': []}))
        self.assertEqual(result.exception.status_code, 429)
        self.assertEqual(result.exception.headers['Retry-After'], '1000')
        self.assertEqual(result.exception.detail, '额度已用完')


if __name__ == '__main__': unittest.main()
