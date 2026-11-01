"""Optional local trimming/audio extraction. Never modifies its source file."""
import math
import os
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from . import bilibili_media


@lru_cache(maxsize=4)
def _encoders(executable, modified):
    result = subprocess.run([executable, '-hide_banner', '-encoders'], capture_output=True,
                            timeout=15, check=True,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    return {parts[1] for line in result.stdout.decode('utf-8', 'replace').splitlines()
            if len(parts := line.split()) > 1 and len(parts[0]) == 6}


def conversion_component(required=()):
    executable = os.environ.get('COLLECTOR_GIF_FFMPEG') or shutil.which('ffmpeg')
    if not executable or not Path(executable).is_file():
        raise ValueError('此操作需要可选的完整 FFmpeg 转换组件；内置组件仅支持检查与合并')
    if required and not set(required).issubset(_encoders(str(executable), Path(executable).stat().st_mtime_ns)):
        raise ValueError('FFmpeg 缺少本次所需编码器：' + ', '.join(required))
    return executable


def transform(source, target, value, checkpoint):
    info = bilibili_media.inspect(source)
    duration = float(info.get('format', {}).get('duration', 0))
    length = duration - value.trim_start - value.trim_end
    if not math.isfinite(duration) or duration <= 0 or length <= .05:
        raise ValueError('跳过开头和结尾后没有有效区间，请减小剪裁时间')
    audio = value.output_format == 'audio'
    if audio and not any(s.get('codec_type') == 'audio' for s in info.get('streams', [])):
        raise ValueError('视频没有可提取的音轨')
    streams = info.get('streams', [])
    untrimmed = not (value.trim_start or value.trim_end)
    compatible = (not audio and untrimmed and 'mp4' in info.get('format', {}).get('format_name', '').split(',')
                  and any(t.get('codec_type') == 'video' for t in streams)
                  and all(t.get('codec_name') == {'video': 'h264', 'audio': 'aac'}.get(t.get('codec_type')) for t in streams))
    if compatible:
        # Preserve bytes and avoid requiring any encoder for an already compatible MP4.
        try:
            with Path(source).open('rb') as incoming, Path(target).open('xb') as outgoing:
                while chunk := incoming.read(128 * 1024):
                    checkpoint()
                    outgoing.write(chunk)
            checkpoint()
            return duration
        except BaseException:
            Path(target).unlink(missing_ok=True)
            raise
    copy_audio_only=audio and untrimmed and any(t.get('codec_type')=='audio' and t.get('codec_name')=='aac' for t in streams)
    required = []
    if audio:
        if not copy_audio_only: required.append('aac')
    else:
        if not untrimmed or not any(t.get('codec_type') == 'video' and t.get('codec_name') == 'h264' for t in streams):
            required.append('libx264')
        if not untrimmed or any(t.get('codec_type') == 'audio' and t.get('codec_name') != 'aac' for t in streams):
            required.append('aac')
    executable = conversion_component(required) if required else bilibili_media.executables()[0]
    command = [str(executable), '-nostdin', '-v', 'error', '-n', '-protocol_whitelist', 'file', '-i', str(source)]
    # Even -ss 0 can drop the initial keyframe during stream copy. No trim means no seeking.
    if value.trim_start or value.trim_end:
        command += ['-ss', str(value.trim_start), '-t', str(length)]
    if audio:
        command += ['-map', '0:a:0', '-vn', '-c:a', 'copy' if copy_audio_only else 'aac']
        if not copy_audio_only:command += ['-b:a','192k']
        command += ['-f','mp4']
    else:
        streams = info.get('streams', [])
        copy_video = not (value.trim_start or value.trim_end) and any(s.get('codec_type') == 'video' and s.get('codec_name') == 'h264' for s in streams)
        copy_audio = not (value.trim_start or value.trim_end) and all(s.get('codec_name') == 'aac' for s in streams if s.get('codec_type') == 'audio')
        command += ['-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy' if copy_video else 'libx264']
        if not copy_video:
            command += ['-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p']
        command += ['-c:a', 'copy' if copy_audio else 'aac', '-f', 'mp4']
    command += ['-movflags', '+faststart', str(target)]
    try:
        bilibili_media.run_local(command, checkpoint, timeout=10800)
        result = bilibili_media.inspect(target)
        actual = float(result.get('format', {}).get('duration', 0))
        if abs(actual - length) > max(.3, length * .01):
            raise ValueError('剪裁结果时长不完整')
        types = [s.get('codec_type') for s in result.get('streams', [])]
        if audio and types != ['audio'] or not audio and 'video' not in types:
            raise ValueError('输出轨道不符合所选类型')
        if not audio and any(s.get('codec_name') != ('h264' if s.get('codec_type') == 'video' else 'aac') for s in result.get('streams', [])):
            raise ValueError('输出编码不符合 H.264/AAC')
        return duration
    except BaseException:
        target.unlink(missing_ok=True)
        raise


def trimmed_cues(cues, start, end):
    result = []
    for cue in cues:
        left, right = max(float(cue['start']), start), min(float(cue['end']), end)
        if right > left:
            result.append({**cue, 'start': left-start, 'end': right-start})
    return result
