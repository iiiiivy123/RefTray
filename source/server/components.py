"""Report installed capabilities without downloading dependencies or exposing paths."""
import os
import shutil
from pathlib import Path
from . import bilibili_media
from .media_output import conversion_component


def ytdlp_path():
    explicit = os.environ.get('COLLECTOR_YTDLP_PATH')
    if explicit:
        return Path(explicit)
    import importlib.util
    spec = importlib.util.find_spec('yt_dlp')
    if spec and spec.origin:
        return Path(spec.origin).resolve().parent.parent
    return Path(__file__).resolve().parents[1] / 'optional-media'


def capabilities():
    inspection = bilibili_media.available()
    try:
        conversion_component(('libx264', 'aac'))
        conversion = True
    except Exception:
        # Missing, unsupported or unresponsive optional tools must not break /health.
        conversion = False
    package = ytdlp_path()
    node = os.environ.get('COLLECTOR_NODE') or shutil.which('node')
    runtime = Path(os.environ.get('COLLECTOR_ASR_PYTHON', ''))
    model = Path(os.environ.get('COLLECTOR_ASR_MODEL', ''))
    return {'mp4_inspection_and_copy': inspection, 'mp4_remux': inspection,
            'transcode': conversion, 'media_resolver': (package/'yt_dlp/__main__.py').is_file(),
            'youtube_js_runtime': bool(node and Path(node).is_file()),
            'local_transcription': runtime.is_file() and (model/'model.bin').is_file(),
            'loaded_captions': True}


class CapabilityCache:
    """One background probe per TTL; failures are cached too. Never blocks health."""
    def __init__(self, probe=capabilities, ttl=60):
        import threading
        self.probe, self.ttl = probe, ttl
        self.lock = threading.Lock()
        self.value = None
        self.checked_at = 0
        self.running = False
        self.error = False

    def snapshot(self):
        import threading
        import time
        with self.lock:
            if not self.running and (not self.checked_at or time.monotonic() - self.checked_at >= self.ttl):
                self.running = True
                threading.Thread(target=self._refresh, daemon=True).start()
            return {'state': 'checking' if self.value is None and not self.error else ('unavailable' if self.error else 'ready'),
                    'values': dict(self.value or {}), 'refreshing': self.running}

    def _refresh(self):
        import time
        try:
            value, error = self.probe(), False
        except Exception:
            value, error = None, True
        with self.lock:
            self.value, self.error = value, error
            self.checked_at, self.running = time.monotonic(), False
