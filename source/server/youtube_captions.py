"""One caption track from yt-dlp metadata; bounded downloads through existing URL guards."""
import json
import math
import socket
import ipaddress
import time
from urllib.parse import urlsplit, parse_qs
from urllib.request import Request, build_opener, HTTPRedirectHandler


def validate_caption_url(url):
    u = urlsplit(url)
    if u.scheme != 'https' or u.hostname not in ('www.youtube.com', 'youtube.com') or u.path != '/api/timedtext' or u.username or u.password or u.port not in (None,443):
        raise ValueError('字幕来源不支持')
    addresses = socket.getaddrinfo(u.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('拒绝本机或内网字幕地址')


class CaptionRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_caption_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def original_language(data):
    # yt-dlp marks YouTube's original audio with preference 10; dubbed defaults use 5.
    originals = {str(f.get('language') or '').lower().split('-')[0]
                 for f in [*(data.get('formats') or []), *(data.get('requested_formats') or [])]
                 if f.get('language_preference') == 10}
    originals.discard('')
    original = next(iter(originals)) if len(originals) == 1 else str(data.get('language') or '').lower().split('-')[0]
    # Auto tracks marked "orig" identify the spoken language when metadata omits it.
    if not original:
        originals = {code.lower().split('-')[0] for code in (data.get('automatic_captions') or {}) if code.endswith('-orig')}
        if len(originals) == 1:
            original = originals.pop()
    if not original:
        originals = {parse_qs(urlsplit(t.get('url', '')).query).get('lang', [''])[0].lower().split('-')[0]
                     for tracks in (data.get('automatic_captions') or {}).values() for t in tracks
                     if not parse_qs(urlsplit(t.get('url', '')).query).get('tlang')}
        originals.discard('')
        if len(originals) == 1:
            original = originals.pop()
    return original


def candidates(data):
    original = original_language(data)
    if not original:
        return []  # Do not guess that the first human translation is the spoken language.
    candidates = []
    for automatic, key in ((False, 'subtitles'), (True, 'automatic_captions')):
        for code, formats in (data.get(key) or {}).items():
            if code == 'live_chat':
                continue
            for track in formats:
                if track.get('ext') != 'json3':
                    continue
                u = urlsplit(track.get('url', ''))
                if u.scheme != 'https' or u.hostname not in ('www.youtube.com', 'youtube.com') or u.path != '/api/timedtext':
                    continue
                query = parse_qs(u.query)
                translated = bool(query.get('tlang'))
                base = query.get('lang', [code])[0].lower().split('-')[0]
                if translated or base != original:
                    continue
                rank = (automatic, code)
                candidates.append((rank, track['url'], code, automatic, translated))
    return sorted(candidates, key=lambda item: item[0])


def choose(data, language='auto'):
    tracks = candidates(data)
    return tracks[0] if tracks else None


def parse_json3(data):
    cues = []
    for event in data.get('events', [])[:100000]:
        text = ''.join(str(s.get('utf8') or '') for s in event.get('segs', [])).strip()
        if not text or 'tStartMs' not in event or 'dDurationMs' not in event:
            continue
        start = float(event['tStartMs']) / 1000
        end = start + float(event['dDurationMs']) / 1000
        if not all(math.isfinite(v) for v in (start, end)) or not 0 <= start < end:
            continue
        cues.append({'start': start, 'end': end, 'text': text})
    return cues


def fetch(data, language='auto'):
    tracks = candidates(data)
    if not tracks:
        present = bool(data.get('subtitles') or data.get('automatic_captions'))
        reason = ('解析器未返回字幕列表，不能据此确认网页没有字幕' if not present else
                  '已取得字幕列表，但未能确认视频原语言；未自动选择翻译字幕' if not original_language(data) else
                  '已确认原语言，但字幕列表中没有可读取的对应轨道')
        return [], '', reason + '；尝试本地识别'
    failures = []
    seen = set()
    deadline = time.monotonic() + 30
    for chosen in tracks:
        if chosen[1] in seen:
            continue
        seen.add(chosen[1])
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        cues, origin, warning = fetch_track(chosen, timeout=min(15, remaining))
        if cues:
            return cues, origin, '；'.join(failures)
        failures.append(warning)
        if len(seen) >= 4:
            break
    return [], '', '；'.join(failures) + '；尝试本地识别'


def fetch_track(chosen, timeout=15):
    _, url, code, automatic, translated = chosen
    try:
        validate_caption_url(url)
        with build_opener(CaptionRedirect()).open(Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=timeout) as response:
            if urlsplit(response.url).hostname not in ('www.youtube.com', 'youtube.com'):
                raise ValueError('字幕重定向到未支持的来源')
            raw = response.read(5 * 1024 * 1024 + 1)
            if len(raw) > 5 * 1024 * 1024:
                raise ValueError('字幕超过大小限制')
        cues = parse_json3(json.loads(raw))
        if not cues:
            raise ValueError('字幕响应为空或无有效时间轴')
        origin = f'YouTube {code} · ' + ('自动翻译字幕' if translated else '自动字幕' if automatic else '网站字幕')
        return cues, origin, ''
    except Exception as exc:
        # Keep a clear diagnosis without exposing signed caption URLs.
        reason = 'HTTP ' + str(exc.code) if getattr(exc, 'code', None) else type(exc).__name__
        return [], '', '网站字幕读取失败（' + reason + '）'
