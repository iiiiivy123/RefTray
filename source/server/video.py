"""Download ordinary, public video files. No cookie export, playlist or DRM handling."""
import hashlib
import ipaddress
import json
import secrets
import socket
import threading
import time
import shutil
import tempfile
from . import bilibili_media
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.response import addinfourl
from .catalog import fingerprint

from .storage import safe
from .destinations import resolve_destination, text_assets, note_media_layout
from .catalog import Catalog
from .retention import prune_finished, STATUS_LIMIT, STATUS_TTL

MAX_BYTES = 1048576 * 1048576
HOSTS = ('xhscdn.com', 'xhscdn.net', 'xiaohongshu.com', 'pinimg.com', 'hbimg.com', 'huaban.com', 'video.twimg.com', 'cdninstagram.com', 'fbcdn.net', 'weibocdn.com', 'sinaimg.cn', 'bilivideo.com', 'bilivideo.cn', 'googlevideo.com')


def validate_url(value):
    parsed = urlsplit(value)
    host = (parsed.hostname or '').lower()
    if parsed.scheme not in ('http', 'https') or parsed.username or parsed.password or parsed.port not in (None, 80, 443):
        raise ValueError('仅支持普通 HTTP(S) 视频地址')
    if not any(host == suffix or host.endswith('.' + suffix) for suffix in HOSTS):
        raise ValueError('该视频域名暂未接入下载；目前支持已接入平台的视频 CDN')
    addresses = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('拒绝访问本机或内网视频地址')
    if parsed.path.lower().endswith(('.m3u8', '.mpd')):
        raise ValueError('这是分段流媒体，不是普通视频文件；本版不处理播放列表')
    return value


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def video_type(data):
    if len(data) >= 12 and data[4:8] == b'ftyp':
        if data[8:12] in (b'avif', b'avis', b'heic', b'heix', b'mif1', b'msf1'):
            raise ValueError('返回的是图片，不是视频')
        return '.mp4', 'video/mp4'
    if data.startswith(b'\x1a\x45\xdf\xa3'):
        return '.webm', 'video/webm'
    raise ValueError('返回内容不是 MP4/WebM 视频，可能是验证页面或分段流；未保存为视频')


def file_digest(path, checkpoint):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(128 * 1024):
            checkpoint()
            digest.update(chunk)
    return digest


class VideoDownloads:
    def __init__(self, catalog=None):
        self.catalog = catalog
        self.jobs = {}
        self.assets = {}
        self.lock = threading.Lock()

    def busy(self):
        with self.lock:
            return any(job['status'] in ('running', 'paused') for job in self.jobs.values())

    def start(self, root: Path, value):
        if value.trim_start or value.trim_end:
            from .media_output import conversion_component
            conversion_component(('aac',) if value.output_format == 'audio' else ('libx264', 'aac'))
        with self.lock:
            prune_finished(self.jobs)
            for key, asset in list(self.assets.items()):
                if time.monotonic() - asset.get('created_at', time.monotonic()) > STATUS_TTL:
                    self.assets.pop(key, None)
            if any(job['status'] in ('running', 'paused') for job in self.jobs.values()):
                raise ValueError('已有视频下载任务，请先停止或等待完成')
            job_id = secrets.token_urlsafe(24)
            self.jobs[job_id] = dict(status='running', bytes=0, total=0, percent=0, message='连接视频源…', control='running', lease=time.monotonic())
        threading.Thread(target=self._run, args=(job_id, root, value), daemon=True).start()
        return job_id

    def status(self, job_id):
        with self.lock:
            prune_finished(self.jobs)
            job = self.jobs[job_id]
            job['lease'] = time.monotonic()
            return {k: v for k, v in job.items() if k not in ('lease', 'control', 'finished_at')}

    def control(self, job_id, action):
        if action not in ('running', 'paused', 'stopped'):
            raise ValueError('无效控制命令')
        with self.lock:
            job = self.jobs[job_id]
            if job['status'] not in ('running', 'paused'):
                return
            previous = job['control']
            job['control'] = action
            job['lease'] = time.monotonic()
            job['status'] = 'paused' if action == 'paused' else 'running'
            if previous != action:
                job['message'] = {'paused': '下载已暂停', 'running': '正在恢复下载…', 'stopped': '正在停止下载…'}[action]

    def request_stop_all(self):
        """Queue cancellation; busy stays true until each worker acknowledges cleanup."""
        with self.lock:
            for job in self.jobs.values():
                if job['status'] in ('running', 'paused'):
                    job.update(control='stopped', status='running', lease=time.monotonic(), message='正在停止下载…')

    def _point(self, job_id):
        while True:
            with self.lock:
                job = self.jobs[job_id]
                if job['control'] == 'stopped' or time.monotonic() - job['lease'] > 45:
                    raise InterruptedError('下载已停止；未完成的临时视频已清理')
                paused = job['control'] == 'paused'
            if not paused:
                return
            time.sleep(.2)

    def _update(self, job_id, **values):
        with self.lock:
            if values.get('status') in ('completed', 'failed', 'stopped'):
                values['finished_at'] = time.monotonic()
            self.jobs[job_id].update(values)

    def _run(self, job_id, root, value):
        temporary = None
        workspace = None
        converted = None
        subtitle_error = None
        media_warning = None
        audio_present = None
        try:
            resolved = value.media_kind == 'resolved'
            if resolved and (not value.resolver_id or value.audio_url):
                raise ValueError('成熟下载器缺少有效预检记录')
            is_bili=any((urlsplit(value.url).hostname or '')==h or (urlsplit(value.url).hostname or '').endswith('.'+h) for h in ('bilivideo.com','bilivideo.cn'))
            youtube = value.media_kind == 'youtube-dash'
            if youtube:
                from .media_resolver import canonical
                if canonical(value.canonical_url)[1] != 'youtube' or not value.audio_url:
                    raise ValueError('YouTube分轨必须绑定具体视频和完整音轨')
            if (value.audio_url and not youtube or is_bili or value.media_kind.startswith('bilibili')):
                source=urlsplit(value.canonical_url)
                import re
                if source.hostname not in ('www.bilibili.com','bilibili.com') or not re.fullmatch(r'/video/BV[\da-zA-Z]{10}/?',source.path):
                    raise ValueError('B站视频必须绑定明确的原始稿件')
                if value.media_kind not in ('bilibili-dash','bilibili-file','bilibili-audio') or (value.media_kind=='bilibili-dash')!=bool(value.audio_url) or (value.media_kind=='bilibili-audio' and (value.output_format!='audio' or not is_bili)):
                    raise ValueError('B站视频轨道信息不完整')
                bilibili_media.executables()
            derived = value.output_format != 'original' or value.trim_start or value.trim_end
            asset_key = value.url + (f'#collector-{value.output_format}-{value.trim_start}-{value.trim_end}' if derived else '')
            from .video_cache import key as output_key, complete_cached
            reuse_key = output_key(value)
            cached = self.catalog.cached(reuse_key) if self.catalog and value.duplicate_policy != 'refresh' else None
            cached = complete_cached(cached, value)
            processed = bool(cached)
            if not cached and self.catalog and value.duplicate_policy != 'refresh' and not is_bili and not resolved:
                cached = self.catalog.cached(value.url)
                cached = complete_cached(cached, value)
            cached_gif = bool(cached and value.output_format == 'gif' and cached.suffix.lower() == '.gif')
            url = value.url if cached or resolved else validate_url(value.url)
            directory, _, page_id = resolve_destination(root, value)
            reading_directory = directory
            if value.collection_mode == 'text' and not note_media_layout(value): directory = text_assets(directory, value, page_id) / '视频'
            directory.mkdir(parents=True, exist_ok=True)
            if resolved and not processed:
                from .segmented_media import download
                workspace = tempfile.TemporaryDirectory(prefix='.media-', dir=directory)
                limit = min(MAX_BYTES, value.max_video_mb * 1048576)
                if value.approved_bytes is not None:
                    limit = min(limit, value.approved_bytes)
                cached = download(value.resolver_id, value.canonical_url, value.url, workspace.name,
                                  limit, value.min_free_mb * 1048576, lambda: self._point(job_id),
                                  lambda count: self._update(job_id, bytes=count, message=f'下载媒体分段 {count/1048576:.1f} MB'),
                                  lambda: self.jobs[job_id]['control'])
            if value.audio_url and not processed:
                workspace=tempfile.TemporaryDirectory(prefix='.bili-',dir=directory)
                tracks=[];downloaded=0;limit=min(MAX_BYTES,value.max_video_mb*1048576)
                for index,track_url in enumerate((value.url,value.audio_url)):
                    host=urlsplit(track_url).hostname or ''
                    domains=('googlevideo.com',) if youtube else ('bilivideo.com','bilivideo.cn')
                    if not any(host==h or host.endswith('.'+h) for h in domains):
                        raise ValueError('分轨来源与作品平台不一致')
                    validate_url(track_url)
                    target=Path(workspace.name)/f'track-{index}.mp4'
                    with build_opener(SafeRedirect()).open(Request(track_url,headers=bilibili_media.source_headers(track_url)),timeout=12) as response, target.open('xb') as output:
                        if response.status!=200:raise ValueError('视频轨道响应不完整')
                        expected=int(response.headers.get('Content-Length') or 0);received=0
                        track_started=time.monotonic();last_report=0
                        if expected+downloaded>limit or (value.approved_bytes is not None and expected+downloaded>value.approved_bytes):raise ValueError('两轨总大小超过限制或预检确认值')
                        while True:
                            self._point(job_id)
                            chunk=response.read(128*1024)
                            if not chunk:break
                            if received==0:video_type(chunk)
                            received+=len(chunk);downloaded+=len(chunk)
                            if downloaded>limit or (value.approved_bytes is not None and downloaded>value.approved_bytes):raise ValueError('音视频总大小超过确认上限')
                            output.write(chunk)
                            now=time.monotonic()
                            if now-last_report>=.5 or expected and received==expected:
                                last_report=now
                                label='视频' if index==0 else '音频'
                                size=f'{received/1048576:.1f}'+(f'/{expected/1048576:.1f}' if expected else '')
                                speed=received/1048576/max(now-track_started,.001)
                                values={'bytes':downloaded,'message':f'下载{label}轨道 {index+1}/2 · {size} MB · 平均 {speed:.2f} MB/s'}
                                if value.approved_bytes:values['percent']=min(95,downloaded/value.approved_bytes*95)
                                self._update(job_id,**values)
                        if not received or expected and received!=expected:raise ValueError('音视频轨道下载不完整')
                    tracks.append(target)
                cached=Path(workspace.name)/'merged.mp4'
                self._update(job_id,message='音视频已下载，正在合并并检查完整性…')
                bilibili_media.mux(*tracks,cached,lambda:self._point(job_id))
                if cached.stat().st_size>limit:raise ValueError('合并视频超过文件大小限制')
            temporary = directory / f'.video-{job_id}.part'
            opener = build_opener(SafeRedirect())
            self._point(job_id)
            response_context = addinfourl(cached.open('rb'), {'Content-Length':str(cached.stat().st_size)}, url, code=200) if cached else opener.open(Request(url, headers=bilibili_media.source_headers(url)), timeout=12)
            with response_context as response:
                if response.status != 200:
                    raise ValueError(f'视频源返回 HTTP {response.status}，未保存不完整视频')
                expected = int(response.headers.get('Content-Length') or 0)
                limit = min(MAX_BYTES, value.max_video_mb * 1048576)
                if expected > limit:
                    raise ValueError('视频超过单个文件大小限制，本次未下载')
                if not resolved and not cached_gif and not value.audio_url and value.approved_bytes is not None and expected > value.approved_bytes:
                    raise ValueError('视频大小比预检增加，请重新预检确认')
                # Disk reserve policy removed; OS write errors still propagate.
                digest = hashlib.sha256()
                received = 0
                suffix = mime = None
                with temporary.open('xb') as target:
                    while True:
                        self._point(job_id)
                        chunk = response.read(128 * 1024)
                        if not chunk:
                            break
                        if received == 0:
                            if value.output_format == 'gif' and chunk.startswith((b'GIF87a', b'GIF89a')):
                                suffix, mime = '.gif', 'image/gif'
                            else:
                                suffix, mime = video_type(chunk)
                        received += len(chunk)
                        if not resolved and not cached_gif and not value.audio_url and value.approved_bytes is not None and received > value.approved_bytes:
                            raise ValueError('视频大小比预检增加，请重新预检确认')
                        if received > limit:
                            raise ValueError('视频超过大小限制，停止下载')
                        # Disk reserve policy removed; OS write errors still propagate.
                        target.write(chunk)
                        digest.update(chunk)
                        self._update(job_id, bytes=received, total=expected,
                            percent=min(99, int(received / expected * 100)) if expected else 0,
                            message=f'下载视频 {received / 1048576:.1f} MB' + (f' / {expected / 1048576:.1f} MB' if expected else ''))
                self._point(job_id)
                if not received or (expected and received != expected):
                    raise ValueError('视频下载不完整，未标记为成功')
            if value.output_format == 'gif' and suffix != '.gif':
                from .gif_media import convert
                converted = directory / f'.gif-{job_id}.gif'
                self._update(job_id, message='正在转换为 GIF 动图…')
                convert(temporary, converted, lambda: self._point(job_id), value.min_free_mb)
                temporary.unlink()
                temporary = converted
                digest = file_digest(temporary, lambda: self._point(job_id))
                received = temporary.stat().st_size
                suffix, mime = '.gif', 'image/gif'
            if is_bili:
                tracks=bilibili_media.inspect(temporary).get('streams',[])
                if not any(t.get('codec_type')=='audio' for t in tracks):
                    raise ValueError('B站结果缺少有效音轨，未保存为音频或完整视频')
                if value.output_format!='audio' and not any(t.get('codec_type')=='video' for t in tracks):
                    raise ValueError('B站结果缺少视频，未当作完整视频保存')
            if processed and mime != 'image/gif':
                from .media_output import trimmed_cues
                duration = float(bilibili_media.inspect(temporary)['format']['duration'])
                value.subtitle_cues = trimmed_cues(value.subtitle_cues, value.trim_start, value.trim_start + duration)
                suffix, mime = ('.m4a', 'audio/mp4') if value.output_format == 'audio' else ('.mp4', 'video/mp4')
            if not processed and mime != 'image/gif':
                from .media_output import transform, trimmed_cues
                converted = directory / (f'.output-{job_id}' + ('.m4a' if value.output_format == 'audio' else '.mp4'))
                self._update(job_id, message='正在提取音频…' if value.output_format == 'audio' else '正在检查并统一为 MP4（H.264/AAC）…')
                duration = transform(temporary, converted, value, lambda: self._point(job_id))
                value.subtitle_cues = trimmed_cues(value.subtitle_cues, value.trim_start, duration-value.trim_end)
                temporary.unlink()
                temporary = converted
                suffix, mime = ('.m4a', 'audio/mp4') if value.output_format == 'audio' else ('.mp4', 'video/mp4')
                digest = file_digest(temporary, lambda: self._point(job_id))
                received = temporary.stat().st_size
                if received > limit:
                    raise ValueError('处理结果超过文件大小限制')
            if mime.startswith('video/') and (urlsplit(value.canonical_url).hostname or '').lower() in ('x.com','www.x.com','twitter.com','www.twitter.com'):
                audio_present=any(s.get('codec_type')=='audio' for s in bilibili_media.inspect(temporary).get('streams',[]))
                if not audio_present:
                    media_warning='文件已保存，但没有音轨；尚未确认原帖是否无声，不能认定完整成功。网页静音不会删除下载音轨。'
            filename = (safe(value.page_title or '视频')[:100] + '_' + digest.hexdigest()[:8] if suffix != '.gif' else 'animation_' + digest.hexdigest()[:16]) + suffix
            destination = directory / filename
            if destination.resolve().parent != directory.resolve():
                raise ValueError('视频目标路径无效')
            duplicate = destination.is_file() and fingerprint(destination) == digest.hexdigest()
            if destination.exists() and not duplicate:
                destination = directory / ('video_' + digest.hexdigest()[:16] + '_' + secrets.token_hex(4) + suffix)
                filename = destination.name
            if duplicate:
                temporary.unlink()
            else:
                temporary.replace(destination)
            subtitle_file = None
            if value.subtitle_mode != 'none' and mime.startswith('video/'):
                from .subtitles import save as save_subtitles
                self._update(job_id, message='视频已保存，正在提取字幕和 Markdown…')
                try:
                    subtitle_file, subtitle_origin = save_subtitles(destination, directory, value.subtitle_cues, lambda: self._point(job_id), value)
                except InterruptedError:
                    raise
                except Exception as exc:
                    if value.subtitle_mode == 'only':
                        raise ValueError(f'文字稿 MD 未生成：{exc}；未额外保留本次视频') from exc
                    subtitle_error = f'视频已保留，字幕/MD未完成：{exc}'
                finally:
                    if value.subtitle_mode == 'only' and not duplicate:
                        destination.unlink(missing_ok=True)
                if value.subtitle_mode == 'only' and not subtitle_file:
                    raise ValueError('文字稿 MD 未生成；未额外保留本次视频')
                if value.subtitle_mode == 'only' and subtitle_file:
                    # Delete only the new output, never a pre-existing duplicate.
                    if not duplicate:
                        destination.unlink(missing_ok=True)
                    md = subtitle_file.with_suffix('.md')
                    if self.catalog:
                        self.catalog.record(value.canonical_url,value.page_title,value.author_name,'text',reading_directory,[str(p.relative_to(reading_directory)) for p in (md,)],{'text':True,'category':'text'})
                    self._update(job_id,status='completed',percent=100,message='文字稿 MD 已保存',result={'path':str(md),'directory':str(reading_directory),'relative_file':str(md.relative_to(reading_directory)),'mime':'text/markdown','subtitle_source':subtitle_origin,'duplicate':False})
                    return
            record = {'source_url': value.canonical_url, 'page_title': value.page_title,
                      'file': filename, 'sha256': digest.hexdigest(), 'bytes': received}
            record.update(download_method=value.media_kind, audio_present=audio_present, resolver_warning=value.resolver_warning)
            if subtitle_file:
                record.update(subtitle_file=subtitle_file.name, subtitle_source=subtitle_origin)
            sidecar = destination.parent / '_来源记录' / destination.with_suffix('.json').name
            sidecar.parent.mkdir(parents=True, exist_ok=True)
            temp_meta = sidecar.with_suffix('.json.tmp')
            temp_meta.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
            temp_meta.replace(sidecar)
            if self.catalog:
                self.catalog.register_asset(asset_key, destination, digest.hexdigest())
                self.catalog.register_asset(reuse_key, destination, digest.hexdigest())
                self.catalog.record(value.canonical_url, value.page_title, value.author_name or value.board_name,
                                    value.collection_mode, reading_directory, [str(destination.relative_to(reading_directory))]+([str(p.relative_to(reading_directory)) for p in (subtitle_file,subtitle_file.with_suffix('.md'))] if subtitle_file else []), {'videos': mime.startswith('video/'), 'images': mime == 'image/gif', 'category': 'batch' if value.capture_scope == 'batch' or value.capture_scope is None and (value.author_url or value.board_url) else 'images' if mime == 'image/gif' else 'video'})
            asset_id = secrets.token_urlsafe(32)
            with self.lock:
                self.assets[asset_id] = dict(path=destination, mime=mime, page={k: getattr(value, k) for k in ('canonical_url','page_title','author_url','author_name','board_url','board_name','list_url','list_kind','list_name','list_owner','layout','destination','collection_mode','ocr_enabled','directory_schema','capture_scope','capture_kind')})
                self.assets[asset_id]['created_at'] = time.monotonic()
                while len(self.assets) > STATUS_LIMIT:
                    self.assets.pop(next(iter(self.assets)))
            warning='；'.join(w for w in (media_warning,subtitle_error) if w)
            self._update(job_id, status='completed', percent=100, message=warning or ('GIF 动图已保存' if mime == 'image/gif' else '音频已保存' if mime.startswith('audio/') else '视频、字幕和MD已保存' if subtitle_file else '视频已保存'), result={'asset_id': asset_id, 'mime': mime, 'path': str(destination), 'directory':str(reading_directory), 'relative_file':str(destination.relative_to(reading_directory)), 'duplicate': duplicate, 'page': self.assets[asset_id]['page'], 'partial':bool(warning), 'warning':warning, 'audio_present':audio_present, 'subtitle_file':str(subtitle_file) if subtitle_file else None, 'subtitle_source':subtitle_origin if subtitle_file else None})
        except InterruptedError as exc:
            self._update(job_id, status='stopped', message=str(exc))
        except HTTPError as exc:
            self._update(job_id, status='failed', message=f'视频源拒绝下载（HTTP {exc.code}）。未绕过站点限制，请确认该视频允许下载。')
        except Exception as exc:
            self._update(job_id, status='failed', message=f'下载失败：{exc}')
        finally:
            if converted is not None and converted.exists():
                converted.unlink(missing_ok=True)
            if temporary is not None and temporary.exists():
                temporary.unlink(missing_ok=True)
            if workspace is not None:
                workspace.cleanup()
