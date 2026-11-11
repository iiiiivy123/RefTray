"""Verified program snapshots and offline recovery; never replaces the user's library."""
import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
import time
import sys

if __package__:
    from server.update_storage import atomic_json, safe_path, sha256
else:
    # The detached recovery tool must also work with a backup from before this
    # module existed. -I ignores the script directory, so add only this directory.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from update_storage import atomic_json, safe_path, sha256


def member(folder, name):
    path = safe_path(folder / name)
    if not path.is_relative_to(folder) or path == folder:
        raise ValueError('恢复清单包含无效路径')
    return path


def files_in(folder):
    files = {}
    for directory, names, filenames in os.walk(folder, followlinks=False):
        for name in names + filenames:
            safe_path(Path(directory) / name)
        for name in filenames:
            file = Path(directory) / name
            files[file.relative_to(folder).as_posix()] = file
    return files


def verify_files(folder, files):
    for name, digest in files.items():
        file = member(folder, name)
        if not re.fullmatch('[a-f0-9]{64}', digest) or not file.is_file() or sha256(file) != digest:
            raise ValueError('程序备份校验失败：' + name)


def snapshot_program(program, folder, number):
    program, folder = safe_path(program), safe_path(folder)
    if folder.is_relative_to(program) or program == program.parent:
        raise ValueError('程序备份须位于程序目录之外')
    managed = json.loads((program / 'managed-files.json').read_text('utf-8'))
    if managed.get('release') != number or not managed.get('files'):
        raise ValueError('旧程序清单或版本不一致，未开始安装')
    verify_files(program, managed['files'])
    files = files_in(program)
    size = sum(file.stat().st_size for file in files.values())
    if shutil.disk_usage(folder).free < size + 64 * 1024 * 1024:
        raise ValueError('没有足够空间备份旧程序，未开始安装')
    destination = folder / 'program'
    destination.mkdir()
    digests = {}
    for name, file in files.items():
        target = member(destination, name)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
        digests[name] = sha256(file)
        if sha256(target) != digests[name]:
            raise ValueError('程序备份写入不完整，未开始安装')
    tools = folder / 'tools';tools.mkdir()
    recovery_files = {}
    for name in ('update_recovery.py','update_storage.py'):
        source = Path(__file__).with_name(name)
        shutil.copy2(source, tools / name)
        recovery_files[name] = sha256(source)
    metadata = {'schema_version':1, 'program':str(program), 'release':number, 'recovery_files':recovery_files,
                'data_schema_version':managed.get('data_schema_version', 1), 'files':digests, 'bytes':size}
    atomic_json(folder / 'program-snapshot.json', metadata)
    return sha256(folder / 'program-snapshot.json')


def backup_state(state, program):
    state, program = safe_path(state), safe_path(program)
    if state.is_relative_to(program):
        raise ValueError('状态和素材目录须位于程序目录之外')
    base = safe_path(state / 'data/inspiration/updates')
    plan = json.loads((base / 'pending.json').read_text('utf-8'))
    if Path(plan['program']) != program or Path(plan['state']) != state:
        raise ValueError('更新目标与备份目录不匹配')
    number = plan['version']
    if not re.fullmatch(r'\d{1,5}\.\d{1,5}\.\d{1,5}', number):
        raise ValueError('更新版本无效')
    package = safe_path(base / number / f'InspirationCollector-{number}-Windows-x64-Setup.exe')
    if package.stat().st_size != plan['size'] or sha256(package) != plan['sha256']:
        raise ValueError('安装包校验失败，未替换程序')
    folder = safe_path(base / number / ('backup-' + str(time.time_ns())))
    folder.mkdir(parents=True)
    config = safe_path(state / 'data/inspiration/collector-settings.json')
    result = {'directory':str(folder), 'files':{}, 'database':None}
    if config.exists():
        saved = json.loads(config.read_text('utf-8'))
        material = Path(saved['save_directory']).resolve() if saved.get('save_directory') else state
        if material.is_relative_to(program):
            raise ValueError('素材位于程序目录内，请先将素材库移到独立目录')
        shutil.copy2(config, folder / config.name)
        result['files'][config.name] = sha256(config)
        if sha256(folder / config.name) != result['files'][config.name]:
            raise ValueError('设置备份校验失败')
    database = safe_path(state / 'data/inspiration/collector-index.sqlite3')
    if database.exists():
        with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as original, closing(sqlite3.connect(folder / database.name)) as saved:
            original.backup(saved)
            if saved.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('采集记录备份完整性检查失败')
        result['database'] = database.name
    result['program_snapshot_sha256'] = snapshot_program(program, folder, plan['current'])
    atomic_json(folder / 'backup.json', result)
    plan.update(backup=str(folder), program_snapshot_sha256=result['program_snapshot_sha256'])
    atomic_json(base / 'pending.json', plan)
    return result


def recovery_info(state, program):
    state, program = safe_path(state), safe_path(program)
    base = safe_path(state / 'data/inspiration/updates')
    plan = json.loads((base / 'pending.json').read_text('utf-8'))
    if safe_path(plan['program']) != program or safe_path(plan['state']) != state:
        raise ValueError('恢复目标与当前安装不一致')
    folder = safe_path(plan['backup'])
    if not folder.is_relative_to(base) or sha256(folder / 'program-snapshot.json') != plan['program_snapshot_sha256']:
        raise ValueError('恢复清单校验失败')
    snapshot = json.loads((folder / 'program-snapshot.json').read_text('utf-8'))
    if snapshot.get('schema_version') != 1 or safe_path(snapshot['program']) != program or snapshot['release'] != plan['current']:
        raise ValueError('程序备份身份不匹配')
    return folder, snapshot


def prepare_installer(state, program, package, number, launcher):
    """Bootstrap recovery for full installers and updaters predating snapshots."""
    state, program, package, launcher = map(safe_path, (state, program, package, launcher))
    if not re.fullmatch(r'\d{1,5}\.\d{1,5}\.\d{1,5}', number):
        raise ValueError('安装版本无效')
    current = json.loads((program / 'managed-files.json').read_text('utf-8'))['release']
    directory = safe_path(state / 'data/inspiration/updates' / number)
    if directory.is_relative_to(program):
        raise ValueError('恢复目录必须在程序目录之外')
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f'InspirationCollector-{number}-Windows-x64-Setup.exe'
    if target != package:
        shutil.copy2(package, target)
    helper = directory / 'RefTrayRestore.exe'
    if helper != launcher:
        shutil.copy2(launcher, helper)
    atomic_json(directory / 'restore-target.json', {'program':str(program), 'state':str(state)})
    atomic_json(directory.parent / 'pending.json', {
        'program':str(program), 'state':str(state), 'current':current, 'version':number,
        'size':package.stat().st_size, 'sha256':sha256(package), 'recovery_sha256':sha256(helper),
        'installer_pid':os.getppid()})
    return backup_state(state, program)


def restore_program(state, program, sync_extensions=True):
    state, program = safe_path(state), safe_path(program)
    folder, snapshot = recovery_info(state, program)
    original = safe_path(folder / 'program')
    verify_files(original, snapshot['files'])
    database = safe_path(state / 'data/inspiration/collector-index.sqlite3')
    if database.is_file():
        with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as db:
            if db.execute('PRAGMA user_version').fetchone()[0] not in (0, snapshot['data_schema_version']):
                raise ValueError('当前记录格式与旧程序不兼容；已保留现有数据和备份，请使用兼容版本恢复')
    if shutil.disk_usage(program.parent).free < snapshot['bytes'] + 64 * 1024 * 1024:
        raise ValueError('没有足够空间准备恢复程序，当前文件保留')
    staged = safe_path(tempfile.mkdtemp(prefix=program.name+'-restore-', dir=program.parent))
    failed = safe_path(program.parent / (program.name+'-before-restore-'+str(time.time_ns())))
    assert staged.parent == failed.parent == program.parent
    try:
        for name in snapshot['files']:
            target = member(staged, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(member(original, name), target)
        verify_files(staged, snapshot['files'])
        # Preserve hand-added files created since the update. Managed program files
        # are restored from the verified snapshot, never from a damaged installation.
        current_managed = {}
        if (program / 'managed-files.json').is_file():
            try: current_managed = json.loads((program / 'managed-files.json').read_text('utf-8')).get('files', {})
            except ValueError: pass
        previous_managed = json.loads((staged / 'managed-files.json').read_text('utf-8'))['files']
        if program.exists():
            for name, file in files_in(program).items():
                if name not in current_managed and name not in previous_managed and name != 'managed-files.json' and not re.fullmatch(r'unins\d+\.(exe|dat|msg)', name):
                    target = member(staged, name);target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(file, target)
            program.rename(failed)
        try:
            staged.rename(program)
        except OSError:
            if failed.exists() and not program.exists(): failed.rename(program)
            raise
        if sync_extensions:
            from server.extension_install import install
            install(program, failed / 'managed-files.json' if current_managed else None)
        result = {'release':snapshot['release'], 'preserved_program':str(failed), 'data_preserved':True}
        atomic_json(folder / 'restored.json', result)
        return result
    finally:
        # Only the exact temporary directory created above may be cleaned up.
        if staged.exists():
            assert safe_path(staged).parent == program.parent and staged.name.startswith(program.name+'-restore-')
            shutil.rmtree(staged)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--restore-state')
    mode.add_argument('--prepare-installer')
    parser.add_argument('--program', required=True)
    parser.add_argument('--package')
    parser.add_argument('--version')
    parser.add_argument('--launcher')
    args = parser.parse_args()
    if args.prepare_installer:
        prepare_installer(args.prepare_installer, args.program, args.package, args.version, args.launcher)
    else:
        restore_program(args.restore_state, args.program)
