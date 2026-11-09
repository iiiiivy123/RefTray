"""Sequential public-video downloads with a durable result for each child."""
import copy
import re
import threading
import time
from uuid import uuid4

from .media_resolver import resolve
from .source_identity import canonical
from .models import CaptureDefaults, VideoDownloadRequest


class VideoQueue:
    def __init__(self, videos, catalog, settings):
        self.videos, self.catalog, self.settings = videos, catalog, settings
        self.lock = threading.RLock()
        self.active = None
        self.stop_event = threading.Event()
        self.child = None

    def busy(self):
        with self.lock:
            return self.active is not None

    def start(self, url):
        source, platform = canonical(url)
        with self.lock:
            if self.active or self.videos.busy():
                raise ValueError('已有视频任务，请完成或停止后再开始')
            root = self.settings().inbox
            defaults = CaptureDefaults(**self.catalog.defaults()).model_dump()
            identity = uuid4().hex
            record = {'id': identity, 'source': source, 'platform': platform,
                      'name': 'MCP · 原帖全部视频', 'status': 'running', 'completed': False,
                      'mode': 'video-queue', 'records': {}, 'message': '正在读取原帖视频'}
            self.catalog.save_task(record)
            self.active = identity
            self.stop_event.clear()
            threading.Thread(target=self._run, args=(record, root, defaults), daemon=True).start()
            return {'job_id': identity, 'kind': 'task', 'status': 'running'}

    def stop(self, identity=None):
        with self.lock:
            if identity and identity != self.active:
                raise ValueError('该队列已经结束或已失效')
            self.stop_event.set()
            if self.child:
                self.videos.control(self.child, 'stopped')
        return {'status': 'stopping'}

    def _run(self, record, root, defaults):
        def checkpoint():
            if self.stop_event.is_set():
                raise ValueError('USER_STOPPED')
        try:
            media = resolve(record['source'], captions=False, checkpoint=checkpoint)['media']
            if not media:
                raise ValueError('原帖没有可下载的视频')
            record['media_count'] = len(media)
            for index, source in enumerate(media, 1):
                if self.stop_event.is_set():
                    break
                item = {'status': 'running', 'index': index, 'url': record['source']}
                record['records'][str(index)] = item
                record['message'] = f'正在下载第 {index}/{len(media)} 个视频'
                self.catalog.save_task(copy.deepcopy(record))
                try:
                    value = VideoDownloadRequest(**{**source, 'max_video_mb': defaults['max_video_mb'],
                        'duplicate_policy': defaults['duplicate_policy'], 'canonical_url': record['source'],
                        'platform': record['platform'], 'save_directory': str(root),
                        'capture_scope': 'single', 'capture_kind': 'video',
                        'directory_schema': 'function-platform-v2', 'subtitle_mode': 'none'})
                    with self.lock:
                        if self.stop_event.is_set():
                            item['status'] = 'stopped'
                            break
                        self.child = self.videos.start(root, value)
                        item['job_id'] = self.child
                    while True:
                        state = self.videos.status(item['job_id'])
                        if state['status'] in ('completed', 'failed', 'stopped'):
                            break
                        self.stop_event.wait(.25)
                        if self.stop_event.is_set():
                            self.videos.control(item['job_id'], 'stopped')
                            time.sleep(.1)
                    result = state.get('result', {})
                    item.update(status='saved' if state['status'] == 'completed' else state['status'],
                                reason=state.get('message', ''), result=result)
                    if result.get('partial'):
                        item['status'] = 'partial'
                except Exception as error:
                    item.update(status='failed', reason=re.sub(r'https?://[^\s"<>]+', '[链接]', str(error))[:500])
                finally:
                    with self.lock:
                        self.child = None
                    self.catalog.save_task(copy.deepcopy(record))
            statuses = [item['status'] for item in record['records'].values()]
            record['status'] = ('stopped' if self.stop_event.is_set() else
                                'completed' if all(s == 'saved' for s in statuses) else
                                'partial' if any(s in ('saved', 'partial') for s in statuses) else 'failed')
        except Exception as error:
            record.update(status='stopped' if self.stop_event.is_set() else 'failed', message=re.sub(r'https?://[^\s"<>]+', '[链接]', str(error))[:500])
        finally:
            record['completed'] = record.get('status') in ('completed', 'partial', 'failed')
            try:
                self.catalog.save_task(copy.deepcopy(record))
            finally:
                with self.lock:
                    self.active = None
                    self.child = None
