"""Save a complete browser-rendered PNG plus provenance, without moving materials."""
import base64
import hashlib
import io
import json
import os
import sqlite3
import threading
import time
from datetime import datetime, timezone
from uuid import uuid4
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from PIL import Image
from .destination_layout import snapshot_directory, missing_directories, clean_empty


class SnapshotStart(BaseModel):
    url: str = Field(max_length=4096)
    title: str = Field(default='', max_length=1000)

    @field_validator('url')
    @classmethod
    def ordinary_url(cls, value):
        u = urlsplit(value)
        if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password:
            raise ValueError('仅支持普通网页截图')
        return value


class SnapshotProgress(BaseModel):
    message: str = Field(default='', max_length=500)


class SnapshotFinish(BaseModel):
    png: str = Field(max_length=40 * 1024 * 1024)
    width: int = Field(gt=0, le=30000)
    height: int = Field(gt=0, le=30000)
    css_width: int = Field(gt=0, le=30000)
    css_height: int = Field(gt=0, le=30000)
    device_scale: float = Field(gt=0, le=10, allow_inf_nan=False)
    tiles: int = Field(gt=0, le=80)


def decode(value):
    if value.width * value.height > 60000000:
        raise ValueError('整页图片超过6000万像素')
    data = base64.b64decode(value.png, validate=True)
    if not data or len(data) > 30 * 1024 * 1024:
        raise ValueError('整页图片为空或超过30MB')
    with Image.open(io.BytesIO(data)) as image:
        if image.format != 'PNG' or image.size != (value.width, value.height):
            raise ValueError('截图尺寸或格式与整页结果不符')
        if abs(value.css_width * value.device_scale - image.width) > 1 or abs(value.css_height * value.device_scale - image.height) > 1:
            raise ValueError('截图不是所声明的整页尺寸')
        image.load()
    return data


def attach(app, settings, catalog, authorize, other_busy):
    sessions = {}
    lock = threading.RLock()

    def task(s, status, message, **extra):
        catalog.save_task({'id': s['id'], 'task_id': s['id'], 'schema_version': 1,
            'name': '网页长截图 · ' + s['source'].title, 'mode': 'page-snapshot',
            'source': s['source'].url, 'status': status,
            'completed': status in ('completed', 'failed', 'stopped', 'interrupted'),
            'message': message, **extra})

    def expire():
        for identity, s in list(sessions.items()):
            if time.monotonic() > s['deadline']:
                task(s, 'interrupted', '截图连接超时，没有保存局部截图')
                del sessions[identity]

    def busy():
        with lock:
            expire()
            return bool(sessions)

    def stop():
        with lock:
            for s in sessions.values():
                task(s, 'stopped', '截图已停止，没有保存局部截图')
            sessions.clear()

    def session(identity):
        expire()
        if identity not in sessions:
            raise HTTPException(409, '截图已停止或过期，请重新开始')
        return sessions[identity]

    @app.post('/page-snapshots/start')
    def start(value: SnapshotStart, request: Request):
        authorize(request)
        with lock:
            expire()
            if sessions or other_busy():
                raise HTTPException(409, '请等待当前任务完成后再截图')
            cfg = settings()
            if not cfg.library_configured:
                raise HTTPException(409, '请先选择素材库')
            s = {'id': uuid4().hex, 'source': value, 'root': cfg.inbox,
                 'deadline': time.monotonic() + 120, 'layout': catalog.defaults().get('layout', 'organized')}
            task(s, 'running', '正在读取整页排版')
            sessions[s['id']] = s
            return {'id': s['id']}

    @app.post('/page-snapshots/{identity}/progress')
    def progress(identity: str, value: SnapshotProgress, request: Request):
        authorize(request)
        with lock:
            s = session(identity)
            s['deadline'] = time.monotonic() + 120
            task(s, 'running', value.message)
            return {'ok': True}

    @app.post('/page-snapshots/{identity}/cancel')
    def cancel(identity: str, value: SnapshotProgress, request: Request):
        authorize(request)
        with lock:
            s = session(identity)
            task(s, 'failed', value.message or '截图取消，未保存局部截图')
            del sessions[identity]
            return {'ok': True}

    @app.post('/page-snapshots/{identity}/finish')
    def finish(identity: str, value: SnapshotFinish, request: Request):
        authorize(request)
        with lock:
            s = session(identity)
            folder = None
            created = []
            try:
                data = decode(value)
                timestamp = datetime.now(timezone.utc).isoformat(timespec='seconds')
                # A snapshot is a new dated artifact; never overwrite an earlier capture.
                folder = snapshot_directory(s['root'], s['source'].title, s['source'].url, s['id'], s['layout'])
                created = missing_directories(folder)
                folder.mkdir(parents=True, exist_ok=False)
                image = folder / '整页.png'
                temporary = folder / '整页.png.part'
                temporary.write_bytes(data)
                os.replace(temporary, image)
                provenance = {'source_url': s['source'].url, 'title': s['source'].title,
                    'captured_at': timestamp, 'method': 'chrome-visible-tiles',
                    **value.model_dump(exclude={'png'}), 'sha256': hashlib.sha256(data).hexdigest(),
                    'limitations': ['记录网页当时可见排版；折叠内容、视频动画和内部独立滚动区域不自动展开。']}
                metadata = folder / '来源.json'
                metadata.write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding='utf-8')
                source = folder / '来源.md'
                source.write_text('# 网页整页长截图\n\n标题：' + s['source'].title + '\n\n原网址：' + s['source'].url + '\n\n截图时间（UTC）：' + timestamp + '\n\n尺寸：' + str(value.width) + ' × ' + str(value.height) + ' 像素\n\n![整页截图](整页.png)\n\n记录网页当时可见排版；折叠内容、视频动画和内部独立滚动区域不自动展开。\n', encoding='utf-8')
                files = [image.name, source.name, metadata.name]
                catalog.record(s['source'].url, '网页长截图 · ' + s['source'].title, '', 'images', folder, files,
                               {'images': True, 'category': 'images', 'full_page_screenshot': True})
                result = {'directory': str(folder), 'files': files, 'width': value.width, 'height': value.height,
                          'message': '整页截图和原网址已保存：' + str(folder)}
                task(s, 'completed', result['message'], directory=str(folder), records={'result': result})
                del sessions[identity]
                return result
            except (OSError, ValueError, sqlite3.Error) as exc:
                message = '整页截图保存未完成：' + str(exc) + (('；已写文件保留于 ' + str(folder)) if folder else '')
                clean_empty(created)
                try:
                    task(s, 'failed', message, directory=str(folder) if folder else None)
                except (OSError, ValueError, sqlite3.Error) as record_error:
                    message += '；任务记录也未能写入：' + str(record_error)
                finally:
                    del sessions[identity]
                raise HTTPException(500 if isinstance(exc, sqlite3.Error) else 400, message) from exc

    return busy, stop
