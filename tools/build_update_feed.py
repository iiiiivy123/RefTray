"""Build the public release attachment without credentials or a GitHub API dependency."""
import argparse
import hashlib
import json
import re
from pathlib import Path

REPOSITORY = 'iiiiivy123/RefTray'
FILENAME = 'RefTray-update.json'


def build(package, checksums, notes, output):
    package, checksums, notes, output = map(Path, (package, checksums, notes, output))
    match = re.fullmatch(r'InspirationCollector-(\d+\.\d+\.\d+)-Windows-x64-Setup.exe', package.name)
    if not match:
        raise ValueError('Invalid official installer filename')
    version = match[1]
    if checksums.name != f'SHA256SUMS-{version}.txt':
        raise ValueError('Checksum version does not match installer')
    digest = hashlib.sha256(package.read_bytes()).hexdigest()
    entries = [m for line in checksums.read_text('utf-8-sig').splitlines()
               if (m := re.fullmatch(r'([a-fA-F0-9]{64})\s+\*?(.+)', line.strip())) and m[2] == package.name]
    if len(entries) != 1 or entries[0][1].lower() != digest:
        raise ValueError('Installer does not match unique checksum entry')
    assets = [{'name': path.name, 'state': 'uploaded', 'size': path.stat().st_size,
               'digest': 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest(),
               'browser_download_url': f'https://github.com/{REPOSITORY}/releases/download/v{version}/{path.name}'}
              for path in (package, checksums)]
    data = {'schema_version': 1, 'tag_name': 'v' + version, 'draft': False, 'prerelease': False,
            'body': notes.read_text('utf-8-sig')[:1200], 'assets': assets}
    output.mkdir(parents=True, exist_ok=True)
    target = output / FILENAME
    content = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
    if target.exists() and target.read_bytes() != content:
        raise ValueError('Refusing to overwrite a different release feed')
    target.write_bytes(content)
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('package', 'checksums', 'notes', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    print(build(args.package, args.checksums, args.notes, args.output))
