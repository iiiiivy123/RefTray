"""v3 folder names and identity markers; planning never creates directories."""
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from .destination_names import safe, source_key, platform_name

SCHEMA = 'function-platform-v3'

def enabled(value):
    return value.directory_schema == SCHEMA and value.layout in ('organized', 'organized_flat')

def label(value):
    if value.md_only or getattr(value, 'subtitle_mode', None) == 'only': return '文字'
    if value.capture_kind == 'video': return '音频' if getattr(value, 'output_format', None) == 'audio' else '视频'
    return '图文' if value.collection_mode == 'text' else '图片'

def group_url(value):
    if value.capture_scope == 'single': return None
    return (value.list_url if value.capture_scope == 'batch' else None) or value.board_url or value.author_url

def parts(value, platform):
    return platform == 'B站' and value.list_kind == 'collection' and bool(re.fullmatch(r'/video/BV[\da-zA-Z]{10}/?',urlsplit(value.list_url or '').path))

def group_name(value, platform):
    owner = value.list_owner or value.author_name or ''
    name = value.list_name or value.board_name or ''
    kind = value.list_kind or ('board' if value.board_url else 'works')
    def joined(prefix, *values): return safe('-'.join([prefix, *(str(v).strip() for v in values if str(v).strip())]))
    if kind == 'favorites':
        if re.match(r'^/board/',urlsplit(value.list_url or '').path):
            return joined('收藏夹采集',name or '未命名收藏夹',owner)
        return joined('收藏采集',owner or name or '未命名用户')
    if kind == 'board':
        return joined('画板采集',name or owner or '未命名画板',owner if platform != '花瓣' and owner != name else '')
    if parts(value,platform): return joined('分P采集',name or '未命名稿件',owner)
    if kind == 'collection':
        article=platform=='B站' and bool(re.search(r'/readlist/',value.list_url or ''))
        return joined('文集采集' if article else '合集采集',name or '未命名合集',owner)
    if kind == 'playlist': return joined('列表采集',name or '未命名列表',owner)
    if kind == 'album': return joined('作品集采集',name or '未命名作品集',owner)
    if platform == 'YouTube': return joined('Shorts采集' if kind=='shorts' else '频道采集',owner or '未命名频道')
    return joined('主页采集',owner or name or '未命名作者')

def flat_images(value, platform):
    return value.collection_mode=='images' and value.capture_kind!='video' and (platform=='Pinterest' or platform=='花瓣' and bool(group_url(value)))

def identity(key): return hashlib.sha256(key.encode()).hexdigest()[:12]

def read_marker(folder):
    try: return json.loads((folder/'_来源记录/identity.json').read_text('utf-8'))
    except (OSError,ValueError): return {}

def choose(parent, name, key, alternate=None):
    fingerprint=identity(key)
    for base in (parent,alternate):
        if base is None or not base.is_dir(): continue
        for path in sorted(base.iterdir()):
            if path.is_dir() and read_marker(path)=={'identity':fingerprint,'directory_schema':SCHEMA}:
                return path
    candidate=parent/safe(name)
    if not candidate.exists(): return candidate
    suffix='_'+fingerprint[:6]
    candidate=parent/(safe(name)+suffix)
    counter=2
    while candidate.exists():
        candidate=parent/(safe(name)+suffix+'_'+str(counter));counter+=1
    return candidate

def work_key(value, platform):
    return source_key(value.canonical_url)+(('#'+label(value)) if not parts(value,platform) else '')

def resolve(root, value):
    root=Path(value.destination).expanduser() if value.destination else Path(root)
    if not root.is_absolute(): raise ValueError('请使用完整的保存路径')
    root=root.resolve()
    if value.board_url and value.author_url and value.capture_scope!='single': raise ValueError('不能同时指定画板和作者')
    platform=platform_name(value.canonical_url);group=group_url(value)
    kind=label(value)
    purpose='批量' if group else '图文' if kind in ('图文','文字') else '视频' if kind in ('视频','音频') else '图片'
    parent=root/purpose/platform
    alternate=root/purpose if not group else None
    if not group and value.layout=='organized_flat':parent,alternate=alternate,parent
    if group: parent=choose(parent,group_name(value,platform),group)
    if value.md_only and not group:
        for previous in (parent, alternate):
            if previous and any(previous.glob('*_' + identity(source_key(value.canonical_url)) + '.md')):
                parent = previous
                break
    if value.md_only or flat_images(value,platform):
        folder=parent;grouped=bool(group) or flat_images(value,platform)
    else:
        title=value.page_title or '未命名作品'
        if parts(value,platform):
            part=int(parse_qs(urlsplit(value.canonical_url).query).get('p',['1'])[0])
            title=re.sub(r'^P\d+[\s·-]*','',title)
            name=f'P{part:02d}-{title}'
        else:name=kind+'-'+title
        if not group and value.layout=='organized_flat':name=platform+'-'+name
        folder=choose(parent,name,work_key(value,platform),alternate if not group else None)
        grouped=False
    if not folder.resolve().is_relative_to(root):raise ValueError('保存路径无效')
    return folder,grouped,identity(source_key(value.canonical_url))

def batch_directory(directory,value):
    if not enabled(value) or not group_url(value):return None
    platform=platform_name(value.canonical_url)
    return Path(directory) if value.md_only or flat_images(value,platform) else Path(directory).parent

def commit(directory,value):
    """Only call after a real output exists; do not reserve empty work folders."""
    if not enabled(value):return
    directory=Path(directory);platform=platform_name(value.canonical_url);group=group_url(value)
    markers=[]
    if group:markers.append((batch_directory(directory,value),group))
    if not value.md_only and not flat_images(value,platform):markers.append((directory,work_key(value,platform)))
    for folder,key in markers:
        path=folder/'_来源记录/identity.json'
        expected={'identity':identity(key),'directory_schema':SCHEMA}
        if path.exists() and read_marker(folder)!=expected:raise ValueError('保存目录已被其他作品使用，来源标记未覆盖')
        path.parent.mkdir(parents=True,exist_ok=True)
        temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(expected,ensure_ascii=False),'utf-8');temporary.replace(path)

def missing_directories(directory):
    """Remember only missing ancestors, so failure cleanup cannot delete old folders."""
    created=[];path=Path(directory)
    while not path.exists():created.append(path);path=path.parent
    return created

def create_media_directory(directory):
    created = missing_directories(directory)
    Path(directory).mkdir(parents=True,exist_ok=True)
    return created

def clean_empty(created):
    for path in created:
        try:path.rmdir()
        except FileNotFoundError:continue
        except OSError:break
