"""Create subtitles from loaded captions or offline speech, without deleting user media."""
import hashlib
import json
import math
import os
import secrets
import tempfile
from pathlib import Path
from datetime import datetime
from .storage import safe
from .bilibili_media import run_local

def stamp(seconds):
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}'

def save(source, directory, cues, checkpoint, metadata=None):
    origin = getattr(metadata, 'subtitle_source', '') or '网页已加载字幕'
    if not cues:
        runtime = Path(os.environ.get('COLLECTOR_ASR_PYTHON', ''))
        model = Path(os.environ.get('COLLECTOR_ASR_MODEL', ''))
        if not runtime.is_file() or not model.is_dir() or not (model/'model.bin').is_file():
            raise ValueError('本地语音识别组件或模型尚未就绪；未生成字幕')
        origin = '本地语音识别生成，可能有错字，请校对'
        with tempfile.TemporaryDirectory(prefix='collector-subtitles-') as tmp:
            result = Path(tmp)/'result.json'
            run_local([str(runtime), '-X', 'utf8', str(Path(__file__).with_name('transcribe_local.py')), str(source), str(model), str(result)], checkpoint, timeout=10800)
            cues = json.loads(result.read_text(encoding='utf-8'))['segments']
    lines=[]
    for cue in cues[:100000]:
        start,end=float(cue['start']),float(cue['end'])
        text=str(cue['text']).strip()
        if not all(math.isfinite(v) for v in (start,end)) or not 0<=start<end or not text:
            raise ValueError('字幕时间或内容无效')
        lines.append(f'{len(lines)+1}\n{stamp(start)} --> {stamp(end)}\n{text}\n')
    if not lines: raise ValueError((getattr(metadata, 'subtitle_warning', '') + '；' if getattr(metadata, 'subtitle_warning', '') else '') + '本地模型没有识别到可用语音；歌曲或混唱可能无法识别，未生成空字幕')
    text='\n'.join(lines)
    digest=hashlib.sha256(text.encode()).hexdigest()[:16]
    title = safe(getattr(metadata, 'page_title', None) or '文字稿')[:100]
    destination=directory/f'{Path(source).stem if metadata is not None else title}.srt'
    paragraphs = []
    for index, cue in enumerate(cues):
        if index % 8 == 0:
            paragraphs.append(f"\n[{stamp(float(cue['start'])).split(',')[0]}]\n")
        paragraphs.append(str(cue['text']).strip())
    markdown = '\n'.join([
        '# ' + (getattr(metadata, 'page_title', None) or '文字稿'), '',
        '作者：' + (getattr(metadata, 'author_name', None) or '未记录'),
        '来源：' + (getattr(metadata, 'canonical_url', None) or '未记录'),
        '提取时间：' + datetime.now().astimezone().isoformat(timespec='seconds'),
        '字幕来源：' + origin, '', '正文按原字幕分段保留，未经总结。', '',
        '\n\n'.join(paragraphs), ''
    ])
    checkpoint()
    if getattr(metadata, 'subtitle_mode', '') == 'only':
        # Text-only is an independent output contract; never publish or remove an SRT.
        document = destination.with_suffix('.md')
        if document.exists():
            document = directory / f'{title}_{digest}_{secrets.token_hex(4)}.md'
        with document.open('x', encoding='utf-8') as handle:
            handle.write(markdown)
        return document, origin
    if destination.exists() and destination.read_text(encoding='utf-8') == text and destination.with_suffix('.md').is_file() and ('来源：' + (getattr(metadata, 'canonical_url', None) or '未记录')) in destination.with_suffix('.md').read_text(encoding='utf-8'):
        return destination, origin
    if destination.exists() or destination.with_suffix('.md').exists():
        destination=directory/f'{title}_{digest}_{secrets.token_hex(4)}.srt'
    # Publish a complete file without overwriting an existing subtitle.
    with tempfile.NamedTemporaryFile(dir=directory, suffix='.part', delete=False) as handle:
        temporary=Path(handle.name)
        handle.write(text.encode('utf-8'))
    try:
        checkpoint()
        while True:
            try:
                os.link(temporary, destination)
                break
            except FileExistsError:
                destination=directory/f'subtitles_{digest}_{secrets.token_hex(4)}.srt'
    finally:
        temporary.unlink(missing_ok=True)
    # Exclusive creation preserves user-edited documents and old subtitles.
    with tempfile.NamedTemporaryFile(dir=directory, suffix='.part', delete=False) as handle:
        temporary=Path(handle.name)
        handle.write(markdown.encode('utf-8'))
    try:
        checkpoint()
        os.link(temporary, destination.with_suffix('.md'))
    finally:
        temporary.unlink(missing_ok=True)
    return destination, origin
