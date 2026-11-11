"""Small history previews. Originals and capture records are never rewritten."""
import base64
import hashlib
import io
import json
import os
import subprocess
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image, ImageOps

from .catalog import source_id

IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'}
VIDEO_SUFFIXES = {'.mp4', '.webm', '.mkv', '.mov', '.m4v'}
_workers = threading.BoundedSemaphore(2)


def _folder(catalog):
    return catalog.path.parent / 'previews'


def _cover(catalog, url):
    key = hashlib.sha256(source_id(url).encode()).hexdigest()
    return _folder(catalog) / ('cover-' + key + '.jpg')


def _jpeg(data):
    with Image.open(io.BytesIO(data)) as image:
        if image.width * image.height > 60_000_000:
            raise ValueError('图片尺寸过大，未生成预览')
        image.thumbnail((320, 240))
        image = ImageOps.exif_transpose(image).convert('RGB')
        output = io.BytesIO()
        image.save(output, 'JPEG', quality=82)
        return output.getvalue()


def _write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, suffix='.tmp', delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(data)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _frame(path):
    from .media_output import conversion_component
    executable = conversion_component()
    result = subprocess.run([
        executable, '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe',
        '-i', str(path), '-frames:v', '1', '-vf',
        'scale=320:240:force_original_aspect_ratio=decrease',
        '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1',
    ], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=8, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode or not result.stdout:
        raise ValueError('暂无可用的视频画面')
    return _jpeg(result.stdout)


def _trusted_cover(url, canonical):
    source = (urlsplit(canonical).hostname or '').lower()
    target = urlsplit(url)
    host = (target.hostname or '').lower()
    pairs = (
        (('bilibili.com',), ('hdslb.com',)),
        (('youtube.com', 'youtu.be'), ('ytimg.com', 'ggpht.com')),
        (('x.com', 'twitter.com'), ('twimg.com',)),
        (('instagram.com',), ('cdninstagram.com', 'fbcdn.net')),
        (('artstation.com',), ('artstation.com',)),
    )
    matches = lambda value, domains: any(value == d or value.endswith('.' + d) for d in domains)
    return (target.scheme == 'https' and not target.username and not target.password
            and target.port in (None, 443)
            and any(matches(source, sources) and matches(host, cdns) for sources, cdns in pairs))


def remember_audio_cover(catalog, value, local_video=None):
    """Optional presentation asset; a missing cover never changes saved audio."""
    if not catalog:
        return ''
    path = _cover(catalog, value.canonical_url)
    if path.is_file():
        return ''
    try:
        if value.cover_url and _trusted_cover(value.cover_url, value.canonical_url):
            from .image_download import download_image
            data, _ = download_image(value.cover_url, 4)
            _write(path, _jpeg(data))
        elif local_video:
            _write(path, _frame(local_video))
        else:
            return '音频封面不可用，记录将显示音频标记'
        return ''
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        return '音频已保留，缩略图生成失败：' + str(exc)[:160]


def preview(catalog, item):
    """Only indexed files inside this record's folder can supply a preview."""
    root = Path(item['directory']).resolve()
    files = []
    for entry in item['files']:
        path = Path(entry['path']).resolve()
        if (path.is_relative_to(root) and path.is_file()
                and path.stat().st_size == entry['size']
                and path.suffix.lower() in IMAGE_SUFFIXES | VIDEO_SUFFIXES):
            files.append((path, entry))
    cover = _cover(catalog, item['url'])
    if not files and not cover.is_file():
        return {'image': None, 'reason': '这条记录没有可用的图片或视频画面'}
    with _workers:
        try:
            if cover.is_file():
                data = cover.read_bytes()
            else:
                files.sort(key=lambda pair: pair[0].suffix.lower() not in IMAGE_SUFFIXES)
                path, entry = files[0]
                signature = json.dumps([entry, path.stat().st_mtime_ns], sort_keys=True)
                cache = _folder(catalog) / (hashlib.sha256(signature.encode()).hexdigest() + '.jpg')
                if cache.is_file():
                    data = cache.read_bytes()
                elif path.suffix.lower() in IMAGE_SUFFIXES:
                    if path.stat().st_size > 30 * 1024 * 1024:
                        return {'image': None, 'reason': '图片过大，未生成预览'}
                    data = _jpeg(path.read_bytes())
                    _write(cache, data)
                else:
                    data = _frame(path)
                    _write(cache, data)
            return {'image': 'data:image/jpeg;base64,' + base64.b64encode(data).decode('ascii')}
        except (OSError, ValueError, subprocess.SubprocessError):
            return {'image': None, 'reason': '缩略图暂不可用，仍可打开原文件夹'}
