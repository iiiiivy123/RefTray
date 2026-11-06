import sys
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'source'))
from server import image_download as images


class ImageProxyTests(unittest.TestCase):
    def test_fixed_cdn_uses_proxy_dns_without_local_dns(self):
        context = Mock()
        connection = images.PublicHTTPSConnection('pbs.twimg.com', context=context)
        with patch.object(images, 'getproxies', return_value={'https': 'http://127.0.0.1:7897'}), \
             patch.object(images, 'proxy_bypass', return_value=False), \
             patch.object(images, 'public_addresses', side_effect=OSError('local DNS unavailable')) as resolve, \
             patch.object(images.HTTPConnection, 'connect'):
            images.validate_url('https://pbs.twimg.com/media/example?format=jpg')
            connection.connect()
        resolve.assert_not_called()
        self.assertEqual(connection._tunnel_host, 'pbs.twimg.com')
        self.assertFalse(images.platform_cdn('twimg.com.attacker.example'))

    def test_proxy_connects_to_checked_ip_and_keeps_tls_hostname(self):
        context = Mock()
        connection = images.PublicHTTPSConnection('example.com', context=context)
        with patch.object(images, 'getproxies', return_value={'https': 'http://127.0.0.1:7897'}), \
             patch.object(images, 'proxy_bypass', return_value=False), \
             patch.object(images, 'public_addresses', return_value=[(2, 1, 6, '', ('104.244.42.1', 443))]), \
             patch.object(images.HTTPConnection, 'connect') as connect:
            connection.connect()
        connect.assert_called_once()
        self.assertEqual(connection._tunnel_host, '104.244.42.1')
        self.assertEqual(connection.host, 'example.com')
        self.assertEqual(context.wrap_socket.call_args.kwargs['server_hostname'], 'example.com')

    def test_private_destination_rejected_before_proxy_connect(self):
        connection = images.PublicHTTPSConnection('127.0.0.1')
        with patch.object(images, 'getproxies', return_value={'https': 'http://127.0.0.1:7897'}), \
             patch.object(images, 'proxy_bypass', return_value=False), \
             patch.object(images.HTTPConnection, 'connect') as connect:
            with self.assertRaises(ValueError):
                connection.connect()
        connect.assert_not_called()


if __name__ == '__main__':
    unittest.main()
