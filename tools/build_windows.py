"""Build an offline current-user Windows installer from clean, allowlisted source inputs."""
import hashlib,json,re,shutil,subprocess,sys,zipfile
from pathlib import Path
from build_release import build,ROOT
PYTHON_SHA256='9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38'
MEDIA_SHA256='52416bfdf2fd346ce2f14e0ac922985d6df4701538e5ee9ddba6d52f6c8a2f4a'
def build_windows():
    version=json.loads((ROOT/'source/extension/manifest.json').read_text('utf-8'))['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:\.\d+)?',version):raise ValueError('invalid extension version')
    payload=ROOT/'build-windows/payload'
    if payload.exists():raise SystemExit('Payload already exists; use a new clean reviewed build directory, never merge stale contents.')
    media=ROOT/'build-tools/media-minimal'
    required=('ffmpeg.exe','ffprobe.exe','COPYING.LGPLv2.1','LICENSE.md','build-config.txt','ffmpeg-source-611cec792a.zip','MinGW-COPYRIGHT.txt','toolchain-packages.txt')
    if not all((media/name).is_file() for name in required):raise SystemExit('Missing reviewed minimal media build and corresponding source.')
    if hashlib.sha256((media/'ffmpeg-source-611cec792a.zip').read_bytes()).hexdigest()!=MEDIA_SHA256:raise SystemExit('Media source hash mismatch.')
    python_zip=ROOT/'build-tools/python-3.13.17-embed-amd64.zip'
    if hashlib.sha256(python_zip.read_bytes()).hexdigest()!=PYTHON_SHA256:raise SystemExit('Python embeddable runtime hash mismatch.')
    target_media=payload/'media-tools';target_media.mkdir(parents=True)
    for name in required:shutil.copy2(media/name,target_media/name)
    shutil.copy2(ROOT/'tools/build_media.sh',target_media/'build_media.sh');shutil.copy2(ROOT/'docs/third-party-media.md',target_media/'README.md')
    archive=build('user',ROOT/'dist')
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            if name.startswith(('extension/','server/','docs/','licenses/')):z.extract(name,payload)
    runtime=payload/'runtime'
    with zipfile.ZipFile(python_zip) as z:z.extractall(runtime)
    (runtime/'python313._pth').write_text('python313.zip\n.\n..\nLib/site-packages\nimport site\n',encoding='ascii')
    subprocess.run([sys.executable,'-m','pip','install','--no-compile','--disable-pip-version-check','--only-binary=:all:','--platform','win_amd64','--python-version','3.13','--implementation','cp','--target',str(runtime/'Lib/site-packages'),'-r',str(ROOT/'source/server/requirements.txt')],check=True)
    package=runtime/'Lib/site-packages';yt_license=next((package/'yt_dlp-2026.10.26.dist-info/licenses').glob('LICENSE'))
    shutil.copy2(yt_license,payload/'licenses/yt-dlp-LICENSE.txt')
    shutil.copy2(ROOT/'docs/usage.md',payload/'README.md');(payload/'README.txt').write_text((ROOT/'docs/usage.md').read_text('utf-8'),encoding='utf-8-sig')
    for name in ('install.md','update.md'):
        (payload/('首次安装.txt' if name=='install.md' else '更新说明.txt')).write_text((ROOT/'docs'/name).read_text('utf-8'),encoding='utf-8-sig')
    shutil.copy2(ROOT/'DISCLAIMER.md',payload/'DISCLAIMER.md')
    metadata=ROOT/'build-windows/AssemblyInfo.cs';metadata.write_text('[assembly:System.Reflection.AssemblyFileVersion("'+version+'")]\n',encoding='utf-8')
    subprocess.run([r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe','/nologo','/codepage:65001','/target:winexe','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/win32icon:'+str(payload/'extension/reftray-a.ico'),'/out:'+str(payload/'InspirationCollector.exe'),str(ROOT/'installer/Launcher.cs'),str(metadata)],check=True)
    files={p.relative_to(payload).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in payload.rglob('*') if p.is_file()}
    if any('live-test.' in p or '.sqlite' in p or 'collector-settings.json' in p or p.startswith('data/') for p in files):raise ValueError('Private/test state found in payload')
    (ROOT/'build-windows/payload-sha256.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
    subprocess.run([str(ROOT/'build-tools/inno/ISCC.exe'),'/DAppVersion='+version,str(ROOT/'installer/setup.iss')],check=True)
    print('Installer built; actual install, startup, upgrade and uninstall verification is still required.')
if __name__=='__main__':build_windows()
