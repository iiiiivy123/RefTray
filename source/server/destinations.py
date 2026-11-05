"""One destination policy shared by images, downloaded videos and extracted frames."""
import hashlib
import re
import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qs, parse_qsl, urlencode

def safe(value):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', '_', value).strip(' ._')[:80] or '未命名'
    return '_' + name if re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', name, re.I) else name

def source_key(url):
    u = urlsplit(url)
    if u.hostname in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be'):
        from .media_resolver import canonical
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

def note_media_layout(value):
    host = urlsplit(value.canonical_url).hostname or ''
    return (value.collection_mode == 'text' or host == 'xiaohongshu.com' or host.endswith('.xiaohongshu.com')) and value.layout != 'direct' and not value.md_only

def pinterest_image_layout(value):
    host = urlsplit(value.canonical_url).hostname or ''
    return (host in ('pinterest.com', 'pinterest.cn') or host.endswith(('.pinterest.com', '.pinterest.cn'))) and value.collection_mode == 'images' and value.capture_kind != 'video'

def resolve_destination(root, value):
    root = Path(value.destination).expanduser() if value.destination else Path(root)
    if not root.is_absolute(): raise ValueError('请使用完整的保存路径')
    root = root.resolve()
    board, author = (None, None) if value.capture_scope == 'single' else (value.board_url, value.author_url)
    list_url = value.list_url if value.capture_scope == 'batch' else None
    if board and author: raise ValueError('不能同时指定画板和作者')
    key = source_key(value.canonical_url)
    page_id = hashlib.sha256(key.encode()).hexdigest()[:12]
    layout = value.layout
    if layout == 'direct':
        return root, True, page_id
    host = urlsplit(value.canonical_url).hostname or ''
    platform = next((name for domain, name in [('artstation.com','ArtStation'),('bilibili.com','B站'),('xiaohongshu.com','小红书'),('pinterest.com','Pinterest'),('pinterest.cn','Pinterest'),('instagram.com','Instagram'),('x.com','X'),('twitter.com','X'),('huaban.com','花瓣'),('weibo.com','微博'),('weibo.cn','微博')] if host == domain or host.endswith('.' + domain)), '其他网页')
    parent = root / platform if layout in ('platform', 'organized') else root
    if host in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be'):
        platform='YouTube'
        parent=root/platform if layout in ('platform','organized') else root
    organized = layout in ('organized', 'organized_flat')
    single_layout = organized and value.directory_schema == 'function-platform-v2' and not (board or author or list_url)
    alternate_parent = None
    if organized and value.directory_schema == 'function-platform-v2':
        purpose = '批量' if board or author or list_url else {'text':'图文', 'images':'图片', 'video':'视频'}[value.capture_kind or value.collection_mode]
        parent = root / purpose / platform
        if single_layout:
            alternate_parent = root / purpose
            if layout == 'organized_flat':
                parent, alternate_parent = alternate_parent, parent
    elif organized:
        parent = parent / (('图文' if value.collection_mode == 'text' else '图片') + ('批量' if board or author else '单帖'))
    if layout == 'legacy': parent = root / ('画板采集' if board else '作者采集' if author else '图文采集' if value.collection_mode == 'text' else '普通采集')
    if pinterest_image_layout(value):
        # New captures share media/source indexes; never search or migrate old Pin folders.
        group_url = list_url or board or author
        if group_url:
            identity = hashlib.sha256(source_key(group_url).encode()).hexdigest()[:12]
            directory = parent / safe(value.list_name or value.board_name or value.author_name or '未命名画板')
            marker = directory / '_来源记录' / 'identity.json'
            if marker.exists() and json.loads(marker.read_text(encoding='utf-8')).get('identity') != identity:
                directory = directory.with_name(directory.name + '_' + identity)
            marker = directory / '_来源记录' / 'identity.json'
        else:
            directory, marker = parent, None
        if not directory.resolve().is_relative_to(root): raise ValueError('保存路径无效')
        directory.mkdir(parents=True, exist_ok=True)
        if marker:
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.write_text(json.dumps({'identity': identity}), encoding='utf-8')
        return directory, True, page_id
    group_url = board or author
    group_name = value.board_name if board else value.author_name if author else None
    if list_url and value.directory_schema == 'function-platform-v2':
        group_url = list_url
        owner = safe(value.list_owner or value.author_name or '未命名作者')
        name = safe(value.list_name or '未命名列表')
        if value.list_kind == 'favorites':
            parent /= '收藏夹'
            group_name = name + ' · ' + owner
        elif value.list_kind == 'board':
            parent /= name
            group_name = owner
        elif value.list_kind in ('videos','shorts','works'):
            parent /= owner
            group_name = {'videos':'视频','shorts':'Shorts','works':name}[value.list_kind]
        elif value.list_kind == 'collection' and platform == 'B站':
            parent = parent / owner / name
            group_name = '图文' if value.collection_mode == 'text' else '视频'
        else:
            parent /= owner
            if value.list_kind == 'playlist': parent /= '播放列表'
            group_name = name
    # Playlist/channel identities must retain their own URL, not the single-video parser.
    group_key = group_url if list_url or group_url and platform == 'YouTube' else source_key(group_url) if group_url else key
    identity = hashlib.sha256(group_key.encode()).hexdigest()[:12]
    if value.md_only:
        # Separate from existing illustrated notes: never delete or inherit their attachments.
        if alternate_parent:
            # Text-only documents have no work folder/identity marker. Their stable
            # page-id suffix identifies the old location without reading media.
            for previous in (parent, alternate_parent):
                if any(previous.glob('*_' + page_id + '.md')):
                    parent = previous
                    break
        directory = parent / (safe(group_name or '笔记') + '_纯文字_' + identity) if group_url else parent
        if not directory.resolve().is_relative_to(root): raise ValueError('保存路径无效')
        directory.mkdir(parents=True, exist_ok=True)
        return directory, bool(group_url), page_id
    prefix = ('画板_' if board else '作者_' if author else '') if layout == 'legacy' else ''
    directory = next((p for p in parent.glob(f'*_{identity}') if p.is_dir()), None)
    if directory and board and directory.name.startswith('Pinterest_') and group_name and group_name.lower() != 'pinterest':
        directory = None  # Keep legacy files intact; corrected names apply to new captures.
    if not directory:
        for candidate in (p for base in (parent, alternate_parent) if base for p in base.glob('*') if p.is_dir()):
            marker = candidate / ('_原始资料' if value.collection_mode == 'text' and value.directory_schema != 'function-platform-v2' else '_来源记录') / 'identity.json'
            if not marker.exists(): marker = candidate / '_来源记录' / 'identity.json'
            if not marker.exists(): marker = candidate / 'identity.json'
            try:
                if json.loads(marker.read_text(encoding='utf-8')).get('identity') == identity:
                    directory = candidate; parent = candidate.parent; break
            except (OSError, ValueError): pass
    if not directory:
        if single_layout and layout == 'organized_flat': prefix = platform + '-'
        directory = parent / f'{prefix}{safe(group_name or value.page_title or "网页素材")}'
        if directory.exists(): directory = parent / f'{directory.name}_{identity[:6]}'
    if directory.resolve().parent != parent.resolve() or not directory.resolve().is_relative_to(root): raise ValueError('保存路径无效')
    marker = directory / '_来源记录' / 'identity.json'
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(json.dumps({'identity': identity}, ensure_ascii=False), encoding='utf-8')
    if group_url and (note_media_layout(value) or list_url and platform == 'ArtStation' or list_url and value.list_kind == 'favorites'):
        # Keep the author's existing files intact; new captures get one child per note.
        child = value.model_copy(update={'destination': str(directory), 'layout': 'flat', 'capture_scope': 'single'})
        return resolve_destination(directory, child)
    return directory, bool(group_url), page_id

def text_assets(directory, value, page_id):
    parent = directory / '_原始资料'
    existing = next((p for p in parent.glob(f'*_{page_id}') if p.is_dir()), None)
    return existing or parent / f'{safe(value.page_title or "未命名笔记")}_{page_id}'
