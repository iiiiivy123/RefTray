from __future__ import annotations

import hashlib
import base64
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from collections import deque
from itertools import islice
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from .image_download import download_image

from .config import Settings
from .models import ClassifyRequest, CollectRequest, ImageItem
from .destinations import resolve_destination, text_assets, note_media_layout, pinterest_image_layout
from .ocr import recognize
from .catalog import Catalog, fingerprint
from .image_validation import validate_image
import shutil


def now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def safe(value: str, fallback: str = "untitled") -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", value).strip(" ._")
    if re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', value, re.I): value = '_' + value
    return value[:80] or fallback


class Storage:
    def __init__(self, settings: Settings):
        self.settings = settings
        if settings.library_configured:
            settings.inbox.mkdir(parents=True, exist_ok=True)
        self.catalog = Catalog(settings.root)
        self._collect_lock = threading.Lock()

    def collect(self, request: CollectRequest, progress=lambda _p, _m: None) -> dict[str, object]:
        # Requests for the same author share one index; serialize index updates.
        with self._collect_lock:
            return self._collect(request, progress)

    def _collect(self, request: CollectRequest, progress) -> dict[str, object]:
        omitted = request.omitted_images
        if request.max_images and len(request.images) > request.max_images:
            omitted += len(request.images) - request.max_images
            request = request.model_copy(update={'images': request.images[:request.max_images]})
        if request.md_only:
            return self._collect_markdown_only(request, progress)
        progress(5, "读取网页图片")
        if request.author_url and request.board_url:
            raise ValueError('不能同时指定作者和画板')
        if request.collection_mode == 'text' and not request.body_text.strip() and not request.images:
            raise ValueError('没有可保存的正文或图片')
        page_dir, flat_media, page_id = resolve_destination(self.settings.inbox, request)
        author_dir = page_dir if flat_media else None
        image_dir = page_dir
        per_post = request.layout == 'direct' or (flat_media and request.collection_mode == 'text')
        metadata_path = page_dir / (f'metadata_{page_id}.json' if per_post else 'metadata.json')
        if request.collection_mode == 'text':
            asset_dir = text_assets(page_dir, request, page_id)
            image_dir = asset_dir / '图片'
            metadata_path = asset_dir / '来源记录.json'
        else:
            metadata_path = page_dir / '_来源记录' / metadata_path.name
        if note_media_layout(request):
            image_dir = page_dir
            metadata_path = page_dir / '_来源记录' / 'metadata.json'
        existing = self._load(metadata_path, {})
        if not existing and request.collection_mode != 'text':
            legacy_path = page_dir / (f'metadata_{page_id}.json' if request.layout == 'direct' else 'metadata.json')
            existing = self._load(legacy_path, {})
        if not existing and note_media_layout(request) and request.collection_mode == 'text':
            existing = self._load(text_assets(page_dir, request, page_id) / '来源记录.json', {})
        known_images = {item.get("sha256"): item for item in existing.get("images", [])}
        text_only_images = request.collection_mode == 'text' and not request.include_images
        if text_only_images:
            known_images = {}
        confirmed_files = set()
        saved, warnings = [], list(request.extraction_warnings)
        with ThreadPoolExecutor(max_workers=6) as pool:
            items = request.images
            total = max(len(items), 1)
            read_count = 0
            progress_lock = threading.Lock()
            def load(item):
                nonlocal read_count
                try:
                    cached = self.catalog.cached(item.url, image=True) if request.duplicate_policy != 'refresh' and not item.data_base64 else None
                    if cached:
                        data = cached.read_bytes()
                        return data, validate_image(data)
                    return self._download(item)
                finally:
                    with progress_lock:
                        read_count += 1
                        progress(10 + int(read_count / total * 70), f'读取图片 {read_count}/{total}，按顺序保存')
            def queued():
                remaining = iter(items)
                pending = deque((item, pool.submit(load, item)) for item in islice(remaining, 6))
                while pending:
                    yield pending.popleft()
                    item = next(remaining, None)
                    if item is not None:
                        pending.append((item, pool.submit(load, item)))
            for done, (item, future) in enumerate(queued(), 1):
                try:
                    data, suffix = future.result()
                    digest = hashlib.sha256(data).hexdigest()
                    if text_only_images:
                        if digest not in known_images and request.ocr_enabled:
                            import tempfile
                            with tempfile.TemporaryDirectory(prefix='collector-ocr-') as temporary_root:
                                temporary_image = Path(temporary_root) / ('source' + suffix)
                                temporary_image.write_bytes(data)
                                known_images[digest] = {'sha256': digest, 'ocr': recognize(temporary_image)}
                        continue
                    previous_image = known_images.get(digest, {})
                    if previous_image.get('file') and (not note_media_layout(request) or Path(previous_image['file']).parent == Path('.')) and (page_dir / previous_image['file']).is_file() and fingerprint(page_dir / previous_image['file']) == digest:
                        if 'role' not in previous_image or item.role == 'body':
                            previous_image.update(role=item.role, comment_id=item.comment_id)
                        confirmed_files.add(known_images[digest]["file"])
                        continue
                    filename = f"{page_id}_{digest[:16]}{suffix}" if author_dir else f"{len(known_images) + 1:03d}_{digest[:10]}{suffix}"
                    if pinterest_image_layout(request):
                        pin_id = re.search(r'/pin/(\d+)', urlparse(request.canonical_url).path)
                        name = safe(request.page_title or 'Pin') + '_' + (pin_id[1] if pin_id else page_id)
                        filename = name + (f'_{done:02d}' if len(request.images) > 1 else '') + suffix
                    if item.source_kind == 'video_frame' and item.frame_time is not None:
                        filename = f"frame_{round(item.frame_time * 1000):09d}ms_{digest[:10]}{suffix}"
                    path = image_dir / filename
                    path.parent.mkdir(parents=True, exist_ok=True)
                    if path.exists() and fingerprint(path) != digest:
                        from uuid import uuid4
                        path = path.with_name(path.stem + '_' + uuid4().hex[:8] + path.suffix)
                    # Disk reserve policy removed; OS write errors still propagate.
                    temporary = path.with_suffix(path.suffix + '.part')
                    temporary.write_bytes(data)
                    temporary.replace(path)
                    record = {**previous_image, "file": str(path.relative_to(page_dir)), "sha256": digest, "url": item.url, "alt": item.alt,
                              "role": item.role, "comment_id": item.comment_id}
                    if item.source_kind == 'video_frame':
                        record.update(source_kind='video_frame', frame_time=item.frame_time)
                    saved.append(record)
                    known_images[digest] = record
                    self.catalog.register_asset(item.url, path, digest)
                    confirmed_files.add(record["file"])
                except Exception as exc:
                    # Do not expose signed CDN queries; keep the real download failure.
                    parsed = urlparse(item.url)
                    warnings.append(f"图片 {done}（{parsed.hostname}）：{type(exc).__name__}: {str(exc)[:300]}")
                with progress_lock:
                    progress(10 + int(read_count / total * 70), f"保存图片 {done}/{total}")
        merged_images = list(known_images.values())
        metadata = {
            **existing,
            "collection_mode": request.collection_mode,
            "source_url": request.canonical_url,
            "page_title": request.page_title,
            "selected_text": request.selected_text,
            "collected_at": existing.get("collected_at") or now(),
            "updated_at": now(),
            "theme": existing.get("theme") or request.selected_text or request.page_title,
            "classification_status": existing.get("classification_status", "pending"),
            "style_tags": existing.get("style_tags", []),
            "visual_tags": existing.get("visual_tags", []),
            "suitable_for": existing.get("suitable_for", []),
            "images": merged_images,
            "warnings": warnings,
        }
        if author_dir and request.collection_mode != 'text':
            sources = existing.get("sources", {})
            previous = sources.get(page_id, {})
            sources[page_id] = {"source_url": request.canonical_url, "page_title": request.page_title,
                "selected_text": request.selected_text, "updated_at": now(),
                "files": sorted(set(previous.get("files", [])) | confirmed_files)}
            metadata['sources'] = sources
            if request.author_url:
                metadata.update(author_url=request.author_url, author_name=request.author_name,
                    source_url=request.author_url, page_title=request.author_name,
                    theme=existing.get("theme") or request.author_name)
            if request.board_url:
                metadata.pop('author_url', None)
                metadata.pop('author_name', None)
                metadata.update(board_url=request.board_url, board_name=request.board_name,
                    source_url=request.board_url, page_title=request.board_name,
                    theme=existing.get('theme') or request.board_name)
        self._write(metadata_path, metadata)
        markdown_name = f'source_{page_id}.md' if per_post else 'source.md'
        if request.collection_mode == 'text':
            # Incremental comments; toggling comments off must not erase earlier captures.
            comments = { c.get('id') or (c.get('author'), c['text']): c for c in existing.get('comments', []) }
            for comment in request.comments:
                comments[comment.id or (comment.author, comment.text)] = comment.model_dump()
            metadata.update(collection_mode='text', platform=request.platform,
                body_text=request.body_text or existing.get('body_text', ''),
                document_source=request.document_source.model_dump() if request.document_source else (None if request.body_text else existing.get('document_source')),
                author_name=request.author_name or existing.get('author_name'),
                published_at=request.published_at or existing.get('published_at'),
                comments=list(comments.values()), comments_status=request.comments_status if request.comments_status != 'not_requested' else existing.get('comments_status', '未开启'))
            for index, image in enumerate(merged_images, 1):
                if image.get('role', 'body') != 'comment' and image.get('file') and request.ocr_enabled and image.get('ocr', {}).get('status') != 'completed':
                    progress(92, f'识别图片文字 {index}/{len(merged_images)}')
                    image['ocr'] = recognize(page_dir / image['file'])
            metadata['ocr_status'] = ('completed' if all(i.get('ocr', {}).get('status') == 'completed' for i in merged_images if i.get('role', 'body') != 'comment') else 'partial') if request.ocr_enabled else 'disabled'
            valid_media = set(existing.get('media_files', []))
            for name in request.media_files:
                candidate = (page_dir / name).resolve()
                if candidate.is_relative_to(page_dir.resolve()) and candidate.is_file(): valid_media.add(str(candidate.relative_to(page_dir)))
            metadata['media_files'] = sorted(valid_media)
            markdown_name = existing.get('reading_file') or safe(request.page_title or '未命名笔记') + '.md'
            if not existing.get('reading_file') and (page_dir / markdown_name).exists(): markdown_name = safe(request.page_title or '未命名笔记') + '_' + page_id[:6] + '.md'
            metadata['reading_file'] = markdown_name
            previous_doc = page_dir / markdown_name
            if previous_doc.is_file() and (not existing.get('reading_sha256') or fingerprint(previous_doc) != existing['reading_sha256']):
                # Preserve an edited or untracked document, rather than overwrite it.
                from uuid import uuid4
                markdown_name = safe(request.page_title or '未命名笔记') + '_' + uuid4().hex[:8] + '.md'
                metadata['reading_file'] = markdown_name
            self._write(metadata_path, metadata)
            self._write_markdown(page_dir, metadata, markdown_name)
            metadata['reading_sha256'] = fingerprint(page_dir / markdown_name)
            self._write(metadata_path, metadata)
        elif existing.get('body_text') or existing.get('comments'):
            self._write_markdown(page_dir, metadata, markdown_name)
        if request.images and not confirmed_files and request.collection_mode != 'text':
            reason = '网站拒绝图片请求（HTTP 403）；图片尚未保存。' if any('403' in w for w in warnings) else '图片未能下载；请查看具体原因。'
            failures = warnings[len(request.extraction_warnings):]
            raise RuntimeError(f"图片下载全部失败（{len(failures)} 张）；{reason}\n" + '\n'.join(failures[:5]))
        progress(100, "保存完成")
        result = {"directory": str(page_dir), "author_directory": str(author_dir) if author_dir else None, "new_images": len(saved), "total_images": 0 if text_only_images else len(confirmed_files) if author_dir else len(merged_images), "warnings": warnings}
        result['duplicate_images'] = max(0, len(confirmed_files) - len(saved))
        result['failed_images'] = len(warnings) - len(request.extraction_warnings)
        result['omitted_images'] = omitted
        result['partial'] = bool(omitted or result['failed_images'])
        if omitted:
            warnings.append(f'达到本次图片上限，另有 {omitted} 张未处理；本页未全部保存')
        if request.collection_mode == 'text':
            result['comments_status'] = metadata['comments_status']
            result['ocr_status'] = metadata['ocr_status']
            result['warnings'].append('评论：' + metadata['comments_status'])
            if metadata['ocr_status'] == 'partial': result['warnings'].append('部分图片文字识别未完成；请检查 Windows OCR 语言包。' + ('未保留识别用图片。' if text_only_images else '原图已保留。'))
        result['files'] = sorted(confirmed_files)
        if request.collection_mode == 'text':
            result['message'] = f"图文已保存：{markdown_name}\n新增 {len(saved)} 张图片，累计 {len(metadata['comments'])} 条已加载评论\n{page_dir}"
        if warnings:
            result['message'] = str(result.get('message') or f'新增 {len(saved)} 张图片，累计 {len(merged_images)} 张') + '\n提示：' + '\n'.join(warnings)
        if request.collection_mode != 'text':
            result['message'] = f"新增 {len(saved)} 张 · 重复 {result['duplicate_images']} 张 · 失败 {result['failed_images']} 张\n保存位置：{page_dir}"
        if omitted:
            result['message'] += f'\n达到本次图片上限，另有 {omitted} 张未处理'
        coverage = {'images': not text_only_images and not omitted and bool(confirmed_files) and all(i.source_kind=='image' for i in request.images) and result['failed_images'] == 0,
                    'text': request.collection_mode == 'text',
                    'comments': request.comments_requested and bool(metadata.get('comments')),
                    'ocr': request.collection_mode == 'text' and metadata.get('ocr_status') == 'completed'}
        coverage['category'] = 'batch' if request.capture_scope == 'batch' or request.capture_scope is None and (request.author_url or request.board_url) else request.capture_kind or request.collection_mode
        files = list(confirmed_files)
        if request.collection_mode == 'text': files.append(markdown_name)
        try:
            self.catalog.record(request.canonical_url, request.page_title, request.author_name or request.board_name,
                request.collection_mode, page_dir, files, coverage)
        except Exception as exc:
            raise RuntimeError(f'文件已保存，但采集记录写入失败；请勿盲目重采：{exc}') from exc
        return result

    def _collect_markdown_only(self, request, progress):
        if request.collection_mode != 'text' or not request.body_text.strip():
            raise ValueError('纯文字模式没有可保存正文，未生成空文件')
        # Ignore unexpected media fields at the storage boundary, not just in the UI.
        request = request.model_copy(update={'images': [], 'media_files': [], 'ocr_enabled': False, 'capture_kind': 'text'})
        directory, grouped, page_id = resolve_destination(self.settings.inbox, request)
        from .destinations import source_key
        index_key = hashlib.sha256((str(directory.resolve()) + source_key(request.canonical_url)).encode()).hexdigest()
        metadata_path = self.settings.root / 'data/inspiration/md-only' / (index_key + '.json')
        old = self._load(metadata_path, {})
        filename = old.get('reading_file') or safe(request.page_title or '笔记') + '_' + page_id + '.md'
        target = directory / filename
        if target.exists() and (not old.get('reading_sha256') or fingerprint(target) != old['reading_sha256']):
            from uuid import uuid4
            filename = safe(request.page_title or '笔记') + '_' + uuid4().hex[:8] + '.md'
        data = {'page_title': request.page_title, 'source_url': request.canonical_url,
                'author_name': request.author_name, 'published_at': request.published_at,
                'body_text': request.body_text, 'images': [], 'warnings': request.extraction_warnings,
                'document_source': request.document_source.model_dump() if request.document_source else None,
                'collected_at': old.get('collected_at') or now(), 'updated_at': now(),
                'comments': [c.model_dump() for c in request.comments] if request.comments_requested else [],
                'comments_status': request.comments_status, 'md_only': True,
                'comments_requested': request.comments_requested}
        # Disk reserve policy removed; OS write errors still propagate.
        self._write_markdown(directory, data, filename)
        self._write(metadata_path, {**data, 'reading_file': filename, 'reading_sha256': fingerprint(directory/filename)})
        self.catalog.record(request.canonical_url, request.page_title, request.author_name, 'text', directory,
                            [filename], {'text': True, 'md_only': True, 'comments': request.comments_requested,
                            'category': 'batch' if grouped else 'text'})
        progress(100, '纯文字已保存')
        return {'directory': str(directory), 'files': [filename], 'new_images': 0, 'total_images': 0,
                'failed_images': 0, 'duplicate_images': 0, 'warnings': list(request.extraction_warnings),
                'message': '纯文字已保存：' + filename}

    @staticmethod
    def _write_markdown(directory: Path, data: dict, filename='source.md') -> None:
        import html
        from urllib.parse import quote
        # Escape page text so Markdown cannot turn captured HTML into active content.
        def plain(value):
            text = html.escape(str(value or ''), quote=False)
            return re.sub(r'([\\`*_{}\[\]()#!|>])', r'\\\1', text)
        source = data.get('document_source') or {}
        rendered_images = set()
        body = []
        for block in source.get('blocks', []):
            kind, value = block['kind'], plain(block.get('text'))
            if kind == 'heading':
                body.append('#' * min(6, block.get('level', 1) + 2) + ' ' + value.replace('\n', ' '))
            elif kind == 'list_item':
                indent = '    ' * block.get('depth', 0)
                marker = str(block.get('number', 1)) + '.' if block.get('ordered') else '-'
                body.append(indent + marker + ' ' + value.replace('\n', '\n' + indent + '    '))
            elif kind == 'quote':
                body.append('\n'.join('> ' + line for line in value.split('\n')))
            elif kind == 'table':
                rows = block.get('rows') or []
                width = max((len(row) for row in rows), default=0)
                if width:
                    # An empty header avoids falsely treating the first data row as labels.
                    body.extend(['| ' + ' | '.join([''] * width) + ' |', '| ' + ' | '.join(['---'] * width) + ' |'])
                    for row in rows:
                        body.append('| ' + ' | '.join(plain(cell).replace('\n', ' ') for cell in row + [''] * (width - len(row))) + ' |')
            elif kind == 'image':
                image = next((item for item in data.get('images', []) if item.get('url') == block.get('url') and item.get('file')), None)
                if image and not data.get('md_only'):
                    relative = Path(image['file']).as_posix()
                    if relative not in rendered_images:
                        body.append(f'![{value or "正文图片"}]({quote(relative)})')
                        rendered_images.add(relative)
                else:
                    body.append('图片：' + (value or '正文插图') + '（未保存附件；来源记录保留图片链接）')
            else:
                body.append(value)
            body.append('')
        if not body:
            body = [plain(data.get('body_text')), '']
        elif source.get('warnings'):
            body.extend(['### 原纯文字（结构有省略或转换）', '', plain(data.get('body_text')), ''])
        lines = [f"# {plain(data.get('page_title'))}", '',
            '来源：' + plain(data['source_url']), '',
            '作者：' + plain(data.get('author_name') or '未识别'), '',
            '发布时间：' + plain(data.get('published_at') or '未识别'), '',
            '## 正文', '', *body,
            '## 已加载评论', '', f"已保存 {len(data.get('comments', []))} 条；本次状态：{plain(data.get('comments_status', 'unknown'))}。仅包含已加载内容，不代表全部评论。", '']
        for item in data.get('comments', []):
            lines.extend([f"- {plain(item.get('author') or '未识别作者')}：{plain(item['text'])}", ''])
            if item.get('url'): lines.extend(['  来源：' + plain(item['url']), ''])
            for url in item.get('images', []):
                image = next((i for i in data.get('images', []) if i.get('url') == url and i.get('file')), None)
                if image:
                    from urllib.parse import quote
                    lines.extend(['  ![评论图片](' + quote(Path(image['file']).as_posix(), safe='/') + ')', ''])
                    rendered_images.add(Path(image['file']).as_posix())
        if data.get('md_only') and not data.get('comments_requested'):
            lines = lines[:lines.index('## 已加载评论')]
        if not data.get('md_only'):
            lines.extend(['## 图片识别文字', '', '以下为本地 OCR 结果，可能有错字或漏字，请对照原图。', ''])
        for i, item in enumerate(data['images'], 1):
            if item.get('role') == 'comment':
                continue
            relative = Path(item['file']).as_posix() if item.get('file') else None
            from urllib.parse import quote
            ocr = item.get('ocr', {})
            lines.extend([f'### 图片 {i}', '', plain(ocr.get('text') or ('未检测到文字' if ocr.get('status') == 'completed' else '文字识别未完成或未启用')), ''])
            if relative and relative not in rendered_images:
                lines.extend([f'![正文图片]({quote(relative)})', ''])
        from urllib.parse import quote
        for name in data.get('media_files', []):
            lines.extend([f'![GIF 动图]({quote(name)})' if Path(name).suffix.lower()=='.gif' else f'[视频附件]({quote(name)})', ''])
        warnings = list(dict.fromkeys([*data['warnings'], *source.get('warnings', [])]))
        lines.extend(['## 采集提示', '', *[plain(w) for w in warnings]])
        temporary = directory / (filename + '.tmp')
        temporary.write_text('\n'.join(lines), encoding='utf-8')
        temporary.replace(directory / filename)

    def classify(self, folder: str, classification: ClassifyRequest) -> dict[str, object]:
        page_dir = (self.settings.inbox / folder).resolve()
        if self.settings.inbox.resolve() not in page_dir.parents:
            raise ValueError("invalid folder")
        path = page_dir / "metadata.json"
        if (page_dir / '_来源记录' / 'metadata.json').is_file(): path = page_dir / '_来源记录' / 'metadata.json'
        metadata = self._load(path, None)
        if metadata is None:
            raise FileNotFoundError(folder)
        metadata.update(classification.model_dump(), classification_status="classified", updated_at=now())
        self._write(path, metadata)
        return metadata

    def _download(self, item: ImageItem) -> tuple[bytes, str]:
        if item.source_kind == 'comment_gif':
            from .comment_gif import read_gif
            if item.role != 'comment' or not item.comment_id or item.data_base64:
                raise ValueError('评论动图缺少归属或来源不符')
            data = read_gif(item.url, self.settings.timeout)
            return data, validate_image(data)
        if item.data_base64:
            if len(item.data_base64) > 40 * 1024 * 1024:
                raise ValueError('image exceeds 30MB')
            data = base64.b64decode(item.data_base64, validate=True)
            return data, validate_image(data)
        if item.source_kind == 'video_frame':
            raise ValueError('video frame data missing')
        data, content_type = download_image(item.url, self.settings.timeout)
        return data, validate_image(data)

    @staticmethod
    def _load(path: Path, default):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return default

    @staticmethod
    def _write(path: Path, value: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(path)
