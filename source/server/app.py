from __future__ import annotations

import threading
import os
import secrets
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
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

settings = load_settings()
if settings.library_configured:
    initialize_folders(settings.inbox)
storage = Storage(settings)
app = FastAPI(title="灵感采集", version="0.5.0")
app.add_middleware(CORSMiddleware, allow_origin_regex=r"^(chrome-extension|edge-extension)://.+$", allow_methods=["GET", "HEAD", "POST", "OPTIONS"], allow_headers=["Content-Type", "X-Collector-Token", "Range"], expose_headers=['Content-Length', 'Content-Range', 'Accept-Ranges'])
settings_token = secrets.token_urlsafe(32)
jobs: dict[str, dict[str, object]] = {}
active_urls: dict[str, str] = {}
lock = threading.Lock()
catalog = storage.catalog
videos = VideoDownloads(catalog)
import_previews = {}
folder_requests = {}
RELEASE = json.loads((Path(__file__).resolve().parents[1] / 'extension/manifest.json').read_text(encoding='utf-8'))['version']


@app.get('/diagnostics')
def recent_diagnostics(request: Request):
    authorize_settings(request)
    from .diagnostics import recent
    return {'items': recent()}


@app.get("/health")
def health() -> dict[str, object]:
    # Protocol stays compatible; release identifies the deployed capabilities.
    from .bilibili_media import available
    from .components import capabilities
    return {**health_protocol(), "download_protection": True, "disk_protection": False, "streaming_capture": True, "release": RELEASE, "md_only": True, "bilibili_mux": available(), "components": capabilities(), "library_configured": settings.library_configured, "native_folder_picker": True, "busy": bool(active_urls) or videos.busy()}


def health_protocol() -> dict[str, object]:
    return {"status": "ok", "version": "0.5.0", "capture_history": True, "space_preflight": True, "flexible_collection": True, "board_collection": True, "text_collection": True, "root": str(settings.root), "inbox": str(settings.inbox), "port": settings.port, "author_folders": True, "author_flat_images": True, "directory_settings": True, "video_frames": True, "video_download": True, "settings_token": settings_token}


def authorize_settings(request: Request) -> None:
    if not secrets.compare_digest(request.headers.get("X-Collector-Token", ""), settings_token):
        raise HTTPException(403, "扩展未通过后台校验。升级后请在 chrome://extensions 重新加载「灵感采集」，刷新作品网页并重新打开面板；若仍失败，请确认扩展与后台来自同一安装版本。")


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
    item = catalog.get(identity)
    if not Path(item['directory']).is_dir(): raise HTTPException(404, '原目录已移走或删除')
    os.startfile(item['directory'])
    return {'ok': True}


class TaskRecord(BaseModel):
    id: str = Field(max_length=100)
    data: dict


@app.post('/tasks')
def save_task(value: TaskRecord, request: Request):
    authorize_settings(request)
    if len(json.dumps(value.data)) > 4000000: raise HTTPException(400, '任务记录过大')
    catalog.task({**value.data, 'id':value.id})
    return {'ok': True}


@app.get('/tasks')
def task_history(request: Request):
    authorize_settings(request)
    return {'items': catalog.tasks()}


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
    global settings
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
        return health()


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

@app.post('/media/resolve')
def resolve_media(value: ResolveMedia, request: Request):
    authorize_settings(request)
    from .media_resolver import resolve
    try:return resolve(value.url, value.subtitle_language, value.captions, value.quality,value.output_format)
    except (ValueError, OSError) as exc:raise HTTPException(422, str(exc)) from exc


class ResolvedProbe(BaseModel):
    resolver_id: str = Field(max_length=100)


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
        current = active_urls.get(str(request.canonical_url))
        if current and jobs.get(current, {}).get("status") == "running":
            return {"job_id": current}
        job_id = uuid4().hex
        jobs[job_id] = {"status": "running", "percent": 1, "message": "开始采集"}
        active_urls[str(request.canonical_url)] = job_id

    def update(percent: int, message: str) -> None:
        with lock:
            jobs[job_id].update(percent=percent, message=message)

    def run() -> None:
        try:
            result = storage.collect(request, update)
            with lock:
                jobs[job_id].update(status="completed", percent=100, message="保存完成", result=result)
        except Exception as exc:
            with lock:
                jobs[job_id].update(status="failed", message=str(exc))
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
        return {key: value for key, value in jobs[job_id].items() if key != 'finished_at'}


@app.post("/classify/{folder:path}")
def classify(folder: str, request: ClassifyRequest, http_request: Request) -> dict[str, object]:
    authorize_settings(http_request)
    try:
        return storage.classify(folder, request)
    except FileNotFoundError as exc:
        raise HTTPException(404, "素材不存在") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
