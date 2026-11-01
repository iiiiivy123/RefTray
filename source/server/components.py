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
