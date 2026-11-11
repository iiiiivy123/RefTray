"""Standalone installer maintenance. Only manifest-owned, unchanged files may be removed."""
import argparse
import base64
import csv
import hashlib
import json
import os
import shutil
import sqlite3
from contextlib import closing
import time
from pathlib import Path

PROGRAM_DIRS = {'server', 'extension', 'runtime', 'media-tools', 'speech-tools', 'docs', 'help', 'licenses'}
PROGRAM_FILES = {'InspirationCollector.exe', 'README.md', 'README.txt', 'DISCLAIMER.md',
                 '首次安装.txt', '更新说明.txt', '安装后说明.html', 'managed-files.json', 'build-inputs.json'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def overlaps(first, second):
    return first == second or first in second.parents or second in first.parents


def user_state():
    return Path(os.environ.get('LIBLIB_ROOT') or str(Path(os.environ['LOCALAPPDATA']) / 'InspirationCollector')).resolve()


def material_paths(state):
    config = state / 'data/inspiration/collector-settings.json'
    paths = [state / 'data/inspiration/inbox']
    if config.exists():
        value = json.loads(config.read_text(encoding='utf-8'))
        if value.get('save_directory'):
            configured = Path(value['save_directory'])
            if not configured.is_absolute(): raise ValueError('Material path must be absolute')
            paths.append(configured.resolve())
    return paths


def managed_path(root, name):
    if not isinstance(name, str) or not name or '\\' in name:
        raise ValueError('Invalid managed path')
    relative = Path(name)
    if relative.is_absolute() or ':' in name or '..' in relative.parts:
        raise ValueError('Managed path escapes program')
    if len(relative.parts) == 1 and name not in PROGRAM_FILES:
        raise ValueError('Unknown managed program file')
    if len(relative.parts) > 1 and relative.parts[0] not in PROGRAM_DIRS:
        raise ValueError('Unknown managed program directory')
    target = root / relative
    # Reparse links can redirect a legitimate manifest entry into user data.
    for part in [target, *target.parents]:
        if part == root.parent: break
        if part.is_symlink() or (hasattr(part, 'is_junction') and part.is_junction()):
            raise ValueError('Managed path contains a link')
    resolved = target.resolve()
    if root not in resolved.parents:
        raise ValueError('Managed path escapes program')
    return target


def cleanup_upgrade(program, incoming_manifest, state=None, plan_only=False, previous_manifest=None, export_manifest=None):
    root = Path(program).resolve()
    state = Path(state).resolve() if state is not None else user_state()
    protected = [state, *material_paths(state)]
    incoming = json.loads(Path(incoming_manifest).read_text(encoding='utf-8'))
    if incoming.get('schema_version') != 1: raise ValueError('Unknown incoming manifest schema')
    current_manifest = Path(previous_manifest) if previous_manifest is not None else root / 'managed-files.json'
    legacy = not current_manifest.exists()
    if legacy:
        # Older installers had no payload manifest. Wheel RECORD is the package owner's
        # own file list; hashes prevent removing changed files. Unknown legacy files stay.
        files = {}
        package = root / 'runtime/Lib/site-packages'
        for record in sorted(package.glob('*.dist-info/RECORD')):
            for name, encoded, _ in csv.reader(record.read_text(encoding='utf-8').splitlines()):
                if not encoded.startswith('sha256='): continue
                try:
                    target = (package / name).resolve()
                    relative = target.relative_to(root).as_posix()
                    managed_path(root, relative)
                except (ValueError, OSError): continue
                files[relative] = base64.urlsafe_b64decode(encoded[7:] + '===').hex()
            files[record.relative_to(root).as_posix()] = digest(record)
        current = {'schema_version': 1, 'files': files}
    else:
        current = json.loads(current_manifest.read_text(encoding='utf-8'))
    if current.get('schema_version') != 1: raise ValueError('Unknown installed manifest schema')
    if export_manifest is not None:
        Path(export_manifest).write_text(json.dumps(current, sort_keys=True), encoding='utf-8')
    removed, preserved = [], []
    # Validate the entire plan before making the first change.
    plan = []
    for name, expected in current['files'].items():
        target = managed_path(root, name)
        if any(overlaps(target.resolve(), path) for path in protected):
            preserved.append(name); continue
        if not target.is_file(): continue
        actual = digest(target)
        if actual != expected:
            preserved.append(name)
            if name in incoming['files'] and previous_manifest is None:
                backup = root / 'preserved-program-files' / (str(time.time_ns()) + '-' + target.name)
                plan.append(('backup', target, backup))
        elif name not in incoming['files']:
            plan.append(('delete', target, name))
    for action, target, destination in plan:
        if action == 'backup' and not plan_only:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, destination)
        elif not plan_only:
            target.unlink(); removed.append(destination)
    return {'removed': removed, 'preserved': preserved, 'legacy_manifest_missing': legacy}


def cleanup_state(state, preferences=False, history=False, cache=False):
    state = Path(state).resolve()
    libraries = material_paths(state)
    actions = []
    candidates = []
    if preferences: candidates.append(state / 'data/inspiration/collector-settings.json')
    if preferences or history: candidates.append(state / 'data/inspiration/collector-index.sqlite3')
    if cache: candidates.append(state / 'cache')
    for target in candidates:
        if any(overlaps(target.resolve(), path) for path in libraries):
            raise ValueError('Selected cleanup overlaps material library; refused')
        for part in [target, *target.parents]:
            if part == state.parent: break
            if part.is_symlink() or (hasattr(part, 'is_junction') and part.is_junction()):
                raise ValueError('Selected cleanup contains links; refused')
    cache_path = state / 'cache'
    if cache and cache_path.exists() and any(item.is_symlink() or (hasattr(item, 'is_junction') and item.is_junction()) for item in cache_path.rglob('*')):
        raise ValueError('Cache contains links; cleanup refused')
    database = state / 'data/inspiration/collector-index.sqlite3'
    # The catalog filename is kept explicit, never delete arbitrary sqlite files.
    if database.exists() and (preferences or history):
        if any(overlaps(database, path) for path in libraries):
            raise ValueError('Catalog overlaps material library; cleanup refused')
        with closing(sqlite3.connect(database)) as db, db:
            if preferences: db.execute('DELETE FROM preferences')
            if history:
                db.execute('DELETE FROM captures')
                db.execute('DELETE FROM tasks')
        actions.append('preferences' if preferences and not history else 'history')
    if preferences:
        config = state / 'data/inspiration/collector-settings.json'
        if any(overlaps(config, path) for path in libraries):
            raise ValueError('Settings overlap material library; cleanup refused')
        config.unlink(missing_ok=True)
        actions.append('directory_preferences')
    if cache:
        folder = state / 'cache'
        if folder.exists():
            if folder.is_symlink() or (hasattr(folder, 'is_junction') and folder.is_junction()):
                raise ValueError('Cache link cleanup refused')
            if any(overlaps(folder.resolve(), path) for path in libraries):
                raise ValueError('Cache overlaps material library; cleanup refused')
            # Validate links before deletion; never recurse into linked external folders.
            if any(item.is_symlink() or (hasattr(item, 'is_junction') and item.is_junction()) for item in folder.rglob('*')):
                raise ValueError('Cache contains links; cleanup refused')
            shutil.rmtree(folder)
            actions.append('cache')
    return {'cleared': actions, 'materials_preserved': [str(path) for path in libraries]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--upgrade-program', type=Path)
    parser.add_argument('--incoming-manifest', type=Path)
    parser.add_argument('--state', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--plan-only', action='store_true')
    parser.add_argument('--previous-manifest', type=Path)
    parser.add_argument('--export-manifest', type=Path)
    parser.add_argument('--preferences', action='store_true')
    parser.add_argument('--history', action='store_true')
    parser.add_argument('--cache', action='store_true')
    args = parser.parse_args()
    failed = False
    try:
        if args.upgrade_program:
            result = cleanup_upgrade(args.upgrade_program, args.incoming_manifest, args.state, args.plan_only, args.previous_manifest, args.export_manifest)
        else:
            result = cleanup_state(args.state or user_state(), args.preferences, args.history, args.cache)
    except Exception as exc:
        failed = True
        result = {'error': str(exc), 'error_type': type(exc).__name__, 'maintenance_failed': True}
    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.report.with_suffix('.tmp')
        temporary.write_text(json.dumps(result, ensure_ascii=True, indent=2), encoding='utf-8')
        temporary.replace(args.report)
    print(json.dumps(result, ensure_ascii=True))
    if failed: raise SystemExit(1)



if __name__ == '__main__': main()
