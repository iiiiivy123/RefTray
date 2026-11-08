import unittest
from unittest.mock import patch

from server import diagnostics


class DiagnosticsClassificationTests(unittest.TestCase):
    def test_authentication_is_access_failure(self):
        for message in (
            'This post requires authentication. Use cookies for the authentication.',
            'Authentication required to view this post',
            'You are not authorized to view this protected tweet',
            'login required',
        ):
            with self.subTest(message=message):
                self.assertEqual(diagnostics.classify(message), 'ACCESS')

    def test_existing_failures_keep_their_codes(self):
        for message, code in (
            ('HTTP Error 403: Forbidden', 'HTTP_403'),
            ('HTTP Error 429: Too Many Requests', 'HTTP_429'),
            ('ReadTimeout: request timed out', 'TIMEOUT'),
            ('ProxyError: connection refused', 'PROXY'),
            ('getaddrinfo failed', 'DNS'),
            ('unknown extractor error', 'EXTRACTOR'),
            ('ValueError: 主帖身份字段缺失，无法确认当前作品', 'IDENTITY'),
            ('主帖身份不匹配，拒绝转帖或其他作品', 'IDENTITY'),
        ):
            with self.subTest(message=message):
                self.assertEqual(diagnostics.classify(message), code)

    def test_failure_preserves_code_and_diagnostic_contract(self):
        with patch.object(diagnostics, 'record', return_value='test-diagnostic'):
            error = diagnostics.failure('ACCESS', 'requires authentication')
        self.assertTrue(str(error).startswith('[ACCESS] '))
        self.assertIn('test-diagnostic', str(error))


if __name__ == '__main__':
    unittest.main()
