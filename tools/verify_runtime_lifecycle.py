"""Run only a built scratch payload on free ports; never target an installed service."""
import ctypes
import json
import os
import shutil
import socket
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def alive(pid):
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.restype = ctypes.c_void_p
    handle = kernel.OpenProcess(0x1000, False, pid)
    if not handle: return False
    try:
        code = ctypes.c_ulong()
        if not kernel.GetExitCodeProcess(ctypes.c_void_p(handle), ctypes.byref(code)):
            raise OSError('Cannot inspect isolated child exit')
        return code.value == 259
    finally: kernel.CloseHandle(ctypes.c_void_p(handle))


def main():
    payload = ROOT / 'build-windows/payload'
    if not (payload / 'InspirationCollector.exe').is_file(): raise SystemExit('Build scratch payload first')
    reports = []
    # Same volume is required for hardlinks; no runtime downloads or installed-state writes.
    with tempfile.TemporaryDirectory(prefix='lifecycle-', dir=ROOT / 'build-windows') as folder:
        temp = Path(folder); app = temp / 'program'; state = temp / 'state'
        app.mkdir(); state.mkdir()
        def link(source, target): os.link(source, target); return str(target)
        shutil.copytree(payload / 'runtime', app / 'runtime', copy_function=link)
        shutil.copytree(payload / 'server', app / 'server')
        (app / 'extension').mkdir()
        for name in ('manifest.json', 'reftray-a.ico', 'reftray-a-dark.ico'):
            shutil.copy2(payload / 'extension' / name, app / 'extension' / name)
        shutil.copy2(payload / 'InspirationCollector.exe', app / 'InspirationCollector.exe')
        shutil.copy2(app / 'server/desktop.py', app / 'server/desktop_real.py')
        (app / 'server/desktop.py').write_text("import os,sys,subprocess\nfrom pathlib import Path\nchild=subprocess.Popen([sys.executable,'-c','import time;time.sleep(120)'],creationflags=subprocess.CREATE_NO_WINDOW)\n(Path(os.environ['LIBLIB_ROOT'])/'child.pid').write_text(str(child.pid))\nfrom .desktop_real import main\nmain()\n", encoding='utf-8')
        port = free_port()
        result = subprocess.run([str(app / 'InspirationCollector.exe'), '--smoke', str(port), str(state)],
                                cwd=app, capture_output=True, timeout=45)
        child_pid = int((state / 'child.pid').read_text())
        report = {'mode': 'owned-child-tree', 'port': port, 'launcher_exit': result.returncode,
                  'child_pid': child_pid, 'child_alive': alive(child_pid)}
        if (state / 'smoke-result.json').exists(): report['result'] = json.loads((state / 'smoke-result.json').read_text())
        reports.append(report)
        if result.returncode or report['child_alive']: raise SystemExit('Owned child lifecycle failed')
        second_port=free_port()
        crash=subprocess.run([str(app/'InspirationCollector.exe'),'--exit-smoke',str(second_port),str(state)],cwd=app,capture_output=True,timeout=45)
        crash_child=int((state/'child.pid').read_text())
        crash_report={'mode':'backend-exit-tray-restart','port':second_port,'launcher_exit':crash.returncode,'last_child_alive':alive(crash_child)}
        if (state/'exit-smoke.json').exists():crash_report['result']=json.loads((state/'exit-smoke.json').read_text())
        reports.append(crash_report)
        (ROOT / 'build-windows/runtime-lifecycle-results.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
        print(json.dumps(reports, indent=2))
        if crash.returncode or crash_report['last_child_alive']: raise SystemExit('Isolated lifecycle failed; see report')


if __name__ == '__main__': main()
