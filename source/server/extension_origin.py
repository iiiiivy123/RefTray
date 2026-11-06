"""Installed unpacked extension origins. Native tools remain in the local user's trust boundary."""
import hashlib
import json
import os
from pathlib import Path


def extension_id(directory):
    path = str(Path(directory).absolute())
    if os.name == 'nt':
        if path[1:2] == ':':
            path = path[0].upper() + path[1:]
        raw = path.encode('utf-16-le')
    else:
        raw = os.fsencode(path)
    digest = hashlib.sha256(raw).hexdigest()[:32]
    return digest.translate(str.maketrans('0123456789abcdef', 'abcdefghijklmnop'))


def paired_origins():
    directories = [Path(__file__).resolve().parents[1] / 'extension']
    if os.name == 'nt':
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\RefTray') as key:
                for name in ('ExtensionDirectory','ExtensionDirectories'):
                    try:
                        value, kind = winreg.QueryValueEx(key, name)
                        paths = json.loads(value) if name == 'ExtensionDirectories' else [value]
                    except (OSError, ValueError, TypeError):
                        continue
                    if kind == winreg.REG_SZ and isinstance(paths, list):
                        directories.extend(Path(path) for path in paths if isinstance(path, str)
                                           and Path(path).is_absolute() and (Path(path) / 'manifest.json').is_file())
        except OSError:
            pass
    return {scheme + extension_id(directory) for scheme in ('chrome-extension://', 'edge-extension://') for directory in directories}
