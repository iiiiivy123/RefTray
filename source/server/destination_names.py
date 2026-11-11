"""Stable source keys and filesystem-safe names shared by directory versions."""
import re
from urllib.parse import urlsplit, urlunsplit, parse_qs, parse_qsl, urlencode

def safe(value):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', '_', value).strip(' ._')[:80] or '未命名'
    return '_' + name if re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', name, re.I) else name

def source_key(url):
    u = urlsplit(url)
    if u.hostname in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be'):
        from .source_identity import canonical
        return canonical(url)[0]
    if u.hostname in ('bilibili.com','www.bilibili.com') and re.fullmatch(r'/video/BV[\da-zA-Z]{10}/?',u.path):
        part=parse_qs(u.query).get('p',['1'])[0]
        if not part.isdigit() or not 1<=int(part)<=10000:raise ValueError('无效B站分P编号')
        return urlunsplit(('https','www.bilibili.com',u.path.rstrip('/'),'p='+str(int(part)) if int(part)>1 else '', ''))
    if (u.hostname or '').endswith('xiaohongshu.com'):
        note = re.search(r'/([a-f0-9]{24})/?$', u.path, re.I)
        if note: return 'https://www.xiaohongshu.com/explore/' + note[1]
    host = (u.hostname or '').lower()
    for domain, pattern in (('x.com', r'/status/\d+'), ('twitter.com', r'/status/\d+'),
                            ('instagram.com', r'^/(?:[\w.]+/)?(?:p|reels?)/[\w-]+'),
                            ('pinterest.com', r'^/pin/\d+'), ('pinterest.cn', r'^/pin/\d+')):
        if (host == domain or host.endswith('.' + domain)) and re.search(pattern, u.path):
            return urlunsplit((u.scheme, u.netloc, u.path.rstrip('/'), '', ''))
    # Unknown parameters may identify content (id, title, oldid, page, ...).
    # Remove only known tracking keys; sorting makes harmless key order stable.
    tracking = {'fbclid', 'gclid', 'dclid', 'msclkid', 'igshid', 'mc_cid', 'mc_eid'}
    query = [(key, value) for key, value in parse_qsl(u.query, keep_blank_values=True)
             if not key.lower().startswith('utm_') and key.lower() not in tracking]
    identity_query = urlencode(sorted(query, key=lambda pair: pair[0]))
    return urlunsplit((u.scheme, u.netloc, u.path.rstrip('/'), identity_query, ''))

def platform_name(url):
    host=urlsplit(url).hostname or ''
    if host in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be'):return 'YouTube'
    return next((name for domain,name in [('artstation.com','ArtStation'),('bilibili.com','B站'),('xiaohongshu.com','小红书'),('pinterest.com','Pinterest'),('pinterest.cn','Pinterest'),('instagram.com','Instagram'),('x.com','X'),('twitter.com','X'),('huaban.com','花瓣'),('weibo.com','微博'),('weibo.cn','微博')] if host==domain or host.endswith('.'+domain)),'其他网页')
