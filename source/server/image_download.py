"""Bounded public HTTP(S) image downloads; validate every redirect target."""
import ipaddress
import socket
from http.client import HTTPConnection, HTTPSConnection
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, HTTPHandler, HTTPSHandler, ProxyHandler, Request, build_opener

MAX_BYTES = 30 * 1024 * 1024


def public_addresses(host, port):
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('不能下载本机、内网或保留地址上的图片')
    return addresses


class PublicHTTPConnection(HTTPConnection):
    def connect(self):
        if self._tunnel_host:
            raise ValueError('图片下载不支持代理隧道')
        last_error = None
        for family, kind, protocol, _, address in public_addresses(self.host, self.port):
            connection = socket.socket(family, kind, protocol)
            try:
                connection.settimeout(self.timeout)
                if self.source_address:
                    connection.bind(self.source_address)
                connection.connect(address)  # Use the checked numeric address, never resolve again.
                self.sock = connection
                return
            except OSError as error:
                connection.close()
                last_error = error
        raise last_error or OSError('No public image address available')


class PublicHTTPSConnection(HTTPSConnection):
    def connect(self):
        PublicHTTPConnection.connect(self)
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


class PublicHTTPHandler(HTTPHandler):
    def http_open(self, request):
        return self.do_open(PublicHTTPConnection, request)


class PublicHTTPSHandler(HTTPSHandler):
    def https_open(self, request):
        return self.do_open(PublicHTTPSConnection, request, context=self._context)


def validate_url(value):
    parsed = urlsplit(value)
    host = parsed.hostname
    if (parsed.scheme not in ('http', 'https') or not host
            or parsed.username is not None or parsed.password is not None
            or parsed.port not in (None, 80, 443)):
        raise ValueError('图片只支持普通 HTTP(S) 公网地址')
    public_addresses(host, parsed.port or (443 if parsed.scheme == 'https' else 80))
    return value


class SafeImageRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download_image(url, timeout):
    request = Request(validate_url(url), headers={'User-Agent': 'Mozilla/5.0', 'Referer': url})
    # Direct connections prevent environment proxies from bypassing destination checks.
    with build_opener(ProxyHandler({}), PublicHTTPHandler(), PublicHTTPSHandler(), SafeImageRedirect()).open(request, timeout=timeout) as response:
        if response.status != 200:
            raise ValueError('图片响应不完整，未保存')
        content_type = response.headers.get_content_type()
        if not content_type.startswith('image/'):
            raise ValueError('响应不是图片，可能是登录或验证页面，未保存为图片')
        expected = response.headers.get('Content-Length')
        if expected is not None and (int(expected) < 0 or int(expected) > MAX_BYTES):
            raise ValueError('image exceeds 30MB or has invalid size')
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('image exceeds 30MB')
        if not data or expected is not None and len(data) != int(expected):
            raise ValueError('图片下载不完整，未保存')
        return data, content_type
