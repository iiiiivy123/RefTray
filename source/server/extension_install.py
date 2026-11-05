"""Installer-owned extension paths. Never reads or edits browser profiles."""
import argparse
import json
import os
import shutil
import tempfile
from pathlib import Path


def checked_directory(path):
    path = Path(os.path.abspath(path))
    for item in (path, *path.parents):
        if item.is_symlink() or (hasattr(item, 'is_junction') and item.is_junction()):
            raise ValueError('扩展目录不能经过链接：' + str(item))
    return path


def is_reftray(path):
    try:
        manifest = json.loads((path / 'manifest.json').read_text('utf-8'))
        return (manifest.get('name') == '灵感采集' and manifest.get('manifest_version') == 3
                and manifest.get('background', {}).get('service_worker') == 'background.js'
                and (path / 'reftray-a.ico').is_file())
    except (OSError, ValueError):
        return False


def sync_extensions(source, destinations):
    source = checked_directory(source)
    if not is_reftray(source):
        raise ValueError('安装包扩展身份检查失败')
    files = [file for file in source.rglob('*') if file.is_file()]
    for file in files:
        checked_directory(file)
    targets = []
    for candidate in destinations:
        target = checked_directory(candidate)
        if target == source or target in targets:
            continue
        if not is_reftray(target):
            raise ValueError('记录的扩展目录不是灵感采集：' + str(target))
        for file in files:
            checked_directory(target / file.relative_to(source))
        targets.append(target)
    # Prepare every destination before replacing anything. Keep a local rollback
    # copy, publish manifest last, and restore all changed files on any failure.
    plans = []
    try:
        for target in targets:
            stage = Path(tempfile.mkdtemp(prefix='.reftray-update-', dir=target.parent))
            plans.append((target, stage))
            for file in files:
                relative = file.relative_to(source)
                new = stage / 'new' / relative
                new.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file, new)
                old = target / relative
                if old.exists():
                    saved = stage / 'old' / relative
                    saved.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(old, saved)
        changed = []
        try:
            for target, stage in plans:
                for file in sorted(files, key=lambda f: f.name == 'manifest.json'):
                    relative = file.relative_to(source)
                    destination = target / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    changed.append((destination, stage / 'old' / relative))
                    os.replace(stage / 'new' / relative, destination)
            for target in targets:
                if any((target / f.relative_to(source)).read_bytes() != f.read_bytes() for f in files):
                    raise ValueError('扩展更新后文件核验失败')
        except Exception:
            for destination, saved in reversed(changed):
                if saved.exists():
                    shutil.copy2(saved, destination)
                else:
                    destination.unlink(missing_ok=True)
            raise
    finally:
        for _, stage in plans:
            shutil.rmtree(stage)
    return [str(source), *map(str, targets)]


def install(program):
    import winreg
    program = checked_directory(program)
    current = program / 'extension'
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\RefTray') as key:
        def read(name, default=''):
            try:
                return winreg.QueryValueEx(key, name)[0]
            except FileNotFoundError:
                return default
        registered = json.loads(read('ExtensionDirectories', '[]'))
        preferred = read('ExtensionDirectory')
        previous = read('InstallDirectory')
        state = read('StateRoot')
        candidates = registered + ([preferred] if preferred else [])
        if previous:
            candidates.append(str(Path(previous) / 'extension'))
        # Recognized historic installations; no user-specific absolute paths.
        legacy = [Path(os.environ['LOCALAPPDATA']) / 'Programs/InspirationCollector/extension']
        if state:
            legacy.append(Path(state) / 'plugins/liblib-automation/scripts/collector/extension')
        candidates += [str(path) for path in legacy if is_reftray(path)]
        candidates = [path for path in candidates if Path(path).exists()]
        paths = sync_extensions(current, candidates)
        stable = preferred if preferred in paths else (paths[1] if len(paths) > 1 else paths[0])
        winreg.SetValueEx(key, 'ExtensionDirectories', 0, winreg.REG_SZ, json.dumps(paths))
        winreg.SetValueEx(key, 'ExtensionDirectory', 0, winreg.REG_SZ, stable)
        winreg.SetValueEx(key, 'InstallDirectory', 0, winreg.REG_SZ, str(program))
        return {'version': json.loads((current / 'manifest.json').read_text('utf-8'))['version'],
                'extension_directory': stable, 'updated_directories': paths}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--program', required=True)
    args = parser.parse_args()
    print(json.dumps(install(args.program), ensure_ascii=True))
