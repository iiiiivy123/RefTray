"""Platform image identities only; HTTP validation and transfer stay in image_download."""
import re
from urllib.parse import urlsplit, urlunsplit


def xhs_original_url(value):
    """Keep the exact file key from a signed XHS web image; request its PNG rendition.

    Public rendition endpoint corroborated by XHS-Downloader's image extractor;
    verified locally against the same post's 1080px preview and 4500px image.
    Unknown URL shapes stay unchanged, including GIF and video sources.
    """
    try:
        url = urlsplit(value)
        if (url.scheme != 'https' or url.username or url.password or url.port not in (None, 443)
                or not re.fullmatch(r'sns-webpic-[a-z0-9-]+\.xhscdn\.com', url.hostname or '')):
            return None
        match = re.fullmatch(r'/\d{12,14}/[a-f0-9]{32}/((?:notes_pre_post/)?[A-Za-z0-9_-]{10,200})!nd_[A-Za-z0-9_]+', url.path)
        if match: return 'https://ci.xiaohongshu.com/' + match[1] + '?imageView2/format/png'
    except ValueError:
        pass
    return None


def original_candidates(platform, value, preferred_url=None):
    """Known renditions of one exact asset, highest first; no arbitrary host changes."""
    if platform == 'xhs':
        original = xhs_original_url(value)
        return [original] if original else []
    try:
        url = urlsplit(value)
        if url.scheme != 'https' or url.username or url.password or url.port not in (None,443): return []
        if platform == 'huaban' and preferred_url:
            preferred=urlsplit(preferred_url)
            original_path=re.sub(r'_fw\d+(?:webp)?$', '', url.path)
            if (re.fullmatch(r'(?:gd-)?hbimg(?:-edge)?\.huaban\.com',url.hostname or '')
                    and original_path != url.path and re.fullmatch(r'/[a-f0-9]{40,80}(?:-[A-Za-z0-9]+)?',original_path)
                    and preferred==url._replace(path=original_path)):
                return [preferred_url]
        if platform == 'pinterest' and url.hostname == 'i.pinimg.com':
            match = re.fullmatch(r'/\d+x(?:\d+)?(?:_RS)?/([a-f0-9]{2}/[a-f0-9]{2}/[a-f0-9]{2}/[a-f0-9]{32}\.(?:jpe?g|png|webp))',url.path,re.I)
            if match: return [urlunsplit(url._replace(path='/originals/'+match[1]))]
        if platform == 'artstation' and re.fullmatch(r'cdn[ab]?\.artstation\.com',url.hostname or ''):
            match = re.fullmatch(r'(/p/assets/images/images/\d{3}/\d{3}/\d{3}/)(small|medium|large|4k)/([^/]+\.(?:jpe?g|png|webp))',url.path,re.I)
            if match:
                sizes = ('8k',) if match[2]=='4k' else ('8k','4k')
                return [urlunsplit(url._replace(path=match[1]+size+'/'+match[3])) for size in sizes]
    except ValueError:
        pass
    return []
