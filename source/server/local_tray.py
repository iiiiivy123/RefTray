"""User-session collector tray. Launched by Windows Task Scheduler, not an agent child job."""
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import socket
import threading
import time
from urllib.request import ProxyHandler, Request, build_opener

COLLECTOR=Path(__file__).resolve().parents[1]
TASK_NAME='LibLib Inspiration Collector Local'

def local_health():
    with build_opener(ProxyHandler({})).open(Request('http://127.0.0.1:8766/health'),timeout=3) as response:
        return json.loads(response.read())

def tray_image_path(dark=None):
    if dark is None:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,r'Software\Microsoft\Windows\CurrentVersion\Themes\Personalize') as key:
                dark=winreg.QueryValueEx(key,'SystemUsesLightTheme')[0]==0
        except (OSError,ImportError):dark=False
    return COLLECTOR/('extension/icon-dark-48.png' if dark else 'extension/icon-48.png')

def main():
    os.environ.setdefault('LIBLIB_ROOT',str(COLLECTOR.parents[3]))
    scratch=Path(os.getenv('LOCALAPPDATA',str(Path.home()/'AppData/Local')))/'hermes/cache/scratch'
    scratch.mkdir(parents=True,exist_ok=True)
    for key in ('TMP','TEMP','TMPDIR'):os.environ[key]=str(scratch)
    logdir=Path(os.environ['LIBLIB_ROOT'])/'data/inspiration/logs';logdir.mkdir(parents=True,exist_ok=True)
    handler=RotatingFileHandler(logdir/'local-service.log',maxBytes=2*1024*1024,backupCount=2,encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
    logging.basicConfig(level=logging.INFO,handlers=[handler],force=True)
    logger=logging.getLogger('collector-local')
    try:
        try:
            with socket.create_connection(('127.0.0.1',8766),timeout=1):pass
        except OSError:
            pass
        else:
            existing=local_health()
            if existing.get('status')=='ok' and Path(existing.get('root','')).resolve()==Path(os.environ['LIBLIB_ROOT']).resolve():
                logger.info('Existing collector already online; no duplicate started')
                return 0
            raise RuntimeError('Port 8766 is occupied by another service; not terminating it')
        import pystray
        from PIL import Image
        import uvicorn
        from .app import app,settings,active_urls,videos
        from .desktop import configure_shutdown
        stopping=threading.Event()
        server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=8766,access_log=False,log_config=None,log_level='warning'))
        def stop(_icon=None,_item=None):
            if active_urls or videos.busy():
                icon.notify('请先停止或完成采集，再退出后台。','灵感采集')
                return
            stopping.set();server.should_exit=True;icon.stop()
        def open_path(path):
            try:os.startfile(str(path))
            except OSError:logger.exception('Could not open requested folder')
        menu=pystray.Menu(
            pystray.MenuItem('灵感采集 · 本地后台运行中',lambda:None,enabled=False),
            pystray.MenuItem('打开素材库',lambda _i,_m:open_path(settings.inbox)),
            pystray.MenuItem('打开扩展文件夹',lambda _i,_m:open_path(COLLECTOR/'extension')),
            pystray.MenuItem('打开后台日志',lambda _i,_m:open_path(logdir)),
            pystray.MenuItem('退出灵感采集',stop),
        )
        icon=pystray.Icon('LibLibCollectorLocal',Image.open(tray_image_path()),'灵感采集 · 本地后台',menu)
        configure_shutdown(app,stop)
        def run_server():
            try:server.run()
            except BaseException:logger.exception('Local service exited unexpectedly')
            finally:icon.stop()
        thread=threading.Thread(target=run_server,name='collector-server',daemon=True);thread.start()
        ready=False
        for _ in range(60):
            if not thread.is_alive():break
            try:
                if local_health().get('status')=='ok':ready=True;break
            except Exception:time.sleep(.2)
        if not ready:raise RuntimeError('Local service failed readiness check')
        logger.info('READY pid=%s root=%s release=%s',os.getpid(),settings.root,local_health().get('release'))
        icon.run()
        if not stopping.is_set():raise RuntimeError('Service or tray stopped unexpectedly')
        thread.join(timeout=10)
        logger.info('Stopped by user')
        return 0
    except BaseException:
        logger.exception('Collector startup/runtime failed')
        return 1

if __name__=='__main__':raise SystemExit(main())
