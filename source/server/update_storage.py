"""Small filesystem primitives shared by update download and offline recovery."""
import hashlib
import json
import os
from pathlib import Path
import time


def safe_path(path):
    path = Path(os.path.abspath(path))
    if str(path).startswith('\\\\'):
        raise ValueError('更新路径必须是本机目录')
    for part in (path, *path.parents):
        if part.is_symlink() or (hasattr(part, 'is_junction') and part.is_junction()):
            raise ValueError('更新目录不能经过链接')
    return path


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=True), encoding='utf-8')
    for attempt in range(20):
        try:
            os.replace(temporary, path)
            return
        except PermissionError:
            if attempt == 19:
                raise
            time.sleep(.05)
