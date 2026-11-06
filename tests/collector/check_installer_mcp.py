"""Windows integration check: run the actual Inno preflight against scratch clients.

Run with the installed embedded Python; never update the real installation.
"""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def main():
    repo = Path(__file__).resolve().parents[2]
    source = (repo / 'installer/setup.iss').read_text(encoding='utf-8-sig')
    code = source[source.index('function IsOwnedMcpCommand'):source.index('function PrepareToInstall')]
    prepare = source[source.index('function PrepareToInstall'):source.index('function InitializeUninstall')]
    assert prepare.index('StopOwnedLauncher') < prepare.index('StopOwnedMcpClients') < prepare.index('ExtractTemporaryFile')
    with tempfile.TemporaryDirectory(prefix='reftray-mcp-check-') as tmp:
        base = Path(tmp)
        app = base / 'app with spaces'
        shutil.copytree(Path(sys.executable).parent, app / 'runtime', ignore=shutil.ignore_patterns('__pycache__'))
        (app / 'server').mkdir()
        adapter = app / 'server/mcp_stdio.py'
        adapter.write_text("import ssl,time\nprint('ready',flush=True)\ntime.sleep(60)\n", encoding='utf-8')
        unrelated = base / 'unrelated.py'
        unrelated.write_text(adapter.read_text(), encoding='utf-8')
        marker = base / 'marker.txt'
        marker.write_text('preflight must succeed before this is copied')
        header = f'''[Setup]
AppName=RefTray isolated MCP check
AppVersion=1
DefaultDirName={app}
UsePreviousAppDir=no
CreateAppDir=yes
DisableDirPage=yes
Uninstallable=no
PrivilegesRequired=lowest
OutputDir=.
OutputBaseFilename=preflight
[Files]
Source: "{marker}"; DestDir: "{app / 'copied'}"
[Code]
'''
        footer = '''
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Log('RefTray isolated preflight entered: ' + ExpandConstant('{app}'));
  Result := StopOwnedMcpClients();
  SaveStringToFile(ExpandConstant('{app}\\result.txt'), Result, False);
end;
'''
        harness = base / 'check.iss'
        harness.write_text(header + code + footer, encoding='utf-8-sig')
        subprocess.run([str(repo / 'build-tools/inno/ISCC.exe'), '/Q', str(harness)], check=True, timeout=30)
        def launch(executable, script, *args, flags=()):
            p = subprocess.Popen([str(executable), *flags, str(script), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            assert p.stdout.readline().strip() == 'ready'
            return p
        def install(log):
            return subprocess.run([str(base / 'preflight.exe'), '/VERYSILENT', '/SUPPRESSMSGBOXES',
                '/NORESTART', '/DIR=' + str(app), '/LOG=' + str(base / log)], timeout=20).returncode
        children = []
        try:
            children = [launch(app / 'runtime/python.exe', adapter),
                        launch(app / 'runtime/python.exe', adapter, flags=('-B',))]
            other = launch(sys.executable, unrelated)
            children.append(other)
            assert install('owned.log') == 0
            assert all(p.wait(timeout=5) == 0 for p in children[:2])
            assert other.poll() is None, 'Unrelated Python was stopped'
            assert (app / 'copied/marker.txt').read_text() == marker.read_text()
            (app / 'copied/marker.txt').unlink()
            unknown = launch(app / 'runtime/python.exe', adapter, '--unrecognized')
            children.append(unknown)
            assert install('unknown.log') != 0
            assert unknown.poll() is None, 'Unrecognized client was terminated'
            assert not (app / 'copied/marker.txt').exists(), 'Files copied before client check'
            assert (app / 'result.txt').read_text(encoding='utf-8-sig'), 'Missing actionable failure'
            report = {'owned_clients_closed':2, 'unrelated_python_preserved':True,
                'unknown_client_blocks_before_copy':True, 'installed_app_modified':False,
                'code_sha256':hashlib.sha256(code.encode()).hexdigest()}
            output = repo / 'work/mcp-upgrade'
            output.mkdir(exist_ok=True)
            for name in ('owned.log', 'unknown.log'):
                shutil.copy2(base / name, output / name)
            (output / 'preflight-check.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
            print(json.dumps(report))
        finally:
            for child in children:
                if child.poll() is None:
                    child.terminate()
                    child.wait(timeout=5)


if __name__ == '__main__':
    main()
