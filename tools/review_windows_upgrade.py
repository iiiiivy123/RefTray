"""Read-only review of a local RefTray installer against a separately trusted SHA-256."""
import argparse
import hashlib
import json
import re
import winreg
from pathlib import Path


def local_path(value):
    path = Path(value)
    if not re.match(r'^[A-Za-z]:[\\/]', value) or ':' in value[2:] or '..' in path.parts:
        raise ValueError('需要本地盘符绝对路径')
    if any((getattr(p.lstat(), 'st_file_attributes', 0) & 0x400) for p in (path, *path.parents)):
        raise ValueError('安装来源或目标路径经过链接')
    return path.resolve(strict=True)


def review(package, expected_hash, target, version):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or not re.fullmatch(r'[a-fA-F0-9]{64}', expected_hash):
        raise ValueError('版本或受信 SHA-256 格式错误')
    path, dest = local_path(package), local_path(target)
    if path.name != f'InspirationCollector-{version}-Windows-x64-Setup.exe' or not path.is_file():
        raise ValueError('安装包名称与指定版本不符')
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\RefTray') as key:
        registered = local_path(winreg.QueryValueEx(key, 'InstallDirectory')[0])
    uninstall = r'Software\Microsoft\Windows\CurrentVersion\Uninstall\{293CFEA9-3205-4D70-96E6-A5F7491438CC}_is1'
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, uninstall, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as key:
        location = local_path(winreg.QueryValueEx(key, 'InstallLocation')[0])
        installed = winreg.QueryValueEx(key, 'DisplayVersion')[0]
    if dest != registered or dest != location:
        raise ValueError('目标与现有安装登记不一致')
    if json.loads((dest/'extension/manifest.json').read_text('utf-8'))['version'] != installed:
        raise ValueError('安装登记版本与程序目录不一致')
    with path.open('rb') as handle:
        digest = hashlib.file_digest(handle, 'sha256').hexdigest()
    if digest != expected_hash.lower():
        raise ValueError('安装包 SHA-256 不符')
    return {'package':str(path),'sha256':digest,'installed':installed,'candidate':version,'target':str(dest),'action':'read_only'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('package','expected-hash','target','version'):
        parser.add_argument('--'+name, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(review(args.package,args.expected_hash,args.target,args.version),ensure_ascii=False))
    except (OSError,ValueError,KeyError) as exc:
        parser.exit(2,str(exc)+'\n')
