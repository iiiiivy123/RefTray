"""Build code-only user/dev ZIPs from an allowlist; local state is never an input."""
import argparse,json,zipfile
import build_help
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DOCS=('usage.md','save-layout.md','install.md','update.md','rights-and-privacy.md','use-cases.md','release-0.5.37.md','release-0.5.48.md','release-0.5.49.md','release-0.5.50.md','release-0.5.51.md','release-0.5.52.md','release-0.5.53.md','release-0.5.54.md','release-0.5.55.md','release-1.0.0.md','release-1.0.1.md','SAVE-LAYOUT-REVIEW-2026-11-11.md','mcp.md','review-fixes.md')
LICENSE_DOCS=('third-party-notices.md','third-party-media.md','third-party-speech.md','CAT-LOGUE-LICENSE.txt','ytdlp-license.md')
def build(channel,output):
    if channel not in ('user','dev'):raise ValueError('invalid distribution channel')
    version=json.loads((ROOT/'source/extension/manifest.json').read_text('utf-8'))['version']
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    target=output/f'inspiration-collector-{version}-{channel}.zip'
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
        for folder,extensions in [('extension',{'.js','.html','.css','.json','.png','.svg','.ico'}),('server',{'.py','.txt','.ps1'})]:
            for file in sorted((ROOT/'source'/folder).rglob('*')):
                if not file.is_file() or file.suffix not in extensions:continue
                if any(part.startswith('.') or part in ('__pycache__','node_modules') for part in file.relative_to(ROOT/'source'/folder).parts):continue
                if channel=='user' and file.name.startswith('live-test.'):continue
                if folder=='extension' and file.suffix=='.json' and file.name!='manifest.json':continue
                if file.suffix=='.png' and not file.name.startswith('icon-'):continue
                if file.suffix in ('.svg','.ico') and not file.name.startswith('reftray-a'):continue
                data=file.read_bytes()
                if channel=='dev' and file.name=='manage.html' and (ROOT/'source/extension/live-test.html').exists():
                    data=data.decode('utf-8').replace('<!-- LOCAL_DEV_TOOLS -->','<button id="live-test">Chrome 实测助手</button>').encode('utf-8')
                archive.writestr(f'{folder}/{file.relative_to(ROOT/"source"/folder).as_posix()}',data)
        archive.write(ROOT/'docs/usage.md','使用说明.md')
        for name,content in build_help.documents(ROOT).items():archive.writestr('help/'+name,content)
        for name in DOCS:archive.write(ROOT/'docs'/name,'docs/'+name)
        for name in LICENSE_DOCS:archive.write(ROOT/'docs'/name,'licenses/'+name)
        archive.write(ROOT/'DISCLAIMER.md','DISCLAIMER.md')
        archive.writestr('PACKAGE-NOTE.txt','Source runtime package: requires Python and dependencies. Windows users should download Windows-x64-Setup.exe from Releases instead.\n')
    return target
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--channel',choices=['user','dev'],required=True);parser.add_argument('--output',type=Path,default=ROOT/'dist');args=parser.parse_args();print(build(args.channel,args.output))
