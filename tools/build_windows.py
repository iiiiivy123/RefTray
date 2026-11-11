"""Build an offline current-user Windows installer from clean, allowlisted source inputs."""
import csv,ctypes,hashlib,json,os,re,shutil,subprocess,sys,tempfile,zipfile
from pathlib import Path
from build_release import build,ROOT
import speech_bundle
import build_help
PYTHON_SHA256='9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38'
MEDIA_SHA256='52416bfdf2fd346ce2f14e0ac922985d6df4701538e5ee9ddba6d52f6c8a2f4a'
CSHARP_COMPILER=Path(r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe')

def preflight_compilers(root=None):
    root=Path(root or ROOT)
    inno=root/'build-tools/inno/ISCC.exe'
    for name,path in [('C# compiler',CSHARP_COMPILER),('Inno compiler',inno)]:
        if not path.is_file():raise ValueError('Build preflight: missing '+name+': '+str(path))
    subprocess.run([str(CSHARP_COMPILER),'/nologo','/help'],check=True,capture_output=True,timeout=15)
    subprocess.run([str(inno),'--version'],check=True,capture_output=True,timeout=15)

def pip_environment():
    # Never change the user's pip settings or inherit install-routing defaults.
    return {**{k:v for k,v in os.environ.items() if not k.upper().startswith('PIP_')},
            'PIP_CONFIG_FILE':os.devnull,'PIP_USER':'0','PIP_DISABLE_PIP_VERSION_CHECK':'1'}

def dependency_command(wheelhouse,lockfile,target):
    return [sys.executable,'-m','pip','install','--no-compile','--disable-pip-version-check',
            '--only-binary=:all:','--platform','win_amd64','--python-version','3.13',
            '--implementation','cp','--abi','cp313','--no-index','--find-links',str(wheelhouse),
            '--require-hashes','--target',str(target),'-r',str(lockfile)]

def preflight_dependencies(root=None):
    """Resolve the exact offline recipe before any payload/dist creation."""
    if sys.version_info < (3,11):
        raise ValueError('Build preflight: Python >=3.11 is required for the build host; packaged Python remains 3.13. No package files were created.')
    root=Path(root or ROOT)
    wheelhouse=root/'build-tools/wheelhouse';lockfile=root/'source/server/requirements-windows-lock.txt'
    if not lockfile.is_file() or not wheelhouse.is_dir():
        raise ValueError('Build preflight: missing locked requirements or offline wheelhouse')
    validate_requirements_lock(root/'source/server/requirements.txt',lockfile)
    with tempfile.TemporaryDirectory(prefix='reftray-build-preflight-') as temporary:
        report=Path(temporary)/'resolution.json'
        command=dependency_command(wheelhouse,lockfile,Path(temporary)/'probe')+['--dry-run','--ignore-installed','--report',str(report)]
        try:
            result=subprocess.run(command,env=pip_environment(),capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=120)
        except (OSError,subprocess.TimeoutExpired) as error:
            raise ValueError('Build dependency preflight could not run; packaging has not started: '+str(error)) from error
        if result.returncode:
            raise ValueError('Build dependency preflight failed; packaging has not started:\n'+(result.stdout+'\n'+result.stderr)[-4000:])
        resolved=json.loads(report.read_text('utf-8'))
        packages={item['metadata']['name']:item['metadata']['version'] for item in resolved['install']}
        if not packages:raise ValueError('Build dependency preflight returned an empty resolution')
        return {'build_python':'.'.join(map(str,sys.version_info[:3])),'runtime_python':'3.13','offline':True,'packages':packages}
def executable_version(path):
    api=ctypes.windll.version
    size=api.GetFileVersionInfoSizeW(str(path),None)
    if not size:raise ValueError('Build tool version resource missing: '+str(path))
    data=ctypes.create_string_buffer(size)
    if not api.GetFileVersionInfoW(str(path),0,size,data):raise OSError('Cannot read build tool version')
    pointer=ctypes.c_void_p();length=ctypes.c_uint()
    if not api.VerQueryValueW(data,'\\',ctypes.byref(pointer),ctypes.byref(length)):raise OSError('Cannot query build tool version')
    values=ctypes.cast(pointer,ctypes.POINTER(ctypes.c_uint32))
    return '.'.join(str(value) for value in (values[2]>>16,values[2]&65535,values[3]>>16,values[3]&65535))


def validate_requirements_lock(requirements, lockfile):
    def pinned(path):
        result={}
        for line in Path(path).read_text(encoding='utf-8').splitlines():
            line=line.strip()
            if not line or line.startswith('#'):continue
            match=re.fullmatch(r'([A-Za-z0-9_.-]+)==([^\s]+)(?:\s+--hash=sha256:[0-9a-f]{64})?',line)
            if not match:raise ValueError('Build requirements must be pinned: '+line)
            result[re.sub(r'[-_.]+','-',match[1]).lower()]=match[2]
        return result
    direct,locked=pinned(requirements),pinned(lockfile)
    for name,version in direct.items():
        if locked.get(name)!=version:raise ValueError('Wheel lock is stale for '+name)


def normalize_dependencies(package):
    """This application invokes modules; pip CLI wrappers encode absolute build paths."""
    package=Path(package).resolve()
    scripts=package/'bin'
    if scripts.exists():
        if scripts.is_symlink() or scripts.resolve().parent!=package:raise ValueError('Unexpected generated script path')
        shutil.rmtree(scripts)
    for record in sorted(package.glob('*.dist-info/RECORD')):
        rows=list(csv.reader(record.read_text(encoding='utf-8').splitlines()))
        with record.open('w',encoding='utf-8',newline='') as output:
            csv.writer(output,lineterminator='\n').writerows(row for row in rows if not row[0].startswith('../../bin/'))


def build_windows():
    version=json.loads((ROOT/'source/extension/manifest.json').read_text('utf-8'))['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:\.\d+)?',version):raise ValueError('invalid extension version')
    payload=ROOT/'build-windows/payload'
    if payload.exists():raise SystemExit('Payload already exists; use a new clean reviewed build directory, never merge stale contents.')
    dependency_preflight=preflight_dependencies()
    preflight_compilers()
    speech=ROOT/'build-tools/speech-runtime'
    speech_inputs=speech_bundle.verify(speech)
    media=ROOT/'build-tools/media-minimal'
    required=('ffmpeg.exe','ffprobe.exe','COPYING.LGPLv2.1','LICENSE.md','build-config.txt','ffmpeg-source-611cec792a.zip','MinGW-COPYRIGHT.txt','toolchain-packages.txt')
    if not all((media/name).is_file() for name in required):raise SystemExit('Missing reviewed minimal media build and corresponding source.')
    if hashlib.sha256((media/'ffmpeg-source-611cec792a.zip').read_bytes()).hexdigest()!=MEDIA_SHA256:raise SystemExit('Media source hash mismatch.')
    python_zip=ROOT/'build-tools/python-3.13.17-embed-amd64.zip'
    if hashlib.sha256(python_zip.read_bytes()).hexdigest()!=PYTHON_SHA256:raise SystemExit('Python embeddable runtime hash mismatch.')
    wheelhouse=ROOT/'build-tools/wheelhouse'
    lockfile=ROOT/'source/server/requirements-windows-lock.txt'
    if not lockfile.is_file() or not wheelhouse.is_dir():raise SystemExit('Prepare the reviewed locked offline wheelhouse first.')
    validate_requirements_lock(ROOT/'source/server/requirements.txt',lockfile)
    target_media=payload/'media-tools';target_media.mkdir(parents=True)
    for name in required:shutil.copy2(media/name,target_media/name)
    speech_bundle.copy_to(speech,payload/'speech-tools')
    shutil.copy2(ROOT/'tools/build_speech_audio.sh',payload/'speech-tools/build_speech_audio.sh')
    shutil.copy2(ROOT/'tools/enable_speech_utf8.py',payload/'speech-tools/enable_speech_utf8.py')
    shutil.copy2(ROOT/'docs/third-party-speech.md',payload/'speech-tools/README.md')
    shutil.copy2(ROOT/'tools/build_media.sh',target_media/'build_media.sh');shutil.copy2(ROOT/'docs/third-party-media.md',target_media/'README.md')
    archive=build('user',ROOT/'dist')
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            if name.startswith(('extension/','server/','docs/','licenses/')):z.extract(name,payload)
    runtime=payload/'runtime'
    with zipfile.ZipFile(python_zip) as z:z.extractall(runtime)
    (runtime/'python313._pth').write_text('python313.zip\n.\n..\nLib/site-packages\nimport site\n',encoding='ascii')
    subprocess.run(dependency_command(wheelhouse,lockfile,runtime/'Lib/site-packages'),env=pip_environment(),check=True)
    package=runtime/'Lib/site-packages';normalize_dependencies(package);yt_license=next((package/'yt_dlp-2026.10.26.dist-info/licenses').glob('LICENSE'))
    # Start the real worker with the embedded interpreter; no remote request is needed.
    with tempfile.TemporaryDirectory() as tmp:
        recipe = Path(tmp) / 'selection.json'
        recipe.write_text(json.dumps({'formats': [], 'platform': 'x', 'limit': 1}), encoding='utf-8')
        subprocess.run([str(runtime/'python.exe'), '-B', '-X', 'utf8', '-m',
                        'server.download_public_media', str(package), str(recipe)],
                       cwd=payload, check=True, timeout=20)
    shutil.copy2(yt_license,payload/'licenses/yt-dlp-LICENSE.txt')
    help_folder=payload/'help';help_folder.mkdir()
    for name,content in build_help.documents(ROOT).items():(help_folder/name).write_text(content,encoding='utf-8')
    shutil.copy2(ROOT/'docs/usage.md',payload/'README.md')
    (payload/'README.txt').write_text('双击 help/index.html 可打开完整离线说明。\n\n'+build_help.plain((ROOT/'docs/usage.md').read_text('utf-8'),'docs/usage.md'),encoding='utf-8-sig')
    for name in ('install.md','update.md'):
        (payload/('首次安装.txt' if name=='install.md' else '更新说明.txt')).write_text(build_help.plain((ROOT/'docs'/name).read_text('utf-8'),'docs/'+name),encoding='utf-8-sig')
    shutil.copy2(ROOT/'DISCLAIMER.md',payload/'DISCLAIMER.md')
    (payload/'安装后说明.html').write_text("""<!doctype html><meta charset="utf-8"><title>灵感采集安装完成</title><style>body{font:16px system-ui;max-width:760px;margin:60px auto;line-height:1.8;background:#f2f0eb;color:#292824}button{font:inherit;padding:8px 14px}</style><h1>安装完成</h1><p>后台会在安装结束后启动。扩展会实时检查连接；暂时连不上时可重试，无须重复安装。</p><p>Chrome 扩展管理地址：<code id="url">chrome://extensions</code> <button onclick="navigator.clipboard.writeText(document.getElementById('url').textContent).catch(()=>alert('请手动复制地址 chrome://extensions'))">复制地址</button></p><p>首次使用：打开此地址，启用开发者模式，从系统托盘复制固定扩展文件夹地址并加载该目录。</p><p>更新用户：在灵感采集扩展卡片点击 <strong>重新加载 ⟳</strong>。刷新管理网页不会更新扩展。重新打开扩展弹窗；网页仍使用旧脚本时再刷新作品网页。</p><p>固定扩展目录可从托盘菜单“复制扩展文件夹地址”获取；安装器会更新已登记和识别的旧目录，更新后无需重新选择。</p>""",encoding='utf-8')
    metadata=ROOT/'build-windows/AssemblyInfo.cs' ;metadata.write_text('[assembly:System.Reflection.AssemblyFileVersion("'+version+'")]\n',encoding='utf-8')
    subprocess.run([r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe','/nologo','/codepage:65001','/target:winexe','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/reference:System.Management.dll','/win32icon:'+str(payload/'extension/reftray-a.ico'),'/out:'+str(payload/'InspirationCollector.exe'),str(ROOT/'installer/Launcher.cs'),str(ROOT/'installer/Update.cs'),str(ROOT/'installer/Recovery.cs'),str(ROOT/'installer/RuntimeClients.cs'),str(metadata)],check=True)
    inputs={'schema_version':1,'release':version,'python_sha256':PYTHON_SHA256,'dependency_preflight':dependency_preflight,'speech':speech_inputs,
            'requirements_sha256':hashlib.sha256(lockfile.read_bytes()).hexdigest(),
            'inno_version':subprocess.check_output([str(ROOT/'build-tools/inno/ISCC.exe'),'--version'],text=True).strip(),
            'csharp_compiler_version':executable_version(Path(r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe')),
            'wheels':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(wheelhouse.glob('*.whl'))},
            'tools':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'build-tools/inno/ISCC.exe', ROOT/'installer/Launcher.cs', ROOT/'installer/Update.cs', ROOT/'installer/Recovery.cs', ROOT/'installer/RuntimeClients.cs', ROOT/'installer/setup.iss']},
            'media':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(media.iterdir()) if p.is_file()}}
    (payload/'build-inputs.json').write_text(json.dumps(inputs,sort_keys=True,indent=2),encoding='utf-8')
    files={p.relative_to(payload).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in payload.rglob('*') if p.is_file()}
    if any('live-test.' in p or '.sqlite' in p or 'collector-settings.json' in p or p.startswith('data/') for p in files):raise ValueError('Private/test state found in payload')
    (payload/'managed-files.json').write_text(json.dumps({'schema_version':1,'release':version,'data_schema_version':1,'files':files},sort_keys=True,indent=2),encoding='utf-8')
    (ROOT/'build-windows/payload-sha256.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
    subprocess.run([str(ROOT/'build-tools/inno/ISCC.exe'),'/Q','/DAppVersion='+version,str(ROOT/'installer/setup.iss')],check=True)
    print('Installer built; actual install, startup, upgrade and uninstall verification is still required.')
if __name__=='__main__':
    if sys.argv[1:]==['--check-dependencies']:print(json.dumps(preflight_dependencies(),indent=2))
    elif sys.argv[1:]:raise SystemExit('Usage: build_windows.py [--check-dependencies]')
    else:build_windows()
