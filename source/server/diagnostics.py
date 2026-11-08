"""Bounded local, redacted resolver evidence. Never store cookies or signed media URLs."""
import datetime
import json
import os
import re
import secrets
import sys
from pathlib import Path
from urllib.parse import urlsplit

LABELS = {
    'COMPONENT': '本地媒体解析组件未配置或不可用',
    'DNS': '解析器无法解析站点域名（DNS）',
    'PROXY': '解析器代理连接失败',
    'TLS': '解析器 TLS／证书校验失败',
    'TIMEOUT': '媒体解析请求超时',
    'HTTP_403': '站点拒绝解析请求（HTTP 403）',
    'HTTP_429': '站点限制解析频率（HTTP 429）',
    'ACCESS': '站点要求登录或限制访问；解析器不导出浏览器登录信息',
    'FORMAT': '未找到符合要求的媒体格式',
    'UNAVAILABLE': '作品不可用或已删除',
    'CONNECT': '解析器无法建立网络连接',
    'PAYLOAD': '解析组件返回数据无效',
    'EXTRACTOR': '解析组件未能识别作品数据',
    'IDENTITY': '解析结果缺少或不匹配当前帖子编号，未开始下载',
}


def classify(message):
    patterns = [
        ('IDENTITY', r'主帖身份字段缺失|主帖身份不匹配|X_PAGE_ID'),
        ('PROXY', r'ProxyError|proxy (?:error|connection)|tunnel connection|SOCKS'),
        ('DNS', r'getaddrinfo|name or service not known|temporary failure in name resolution|could not resolve (?:host|hostname)|unable to resolve host|nodename nor servname'),
        ('TLS', r'CERTIFICATE_VERIFY_FAILED|SSLError|SSL:|TLS handshake|certificate verify'),
        ('TIMEOUT', r'timed?\s*out|TimeoutError|ReadTimeout|ConnectTimeout'),
        ('HTTP_403', r'HTTP(?: Error)?\s*403|403 Forbidden'),
        ('HTTP_429', r'HTTP(?: Error)?\s*429|429 Too Many'),
        ('ACCESS', r'sign in|login required|log in|requires authentication|authentication required|not authorized|private (?:video|account)|protected (?:tweet|post|account)|age.restrict|cookies.*required'),
        ('FORMAT', r'Requested format.*not available|No video formats|no suitable formats'),
        ('UNAVAILABLE', r'video unavailable|tweet unavailable|deleted|not found'),
        ('CONNECT', r'ConnectionRefusedError|connection (?:refused|reset|aborted)|Network is unreachable|WinError (?:10060|10061|10054)'),
    ]
    return next((code for code, pattern in patterns if re.search(pattern, message, re.I)), 'EXTRACTOR')


def redact(message):
    text = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', str(message))
    text = re.sub(r'(?im)(authorization\s*:\s*|cookie\s*:\s*|set-cookie\s*:\s*)[^\r\n]*', r'\1[redacted]', text)
    def safe_url(match):
        try:
            u = urlsplit(match.group(0))
            return f'{u.scheme}://{u.hostname or "unknown"}/[redacted]'
        except ValueError:
            return '[redacted-url]'
    text = re.sub(r'https?://[^\s<>"\']+', safe_url, text)
    text = re.sub(r'(?i)(?:bearer\s+)[\w.\-]+', 'Bearer [redacted]', text)
    text = re.sub(r'(?i)((?:token|secret|password|signature|sig|api_key)\s*[=:]\s*)[^\s&,;]+', r'\1[redacted]', text)
    text = re.sub(r'(?i)[A-Z]:[\\/]Users[\\/][^\\/\s]+', '%USERPROFILE%', text)
    return text[-12000:]


def folder():
    default = Path(os.getenv('LOCALAPPDATA', str(Path.home() / '.local/share'))) / 'InspirationCollector'
    return Path(os.getenv('LIBLIB_ROOT', str(default))) / 'data/inspiration/diagnostics'


def record(code, message, *, canonical='', exit_code=None, elapsed=None, stage='resolve', component=False):
    identity = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + secrets.token_hex(4)
    doc = {
        'id': identity, 'time': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'stage': stage, 'code': code, 'summary': LABELS.get(code, code),
        'source': redact(canonical), 'exit_code': exit_code, 'elapsed_seconds': round(elapsed, 3) if elapsed is not None else None,
        'python': sys.version.split()[0], 'component_available': component,
        'proxy_env_present': {k: bool(os.getenv(k)) for k in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY')},
        'detail': redact(message),
    }
    try:
        root = folder(); root.mkdir(parents=True, exist_ok=True)
        path = root / (identity + '.json')
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding='utf-8')
        for old in sorted(root.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)[100:]:
            old.unlink(missing_ok=True)
    except OSError:
        return 'unavailable'
    return identity


def failure(code, message, **context):
    identity = record(code, message, **context)
    return ValueError(f'[{code}] {LABELS.get(code, code)}。诊断编号：{identity}；可在管理页「帮助与工具」查看脱敏诊断。')


def recent():
    root = folder()
    rows = []
    for path in sorted(root.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)[:100]:
        try:
            rows.append(json.loads(path.read_text(encoding='utf-8')))
        except (OSError, ValueError):
            continue
    return rows
