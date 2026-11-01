"""Isolated offline speech worker; model installation is a separate explicit step."""
import json
import sys
from pathlib import Path

if __name__ == '__main__':
    from faster_whisper import WhisperModel
    source, model_path, output = map(Path, sys.argv[1:4])
    if not source.is_file() or not model_path.is_dir():
        raise ValueError('Missing local media or speech model')
    model = WhisperModel(str(model_path), device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
    segments, info = model.transcribe(str(source), beam_size=5, vad_filter=True)
    rows = [{'start': s.start, 'end': s.end, 'text': s.text.strip()} for s in segments if s.text.strip()]
    output.write_text(json.dumps({'segments': rows, 'language': info.language}, ensure_ascii=False), encoding='utf-8')
