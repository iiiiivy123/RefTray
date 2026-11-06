import threading
import os
import secrets
import hashlib
import tempfile
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse

from .config import load_settings, save_directory, initialize_folders
from .models import ClassifyRequest, CollectRequest, DirectoryRequest, VideoDownloadRequest, VideoControlRequest, CaptureDefaults, HistoryLookup, VideoProbe
from .preflight import probe, space
from pydantic import BaseModel, Field
from pathlib import Path
import json
import time
from .legacy_import import scan
from .storage import Storage
from .video import VideoDownloads
from .folder_picker import choose_folder
from .retention import prune_finished

def create_app(runtime=None):
    settings = runtime.settings if runtime is not None else load_settings()
    if runtime is None and settings.library_configured:
        initialize_folders(settings.inbox)
    storage = runtime.storage if runtime is not None else Storage(settings)
    app = FastAPI(title="灵感采集", version="0.5.0")
    from .extension_origin import paired_origins
    origins = paired_origins()
    app.add_middleware(CORSMiddleware, allow_origins=sorted(origins), allow_methods=["GET", "HEAD", "POST", "OPTIONS"], allow_headers=["Content-Type", "X-Collector-Token", "Range"], expose_headers=['Content-Length', 'Content-Range', 'Accept-Ranges'])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', '[::1]'], www_redirect=False)
    settings_token = secrets.token_urlsafe(32)
    jobs: dict[str, dict[str, object]] = {}
    active_urls: dict[str, str] = {}
    idempotency = {}
    lock = threading.Lock()
    catalog = storage.catalog
    videos = runtime.videos if runtime is not None else VideoDownloads(catalog)
    import_previews = {}
    folder_requests = {}
    local_tools_busy = lambda: False
    local_tools_stop = lambda: None
    from .components import CapabilityCache
    capability_cache = CapabilityCache()
    RELEASE = json.loads((Path(__file__).resolve().parents[1] / 'extension/manifest.json').read_text(encoding='utf-8'))['version']


    @app.get('/diagnostics')
    def recent_diagnostics(request: Request):
        authorize_settings(request)
        from .diagnostics import recent
        return {'items': recent()}


    @app.get("/health")
    @app.post("/health")
    def health(request: Request) -> dict[str, object]:
        origin = request.headers.get('origin')
        browser = origin is not None or any(key.startswith('sec-fetch-') for key in request.headers)
        if browser and origin not in origins:
            raise HTTPException(403, '需要通过已登记的扩展目录连接；升级后请刷新扩展。')
        return health_data()

    def health_data() -> dict[str, object]:
        # Protocol stays compatible; release identifies the deployed capabilities.
        cached = capability_cache.snapshot()
        return {**health_protocol(), "download_protection": True, "disk_protection": False, "streaming_capture": True, "release": RELEASE, "md_only": True, "bilibili_mux": cached["values"].get("mp4_remux"), "components": cached["values"], "capabilities_state": cached["state"], "library_configured": settings.library_configured, "native_folder_picker": True, "busy": bool(active_urls) or videos.busy() or local_tools_busy() or any(item.get("state") == "pending" for item in folder_requests.values())}


    def health_protocol() -> dict[str, object]:
        return {"status": "ok", "version": "0.5.0", "capture_history": True, "space_preflight": True, "flexible_collection": True, "board_collection": True, "text_collection": True, "root": str(settings.root), "inbox": str(settings.inbox), "port": settings.port, "author_folders": True, "author_flat_images": True, "directory_settings": True, "video_frames": True, "video_download": True, "settings_token": settings_token}


    def authorize_settings(request: Request) -> None:
        if not secrets.compare_digest(request.headers.get("X-Collector-Token", ""), settings_token):
            raise HTTPException(403, "扩展未通过后台校验。升级后请在 chrome://extensions 重新加载「灵感采集」，刷新作品网页并重新打开面板；若仍失败，请确认扩展与后台来自同一安装版本。")


    @app.get('/settings/library/check')
    def check_library(request: Request):
        authorize_settings(request)
        # This checks the current selection without creating folders or saving defaults.
        with lock:
            directory = settings.inbox
            if not directory.is_dir():
                raise HTTPException(409, '素材库目录不存在或尚未选择，请重新选择文件夹')
            try:
                with os.scandir(directory) as entries:
                    next(entries, None)
                # The unique marker is closed and deleted before reporting success.
                with tempfile.NamedTemporaryFile(prefix='.reftray-write-check-', dir=directory) as marker:
                    payload = b'RefTray library access check'
                    marker.write(payload)
                    marker.flush()
                    os.fsync(marker.fileno())
                    marker.seek(0)
                    if marker.read() != payload:
                        raise OSError('临时检查文件读回不一致')
            except OSError as exc:
                raise HTTPException(400, f'素材库读写检查失败，请检查目录权限或重新选择文件夹：{exc}') from exc
        return {'directory': str(directory), 'writable': True}


    @app.get('/settings/defaults')
    def get_defaults(request: Request):
        authorize_settings(request)
        saved=catalog.defaults()
        return {**CaptureDefaults(**saved).model_dump(), '_configured':bool(saved)}


    @app.post('/settings/defaults')
    def set_defaults(value: CaptureDefaults, request: Request):
        authorize_settings(request)
        return catalog.defaults(value.model_dump())


    @app.get('/history')
    def history(request: Request, q: str = '', category: str = '', platform: str = '', page: int = 1, page_size: int = 40):
        authorize_settings(request)
        return catalog.search_page(q, category, platform, page, page_size)


    @app.post('/history/import/preview')
    def preview_import(value: DirectoryRequest, request: Request):
        authorize_settings(request)
        try: rows, errors, limited = scan(value.directory)
        except ValueError as exc: raise HTTPException(400,str(exc)) from exc
        import_previews.clear()
        token=secrets.token_urlsafe(24)
        import_previews[token]=(time.monotonic(),rows)
        return {'token':token,'count':len(rows),'errors':errors,'limited':limited}


    class ImportConfirmation(BaseModel):
        token: str


    @app.post('/history/import/confirm')
    def confirm_import(value: ImportConfirmation, request: Request):
        authorize_settings(request)
        item=import_previews.pop(value.token,None)
        if not item or time.monotonic()-item[0]>600:raise HTTPException(409,'预览已失效，请重新扫描')
        count=sum(bool(catalog.record(*row)) for row in item[1])
        return {'count':count}


    @app.post('/history/lookup')
    def lookup(value: HistoryLookup, request: Request):
        authorize_settings(request)
        return {'item': catalog.lookup(value.url, value.required)}


    @app.post('/history/{identity}/open')
    def open_history(identity: int, request: Request):
        authorize_settings(request)
        try:
            item = catalog.get(identity)
        except ValueError as error:
            raise HTTPException(404, '采集记录不存在') from error
        if not Path(item['directory']).is_dir(): raise HTTPException(404, '原目录已移走或删除')
        os.startfile(item['directory'])
        return {'ok': True}


    class TaskRecord(BaseModel):
        id: str = Field(min_length=1, max_length=100)
        data: dict
        expected_revision: int | None = Field(default=None, ge=0)


    @app.post('/tasks')
    def save_task(value: TaskRecord, request: Request):
        authorize_settings(request)
        if len(json.dumps(value.data)) > 4000000: raise HTTPException(400, '任务记录过大')
        if value.data.get('schema_version', 1) != 1 or value.data.get('task_id', value.id) != value.id:
            raise HTTPException(409, '任务格式版本或身份冲突')
        record = {**value.data, 'id': value.id, 'task_id': value.id, 'schema_version': 1}
        try:
            saved = catalog.save_task(record, expected_revision=value.expected_revision)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        return {'ok': True, 'revision': saved['revision'], 'item': saved}


    @app.get('/tasks')
    def task_history(request: Request, page: int | None = None, page_size: int = 20, view: str | None = None, ignored: str = '[]', active: str = ''):
        authorize_settings(request)
        if page is None:
            return {'items': catalog.tasks()}
        if page < 1 or not 1 <= page_size <= 100:
            raise HTTPException(422, '无效分页参数')
        if view not in (None, 'all', 'running', 'unfinished', 'failed', 'ignored'):
            raise HTTPException(422, '无效任务筛选')
        try:
            ignored_ids = json.loads(ignored)
            if not isinstance(ignored_ids, list) or len(ignored_ids) > 10000 or any(not isinstance(x, str) or len(x)>100 for x in ignored_ids): raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(422, '无效任务忽略列表')
        return catalog.task_page(page=page, page_size=page_size, view=view, ignored_ids=ignored_ids, active_id=active)


    @app.get('/tasks/{task_id}')
    def task_detail(task_id: str, request: Request):
        authorize_settings(request)
        item = catalog.get_task(task_id)
        if item is None:
            raise HTTPException(404, '任务记录不存在')
        return {'item': item}


    @app.post('/video/probe')
    def video_probe(value: VideoProbe, request: Request):
        authorize_settings(request)
        results=[]
        for url in dict.fromkeys(value.urls):
            try:
                cached=catalog.cached(url) if value.duplicate_policy!='refresh' else None
                results.append({'bytes':cached.stat().st_size,'reason':'已校验本地副本','local':True} if cached else {**probe(url),'local':False})
            except (ValueError,OSError) as exc: results.append({'bytes':None,'reason':str(exc)})
        return {'items':results,'known_bytes':sum(r['bytes'] or 0 for r in results),
                'unknown':sum(r['bytes'] is None for r in results),
                'free_bytes':space(value.destination or settings.inbox)}


    @app.post('/video/reuse')
    def video_reuse(value: VideoDownloadRequest, request: Request):
        authorize_settings(request)
        from .video_cache import key, complete_cached
        try:
            cached = catalog.cached(key(value)) if value.duplicate_policy != 'refresh' else None
            cached = complete_cached(cached, value)
            return {'local': bool(cached), 'bytes': cached.stat().st_size if cached else None}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc


    @app.post('/assets/known')
    def known_assets(value: VideoProbe, request: Request):
        authorize_settings(request)
        return {'known':[url for url in value.urls if catalog.cached(url)]}


    @app.post("/settings/directory")
    def change_directory(value: DirectoryRequest, request: Request):
        nonlocal settings
        authorize_settings(request)
        with lock:
            if active_urls or videos.busy():
                raise HTTPException(409, "请等待正在保存的图片完成，再修改目录")
            try:
                updated = save_directory(settings, value.directory)
            except (ValueError, OSError) as exc:
                raise HTTPException(400, f"目录未修改：{exc}") from exc
            settings = updated
            storage.settings = updated
            if value.layout is not None:
                catalog.defaults({**CaptureDefaults(**catalog.defaults()).model_dump(), "layout": value.layout})
            return health_data()


    class OpenDirectoryRequest(BaseModel):
        directory: str = ''


    @app.post("/settings/open")
    def open_directory(request: Request, value: OpenDirectoryRequest | None = None):
        authorize_settings(request)
        try:
            folder = Path(value.directory) if value and value.directory else settings.inbox
            if not folder.is_absolute(): raise HTTPException(400, '请使用完整的保存路径')
            if not folder.is_dir(): raise HTTPException(404, '本次目录尚未创建，请先完成采集。')
            os.startfile(str(folder.resolve()))
        except OSError as exc:
            raise HTTPException(400, str(exc)) from exc
        return {"ok": True}


    @app.post('/settings/choose-folder')
    def choose_directory(request: Request):
        authorize_settings(request)
        with lock:
            if any(v['state'] == 'pending' for v in folder_requests.values()):
                raise HTTPException(409, '已有文件夹选择窗口，请先完成或取消')
            folder_requests.clear()
            identity = str(uuid4())
            folder_requests[identity] = {'state': 'pending'}
        initial = str(settings.inbox)
        def pick():
            try:
                result = {'state': 'done', **choose_folder(initial)}
            except Exception as exc:
                result = {'state': 'failed', 'error': str(exc)}
            with lock:
                folder_requests[identity] = result
        threading.Thread(target=pick, daemon=True).start()
        return {'id': identity}


    @app.get('/settings/choose-folder/{identity}')
    def chosen_directory(identity: str, request: Request):
        authorize_settings(request)
        with lock:
            if identity not in folder_requests:
                raise HTTPException(404, '文件夹选择已失效，请重新选择')
            return dict(folder_requests[identity])


    @app.post('/video/start')
    def video_start(value: VideoDownloadRequest, request: Request):
        authorize_settings(request)
        with lock:
            if value.save_directory != str(settings.inbox):
                raise HTTPException(409, '保存目录已改变，请重新开始')
            try:
                return {'job_id': videos.start(settings.inbox, value)}
            except ValueError as exc:
                raise HTTPException(409, str(exc)) from exc


    @app.get('/video/status/{job_id}')
    def video_status(job_id: str, request: Request):
        authorize_settings(request)
        try:
            return videos.status(job_id)
        except KeyError:
            raise HTTPException(404, '下载任务已失效或服务已重启')

    class ResolveMedia(BaseModel):
        url: str = Field(max_length=4000)
        subtitle_language: str = Field(default='auto', pattern='^(auto|zh|en|ja|ko)$')
        captions: bool = True
        quality: str = Field(default='best', pattern='^(best|1080|720|480)$')
        output_format: str = Field(default='original',pattern='^(original|audio)$')

    @app.post('/media/resolve-post')
    def resolve_post_images(value: ResolveMedia, request: Request):
        authorize_settings(request)
        from .public_post import resolve_post
        from http.client import HTTPException as TransportError
        try:
            return resolve_post(value.url)
        except (OSError, ValueError, TransportError) as exc:
            raise HTTPException(422, str(exc))

    @app.post('/media/resolve')
    def resolve_media(value: ResolveMedia, request: Request):
        authorize_settings(request)
        from .media_resolver import resolve
        try:return resolve(value.url, value.subtitle_language, value.captions, value.quality,value.output_format)
        except (ValueError, OSError) as exc:raise HTTPException(422, str(exc)) from exc


    class ResolvedProbe(BaseModel):
        resolver_id: str = Field(min_length=1, max_length=100)


    @app.post('/media/probe')
    def resolved_probe(value: ResolvedProbe, request: Request):
        authorize_settings(request)
        from .segmented_media import estimate
        try:return estimate(value.resolver_id)
        except ValueError as exc:raise HTTPException(422, str(exc)) from exc


    @app.post('/video/control/{job_id}')
    def video_control(job_id: str, value: VideoControlRequest, request: Request):
        authorize_settings(request)
        try:
            videos.control(job_id, value.action)
        except KeyError:
            raise HTTPException(404, '下载任务已失效')
        return {'ok': True}


    @app.get('/video/media/{asset_id}')
    def video_media(asset_id: str):
        # Unpredictable capability IDs expose only videos downloaded by this process.
        asset = videos.assets.get(asset_id)
        if not asset or not asset['path'].is_file():
            raise HTTPException(404, '视频播放入口已失效；请使用本地视频选择器打开已保存文件')
        return FileResponse(asset['path'], media_type=asset['mime'], headers={'Cache-Control': 'no-store'})


    @app.post('/video/open/{asset_id}')
    def video_open(asset_id: str, request: Request):
        authorize_settings(request)
        asset = videos.assets.get(asset_id)
        if not asset:
            raise HTTPException(404, '服务已重启，请从保存位置打开文件夹')
        os.startfile(str(asset['path'].parent))
        return {'ok': True}


    @app.get('/video/info/{asset_id}')
    def video_info(asset_id: str, request: Request):
        authorize_settings(request)
        asset = videos.assets.get(asset_id)
        if not asset:
            raise HTTPException(404, '视频入口已失效，请手动选择已保存的视频')
        return {'page': asset['page']}


    @app.post("/collect/start")
    def collect_start(request: CollectRequest, http_request: Request) -> dict[str, str]:
        authorize_settings(http_request)
        with lock:
            prune_finished(jobs)
            if request.save_directory is not None and request.save_directory != str(settings.inbox):
                raise HTTPException(409, "保存目录已变更，请停止本批采集后重新开始，避免图片分散")
            payload = request.model_dump(mode='json', exclude={'idempotency_key'})
            fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            key = request.idempotency_key
            if key and key in idempotency:
                previous, current = idempotency[key]
                if previous != fingerprint:
                    raise HTTPException(409, '幂等标识已用于不同采集内容，请使用新标识')
                if current in jobs:
                    return {'job_id': current}
                idempotency.pop(key, None)
            # Legacy clients may coalesce only a byte-for-byte equivalent active request.
            current = active_urls.get(str(request.canonical_url))
            if not key and current and jobs.get(current, {}).get('fingerprint') == fingerprint and jobs[current]['status'] == 'running':
                return {'job_id': current}
            if current:
                raise HTTPException(409, '同一来源仍在保存或收尾，请等待后台确认后重试')
            job_id = uuid4().hex
            jobs[job_id] = {"status": "running", "percent": 1, "message": "开始采集",
                            'task_id': request.task_id, 'fingerprint': fingerprint, 'stop_mode': 'post_boundary'}
            if key:
                idempotency[key] = (fingerprint, job_id)
            active_urls[str(request.canonical_url)] = job_id

        def update(percent: int, message: str) -> None:
            with lock:
                jobs[job_id].update(percent=percent)
                if jobs[job_id]['status'] != 'stopping':
                    jobs[job_id]['message'] = message

        def run() -> None:
            try:
                result = storage.collect(request, update)
                with lock:
                    stopped = jobs[job_id]['status'] == 'stopping'
                    jobs[job_id].update(status='stopped' if stopped else 'completed', percent=100,
                                        message='本篇已保存，停止完成' if stopped else '保存完成', result=result,
                                        cancel_acknowledged=stopped)
            except Exception as exc:
                with lock:
                    jobs[job_id].update(status="failed", message=str(exc), cancel_acknowledged=jobs[job_id]["status"] == "stopping")
            finally:
                with lock:
                    jobs[job_id]['finished_at'] = time.monotonic()
                    if active_urls.get(str(request.canonical_url)) == job_id:
                        active_urls.pop(str(request.canonical_url), None)

        threading.Thread(target=run, daemon=True).start()
        return {"job_id": job_id}


    @app.get("/collect/status/{job_id}")
    def collect_status(job_id: str, http_request: Request) -> dict[str, object]:
        authorize_settings(http_request)
        with lock:
            prune_finished(jobs)
            if job_id not in jobs:
                raise HTTPException(404, "任务不存在或服务已重启")
            return {key: value for key, value in jobs[job_id].items() if key not in ('finished_at', 'fingerprint')}


    @app.post('/collect/control/{job_id}')
    def collect_control(job_id: str, value: VideoControlRequest, http_request: Request):
        authorize_settings(http_request)
        if value.action != 'stopped':
            raise HTTPException(422, '图片采集仅支持本篇结束后停止')
        with lock:
            job = jobs.get(job_id)
            if job is None:
                raise HTTPException(404, '任务不存在或服务已重启')
            if job['status'] == 'running':
                job.update(status='stopping', message='本篇结束后停止，正在收尾', cancel_acknowledged=False)
            return {'job_id': job_id, **{key: value for key, value in job.items() if key not in ('finished_at', 'fingerprint')}}


    @app.post("/classify/{folder:path}")
    def classify(folder: str, request: ClassifyRequest, http_request: Request) -> dict[str, object]:
        authorize_settings(http_request)
        try:
            return storage.classify(folder, request)
        except FileNotFoundError as exc:
            raise HTTPException(404, "素材不存在") from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    def request_stop_all():
        with lock:
            for job in jobs.values():
                if job['status'] == 'running':
                    job.update(status='stopping', message='本篇结束后停止，正在收尾', cancel_acknowledged=False)
        videos.request_stop_all()
        local_tools_stop()

    from types import SimpleNamespace
    app.state.runtime = SimpleNamespace(settings=settings, storage=storage, videos=videos, jobs=jobs, active_urls=active_urls,
                                        folder_requests=folder_requests, capability_cache=capability_cache, request_stop_all=request_stop_all)
    from .local_tools import attach
    local_tools_busy, local_tools_stop = attach(app, lambda: settings, authorize_settings)
    return app


# Importing the factory must not create user folders or open the real catalog.
# Uvicorn and the legacy tray obtain this lazy default only when they request app.
_default_application = None

def __getattr__(name):
    global _default_application
    if name not in ('app', 'settings', 'active_urls', 'videos', 'folder_requests'):
        raise AttributeError(name)
    if _default_application is None:
        _default_application = create_app()
    return _default_application if name == 'app' else getattr(_default_application.state.runtime, name)
