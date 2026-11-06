"""Fetch official build tools and copy the reviewed LGPL media build; never copy user data."""
import argparse,hashlib,json,shutil,subprocess,urllib.request,zipfile,sys
from pathlib import Path
from build_windows import pip_environment, PYTHON_SHA256
ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'build-tools'
INPUTS={
 'python-3.13.17-embed-amd64.zip':'https://www.python.org/ftp/python/3.13.17/python-3.13.17-embed-amd64.zip',
 'innosetup-7.1.1-x64.exe':'https://github.com/jrsoftware/issrc/releases/download/is-7_1_1/innosetup-7.1.1-x64.exe',
}
EXPECTED={
 'python-3.13.17-embed-amd64.zip':PYTHON_SHA256,
 # Official immutable release asset digest:
 # https://github.com/jrsoftware/issrc/releases/expanded_assets/is-7_1_1
 'innosetup-7.1.1-x64.exe':'8a5a6711c3766a6e5fb74f280ba0e3551e719ce94538d901fdbd1f8f9920b3f0',
}
MEDIA_FILES=('ffmpeg.exe','ffprobe.exe','COPYING.LGPLv2.1','LICENSE.md','build-config.txt','ffmpeg-source-611cec792a.zip','MinGW-COPYRIGHT.txt','toolchain-packages.txt')
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--media-source',type=Path);parser.add_argument('--wheels-only',action='store_true');args=parser.parse_args()
 if sys.version_info<(3,11):parser.error('Build host requires Python >=3.11; packaged runtime remains 3.13')
 if not args.wheels_only:
  if args.media_source is None:parser.error('--media-source is required unless --wheels-only')
  missing=[name for name in MEDIA_FILES if not (args.media_source/name).is_file()]
  if missing:parser.error('Missing reviewed media inputs: '+', '.join(missing))
 TARGET.mkdir(exist_ok=True);report=[]
 wheels=TARGET/'wheelhouse';wheels.mkdir(exist_ok=True)
 subprocess.run([sys.executable,'-m','pip','download','--disable-pip-version-check','--require-hashes','--only-binary=:all:','--platform','win_amd64','--python-version','3.13','--implementation','cp','--abi','cp313','--dest',str(wheels),'-r',str(ROOT/'source/server/requirements-windows-lock.txt')],env=pip_environment(),check=True)
 if args.wheels_only:return
 if args.media_source is None:parser.error('--media-source is required unless --wheels-only')
 for name,url in INPUTS.items():
  target=TARGET/name
  if not target.exists():
   temp=target.with_suffix(target.suffix+'.download')
   with urllib.request.urlopen(url,timeout=60) as source,temp.open('wb') as output:shutil.copyfileobj(source,output)
   temp.replace(target)
  if hashlib.sha256(target.read_bytes()).hexdigest()!=EXPECTED[name]:raise ValueError('Build input hash mismatch: '+name)
  report.append({'name':name,'url':url,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
 with zipfile.ZipFile(TARGET/'python-3.13.17-embed-amd64.zip') as z:
  if z.testzip() is not None:raise ValueError('Corrupted Python runtime archive')
 media=TARGET/'media-minimal';media.mkdir(exist_ok=True)
 source=args.media_source
 for name in MEDIA_FILES:shutil.copy2(source/name,media/name)
 (TARGET/'inputs.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
