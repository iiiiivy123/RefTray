"""Explicit, official-release updates. The launcher owns installation, never this process."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import threading
import time
import urllib.request
import urllib.error
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from server.update_storage import atomic_json, safe_path, sha256
from server.update_recovery import backup_state, recovery_info

REPOSITORY = 'iiiiivy123/inspiration-collector'
LATEST = f'https://api.github.com/repos/{REPOSITORY}/releases/latest'
MAX_PACKAGE = 512 * 1024 * 1024
ACTIVE = {'downloading', 'ready', 'installing', 'restarting', 'rolling_back'}


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r'v?\d{1,5}\.\d{1,5}\.\d{1,5}', value):
        raise ValueError('正式版本号无效')
    return tuple(map(int, value.lstrip('v').split('.')))






def allowed_url(url):
    parts = urlsplit(url)
    if (parts.scheme != 'https' or parts.username or parts.password or parts.port not in (None, 443)
            or parts.hostname not in {'api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}):
        raise ValueError('更新下载地址不是官方发布地址')


class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        allowed_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def open_official(url):
    allowed_url(url)
    request = urllib.request.Request(url, headers={'User-Agent': 'RefTray-Updater', 'Accept': 'application/vnd.github+json'})
    try:
        return urllib.request.build_opener(OfficialRedirect()).open(request, timeout=30)
    except urllib.error.HTTPError as error:
        if error.code in (403, 429):
            raise ValueError('官方更新服务暂时限制请求，请稍后重试；当前版本未修改。') from error
        raise


def read_small(url, limit):
    with open_official(url) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('更新信息超过大小上限')
    return data


def release_info(data, current):
    if data.get('draft') or data.get('prerelease'):
        raise ValueError('仅支持正式发布版本')
    tag = data.get('tag_name')
    if version(tag) <= version(current):
        return {'available': False, 'current': current}
    number = tag.lstrip('v')
    name = f'InspirationCollector-{number}-Windows-x64-Setup.exe'
    checksum = f'SHA256SUMS-{number}.txt'
    assets = data.get('assets', [])
    def asset(filename):
        matches = [item for item in assets if item.get('name') == filename and item.get('state') == 'uploaded']
        if len(matches) != 1:
            raise ValueError('正式发布缺少安装包或校验文件')
        item = matches[0]
        expected = f'https://github.com/{REPOSITORY}/releases/download/{tag}/{filename}'
        if item.get('browser_download_url') != expected:
            raise ValueError('更新文件来源不匹配')
        return item
    package, sums = asset(name), asset(checksum)
    size = package.get('size')
    if type(size) is not int or not 0 < size <= MAX_PACKAGE:
        raise ValueError('安装包大小无效')
    digest = package.get('digest')
    if digest is not None and not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
        raise ValueError('安装包校验信息无效')
    return {'available': True, 'current': current, 'version': number, 'name': name,
            'size': size, 'url': package['browser_download_url'], 'checksum_url': sums['browser_download_url'],
            'digest': digest, 'notes': str(data.get('body') or data.get('name') or '')[:1200]}


def checksum_for(text, name):
    found = []
    for line in text.splitlines():
        match = re.fullmatch(r'([a-fA-F0-9]{64})\s+\*?(.+)', line.strip())
        if match and match[2] == name:
            found.append(match[1].lower())
    if len(found) != 1:
        raise ValueError('安装包没有唯一有效的 SHA256 校验值')
    return found[0]




def update_worker_alive(pid):
    if type(pid) is not int or pid <= 0:
        return False
    if os.name != 'nt':
        return False
    import ctypes
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.restype = ctypes.c_void_p
    handle = kernel.OpenProcess(0x100000, False, pid)  # SYNCHRONIZE only
    if not handle:
        return ctypes.get_last_error() == 5  # Access denied: do not assume exited.
    try:
        return kernel.WaitForSingleObject(ctypes.c_void_p(handle), 0) != 0
    finally:
        kernel.CloseHandle(ctypes.c_void_p(handle))




class Updates:
    def __init__(self, settings, current, busy, program=None):
        self.settings, self.current, self.busy = settings, current, busy
        self.program = Path(program or Path(__file__).resolve().parents[1])
        self.base = settings.root / 'data/inspiration/updates'
        self.lock = threading.Lock()
        self.worker = None

    def status(self):
        path = self.base / 'status.json'
        if not path.exists():
            return {'phase': 'idle', 'current': self.current, 'recovery':self.recovery()}
        result = json.loads(path.read_text('utf-8'))
        # A killed download has no owner after restarting the service.
        if result.get('phase') in ('downloading', 'ready') and not (self.worker and self.worker.is_alive()):
            result = {**result, 'phase': 'failed', 'message': '更新下载已中断，请重新检查更新。'}
        if result.get('phase') in ('installing', 'restarting', 'rolling_back'):
            owner = result.get('worker_pid')
            if (owner and not update_worker_alive(owner)) or (not owner and time.time() - result.get('time', 0) > 60):
                result = {**result, 'phase': 'failed', 'message': '更新程序已中断，请检查后台版本后重新更新；已保存的备份仍保留。'}
        return {**result, 'current': self.current, 'recovery': self.recovery()}

    def recovery(self):
        try:
            folder, snapshot = recovery_info(self.settings.root, self.program)
            plan = json.loads((self.base / 'pending.json').read_text('utf-8'))
            helper = safe_path(self.base / plan['version'] / 'RefTrayRestore.exe')
            return {'available': helper.is_file(), 'version': snapshot['release'],
                    'directory':str(helper.parent), 'backup':str(folder)}
        except (OSError, ValueError, KeyError):
            return {'available':False}

    def restore(self):
        with self.lock:
            if self.busy() or self.worker and self.worker.is_alive() or self.status().get('phase') in ACTIVE:
                raise ValueError('当前有任务或更新正在执行，请结束后再恢复')
            info = self.recovery()
            if not info['available']:
                raise ValueError('尚无经过校验的旧程序备份')
            self.write('rolling_back','正在启动独立恢复程序…',version=info['version'])
            try:
                self.handoff('restore-update')
            except Exception:
                status = self.status()
                if not status.get('worker_pid'):
                    self.write('failed','恢复交接未确认，请使用备份目录中的 RefTrayRestore.exe',version=info['version'])
                raise
            return {'phase':'rolling_back', 'version':info['version']}

    def write(self, phase, message, **values):
        atomic_json(self.base / 'status.json', {'phase': phase, 'message': message, 'time': time.time(), **values})

    def check(self):
        return release_info(json.loads(read_small(LATEST, 2 * 1024 * 1024)), self.current)

    def start(self, requested):
        version(requested)
        if self.busy():
            raise ValueError('正在采集或处理文件，请任务结束后再更新')
        if not os.environ.get('COLLECTOR_LAUNCHER_SECRET') or not (self.program / 'InspirationCollector.exe').is_file():
            raise ValueError('请使用安装版灵感采集启动后台后更新')
        safe_path(self.base); safe_path(self.program)
        with self.lock:
            if self.worker and self.worker.is_alive() or self.status().get('phase') in ('installing', 'restarting', 'rolling_back'):
                raise ValueError('更新正在进行，请勿重复开始')
            self.write('downloading', '正在核对正式版本…', version=requested)
            self.worker = threading.Thread(target=self.download, args=(requested,), daemon=True)
            self.worker.start()
        return {'phase': 'downloading', 'version': requested}

    def download(self, requested):
        partial = None
        handed_off = False
        try:
            info = self.check()
            if not info['available'] or version(info['version']) != version(requested):
                raise ValueError('正式版本已变化，请重新检查更新')
            number = info['version']
            expected = checksum_for(read_small(info['checksum_url'], 65536).decode('utf-8-sig'), info['name'])
            if info['digest'] and info['digest'] != 'sha256:' + expected:
                raise ValueError('官方安装包与校验文件不一致')
            folder = safe_path(self.base / number); folder.mkdir(parents=True, exist_ok=True)
            package = safe_path(folder / info['name']); partial = package.with_suffix('.part')
            safe_path(partial)
            received = 0; digest = hashlib.sha256(); started = time.monotonic(); last = 0
            with open_official(info['url']) as response, partial.open('wb') as output:
                while True:
                    chunk = response.read(256 * 1024)
                    if not chunk: break
                    received += len(chunk)
                    if received > info['size'] or time.monotonic() - started > 900:
                        raise ValueError('安装包大小不符或下载超时')
                    output.write(chunk); digest.update(chunk)
                    if time.monotonic() - last > .5:
                        self.write('downloading', '正在下载更新…', version=number, received=received, total=info['size'])
                        last = time.monotonic()
            if received != info['size'] or digest.hexdigest() != expected:
                raise ValueError('安装包校验失败，当前版本未修改')
            os.replace(partial, package)
            if self.busy():
                raise ValueError('下载完成，但当前有采集任务；请任务结束后重试更新')
            atomic_json(self.base / 'pending.json', {'version': number, 'current': self.current,
                        'sha256': expected, 'size': received, 'program': str(self.program), 'state': str(self.settings.root)})
            self.write('installing', '安装包已校验，正在准备更新…', version=number)
            handed_off = True
            self.handoff()
        except Exception as error:
            if partial is not None:
                partial.unlink(missing_ok=True)
            # The detached worker owns status as soon as it identifies itself.
            # A lost pipe reply must not overwrite its progress or final result.
            if handed_off:
                try:
                    status = json.loads((self.base / 'status.json').read_text('utf-8'))
                    if status.get('version') == requested and status.get('worker_pid'):
                        if status.get('phase') in ('completed', 'failed', 'rolled_back', 'recovery_failed') or update_worker_alive(status['worker_pid']):
                            return
                except (OSError, ValueError):
                    pass
            message = str(error) if isinstance(error, ValueError) else ('更新交接未确认，请查看更新状态或安装日志。' if handed_off else '更新下载失败，请检查网络后重试；当前版本未修改。')
            self.write('failed', message[:300], version=requested)

    def handoff(self, command='install-update'):
        import ctypes
        import msvcrt
        name = r'\\.\pipe\InspirationCollectorControl'
        deadline = time.monotonic() + 5
        # Health can become ready just before the launcher's pipe is created.
        # WaitNamedPipe returns immediately for a not-yet-existing pipe.
        while not ctypes.windll.kernel32.WaitNamedPipeW(name, 100):
            if time.monotonic() >= deadline:
                raise ValueError('未连接到新版启动器，请通过完整安装包更新一次')
            time.sleep(.05)
        with open(name, 'r+b', buffering=0) as pipe:
            pipe.write((command + ' ' + os.environ['COLLECTOR_LAUNCHER_SECRET'] + '\n').encode('utf-8'))
            reply = bytearray()
            deadline = time.monotonic() + 10
            while len(reply) < 1024:
                available = ctypes.c_ulong()
                if not ctypes.windll.kernel32.PeekNamedPipe(ctypes.c_void_p(msvcrt.get_osfhandle(pipe.fileno())), None, 0, None, ctypes.byref(available), None):
                    break
                if not available.value:
                    if time.monotonic() > deadline:
                        raise ValueError('启动器更新回执超时，请检查后台后重试')
                    time.sleep(.05)
                    continue
                part = pipe.read(1)
                if not part or part == b'\n': break
                reply.extend(part)
            if reply.decode('utf-8').strip() != 'accepted':
                raise ValueError('启动器未接受更新，请保留当前程序并重试')


def attach(app, settings, current, authorize, busy):
    updates = Updates(settings, current, busy)
    app.state.updates = updates

    @app.get('/updates/status')
    def status(request: Request):
        authorize(request)
        return updates.status()

    @app.get('/updates/check')
    def check(request: Request):
        authorize(request)
        try:
            info = updates.check()
            return {key: value for key, value in info.items() if key not in ('url', 'checksum_url', 'digest')}
        except Exception as error:
            raise HTTPException(502, str(error) if isinstance(error, ValueError) else '无法检查正式新版，请稍后重试') from error

    @app.post('/updates/install')
    async def install(request: Request):
        authorize(request)
        try:
            data = await request.json()
            if not isinstance(data, dict):
                raise ValueError('更新请求格式无效')
            return updates.start(data.get('version'))
        except ValueError as error:
            raise HTTPException(409, str(error)) from error

    @app.post('/updates/restore')
    def restore(request: Request):
        authorize(request)
        try:
            return updates.restore()
        except (ValueError, OSError) as error:
            raise HTTPException(409, str(error) if isinstance(error, ValueError) else '恢复入口暂未连接，请使用备份目录中的 RefTrayRestore.exe') from error


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup-state', required=True)
    parser.add_argument('--program', required=True)
    args = parser.parse_args()
    backup_state(Path(args.backup_state), Path(args.program))
