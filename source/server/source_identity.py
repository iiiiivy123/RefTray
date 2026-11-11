"""Pure video-post identity rules; no downloader, storage or process imports."""
import re
from urllib.parse import urlsplit, parse_qs

def canonical(value):
    u = urlsplit(value)
    if u.scheme != 'https' or u.username or u.password or u.port not in (None,443):
        raise ValueError('仅接受公开作品的HTTPS地址')
    if u.hostname in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be'):
        if u.hostname == 'youtu.be':
            identity = u.path.strip('/')
        elif u.path == '/watch':
            identity = parse_qs(u.query).get('v',[''])[0]
        elif u.path.startswith('/shorts/'):
            identity = u.path[len('/shorts/'):].rstrip('/')
        else:
            identity = ''
        if not re.fullmatch(r'[\w-]{11}', identity):
            raise ValueError('请打开具体YouTube视频或Shorts；不采集频道/播放列表')
        return 'https://www.youtube.com/watch?v='+identity, 'youtube'
    bili=re.fullmatch(r'/video/(BV[0-9A-Za-z]{10})/?',u.path)
    if u.hostname in ('bilibili.com','www.bilibili.com') and bili:
        parts=parse_qs(u.query,keep_blank_values=True).get('p',['1'])
        if len(parts)!=1 or not parts[0].isdigit() or not 1<=int(parts[0])<=10000:raise ValueError('无效或重复的B站分P编号')
        return 'https://www.bilibili.com/video/'+bili[1]+'/?p='+str(int(parts[0])),'bilibili'
    match = re.fullmatch(r'(/\w+/status/\d+)(?:/video/[1-4])?/?',u.path)
    if u.hostname in ('x.com','www.x.com','twitter.com','www.twitter.com') and match:
        return 'https://x.com'+match[1], 'x'
    raise ValueError('成熟解析器支持X主帖、YouTube和B站单视频')

