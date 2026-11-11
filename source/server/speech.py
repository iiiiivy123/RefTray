"""Offline speech engines. Bundled CPU worker by default; explicit legacy setup remains supported."""
import array
import json
import math
import os
import tempfile
import wave
from pathlib import Path

from .bilibili_media import run_local


def component():
    if os.environ.get('COLLECTOR_ASR_PYTHON') or os.environ.get('COLLECTOR_ASR_MODEL'):
        runtime=Path(os.environ.get('COLLECTOR_ASR_PYTHON',''))
        model=Path(os.environ.get('COLLECTOR_ASR_MODEL',''))
        return {'kind':'faster-whisper','runtime':runtime,'model':model,
                'ready':runtime.is_file() and (model/'model.bin').is_file()}
    folder=Path(__file__).resolve().parents[1]/'speech-tools'
    engine,model,decoder=folder/'whisper-cli.exe',folder/'ggml-base-q8_0.bin',folder/'audio/speech-audio.exe'
    return {'kind':'whisper.cpp','runtime':engine,'model':model,'decoder':decoder,
            'ready':all(path.is_file() for path in (engine,model,decoder))}


def has_audio(path, checkpoint):
    with wave.open(str(path),'rb') as source:
        if source.getnchannels()!=1 or source.getsampwidth()!=2 or source.getframerate()!=16000:
            raise ValueError('语音输入格式校验失败')
        while chunk:=source.readframes(16000):
            checkpoint()
            samples=array.array('h',chunk)
            if samples and sum(value*value for value in samples)/len(samples)>32*32:
                return True
    return False


def whisper_cues(rows):
    """Whisper can emit text at a chunk boundary with identical start/end times."""
    cues, pending = [], None
    for index, row in enumerate(rows):
        start, end = row['offsets']['from'] / 1000, row['offsets']['to'] / 1000
        text = row.get('text', '').strip()
        if not text:
            continue
        if not all(math.isfinite(v) for v in (start, end)) or not 0 <= start <= end:
            raise ValueError(f'本地识别第 {index + 1} 段时间无效')
        if start == end:
            if cues and abs(cues[-1]['end'] - start) < .001:
                if cues[-1]['text'] != text:
                    cues[-1]['text'] += ' ' + text
            elif pending is None:
                pending = (start, text)
            elif pending[0] == start:
                if pending[1] != text: pending = (start, pending[1] + ' ' + text)
            else:
                raise ValueError('本地识别缺少可对应的字幕时间段')
            continue
        if pending:
            if abs(pending[0] - start) >= .001:
                raise ValueError('本地识别缺少可对应的字幕时间段')
            if pending[1] != text: text = pending[1] + ' ' + text
            pending = None
        cues.append({'start': start, 'end': end, 'text': text})
    if pending:
        raise ValueError('本地模型没有生成有效的字幕时间段')
    return cues


def transcribe(source, checkpoint):
    info=component()
    if not info['ready']:
        raise ValueError('本地语音组件不完整，请重新安装完整版本；视频保留')
    with tempfile.TemporaryDirectory(prefix='collector-subtitles-') as temporary:
        folder=Path(temporary);output=folder/'result.json'
        if info['kind']=='faster-whisper':
            run_local([str(info['runtime']),'-X','utf8',str(Path(__file__).with_name('transcribe_local.py')),
                       str(source),str(info['model']),str(output)],checkpoint,timeout=10800)
            return json.loads(output.read_text('utf-8'))['segments']
        audio=folder/'speech.wav'
        run_local([str(info['decoder']),'-nostdin','-v','error','-n','-protocol_whitelist','file',
                   '-i',str(source),'-map','0:a:0','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','wav',str(audio)],
                  checkpoint,timeout=1800)
        if not has_audio(audio,checkpoint):return []
        run_local([str(info['runtime']),'-m',str(info['model']),'-f',str(audio),'-l','auto','-t','4',
                   '-ng','-sns','-oj','-of',str(output.with_suffix(''))],checkpoint,timeout=10800)
        if not output.is_file() or output.stat().st_size>32*1024*1024:
            raise ValueError('本地语音识别没有返回有效结果')
        data=json.loads(output.read_text('utf-8'))
        if not isinstance(data,dict) or not isinstance(data.get('transcription'),list):
            raise ValueError('本地语音识别结果格式无效')
        return whisper_cues(data['transcription'])
