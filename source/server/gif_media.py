"""Convert a local media file to a verified animated GIF; never pass URLs to FFmpeg."""
import os
import shutil
from pathlib import Path
from PIL import Image
from . import bilibili_media


def convert(source, target, checkpoint, min_free_mb=256):
    executable = os.environ.get('COLLECTOR_GIF_FFMPEG') or shutil.which('ffmpeg')
    if not executable or not Path(executable).is_file():
        raise ValueError('缺少 GIF 转换组件，未把 MP4 当成 GIF 保存')
    duration = float(bilibili_media.inspect(source).get('format', {}).get('duration', 0))
    if not 0 < duration <= 120:
        raise ValueError('GIF 转换仅支持完整的 120 秒以内动图，未截断保存')
    # Disk reserve policy removed; OS write errors still propagate.
    try:
        bilibili_media.run_local([
            str(executable), '-nostdin', '-v', 'error', '-n', '-protocol_whitelist', 'file',
            '-i', str(source), '-an', '-filter_complex_threads', '1', '-filter_complex',
            "[0:v:0]fps=20,scale=w='min(640,iw)':h=-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse",
            '-loop', '0', '-fs', str(128 * 1048576), '-f', 'gif', str(target)
        ], checkpoint, timeout=120)
        checkpoint()
        with Image.open(target) as image:
            if image.format != 'GIF' or image.n_frames < 2:
                raise ValueError('转换结果不是多帧 GIF')
            elapsed = 0
            for frame in range(image.n_frames):
                image.seek(frame)
                elapsed += image.info.get('duration', 0)
            if abs(elapsed / 1000 - duration) > max(.2, duration * .03):
                raise ValueError('GIF 时长不完整，未保存截断动图')
        if target.stat().st_size >= 128 * 1048576:
            raise ValueError('GIF 超过 128MB，未保存截断动图')
    except BaseException:
        target.unlink(missing_ok=True)
        raise
