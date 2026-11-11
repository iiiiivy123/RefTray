"""Actual installer/upgrade/uninstall QA in scratch. Restores only this app's pre-existing uninstall registry key."""
import argparse,base64,contextlib,hashlib,json,os,shutil,socket,struct,subprocess,time,urllib.request,urllib.error,uuid,winreg,zlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'source/extension/manifest.json').read_text('utf-8'))['version']
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--run-isolated-installer-tests',action='store_true')
parser.add_argument('--baseline-package', type=Path, help='Local archived 0.5.38 installer for disposable Windows VM QA')
args=parser.parse_args()
if not args.run_isolated_installer_tests:parser.error('Explicit --run-isolated-installer-tests required; this temporarily replaces and restores this app uninstall registry record.')
# /DIR cannot isolate registered extension directories, upgrade pipes or shortcuts.
for view in (winreg.KEY_WOW64_32KEY, winreg.KEY_WOW64_64KEY):
 for key in (r'Software\RefTray', r'Software\Microsoft\Windows\CurrentVersion\Uninstall\{293CFEA9-3205-4D70-96E6-A5F7491438CC}_is1'):
  try:
   with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_READ | view):
    parser.exit(2, 'Existing RefTray registration: use a disposable Windows VM. No installer started.\n')
  except FileNotFoundError:
   pass
SCRATCH=Path(os.environ['LOCALAPPDATA'])/'hermes/cache/scratch'/('collector-installer-'+uuid.uuid4().hex[:8]);SCRATCH.mkdir(parents=True)
APP=SCRATCH/'installed';STATE=SCRATCH/'state';LIBRARY=SCRATCH/'materials';LIBRARY.mkdir()
KEY=r'Software\Microsoft\Windows\CurrentVersion\Uninstall\{293CFEA9-3205-4D70-96E6-A5F7491438CC}_is1'
VIEW=winreg.KEY_WOW64_64KEY
OP=urllib.request.build_opener(urllib.request.ProxyHandler({}));BASE='http://127.0.0.1:8767'
REPORT={'version':VERSION,'test_location':str(SCRATCH),'clean_windows_vm':False,'uses_isolated_program_state_and_library':True,'results':{}}
ENV={k:v for k,v in os.environ.items() if not k.startswith(('COLLECTOR_','LIBLIB_','PYTHONPATH','PYTHONHOME'))}
ENV.update(PATH=r'C:\Windows\System32;C:\Windows',LIBLIB_ROOT=str(STATE),LIBLIB_COLLECTOR_PORT='8767',PYTHONUTF8='1',TMP=str(SCRATCH),TEMP=str(SCRATCH),TMPDIR=str(SCRATCH))
def snapshot(key):
 try:
  with winreg.OpenKey(winreg.HKEY_CURRENT_USER,key,0,winreg.KEY_READ|VIEW) as h:
   values=[];children={};i=0
   while True:
    try:values.append(winreg.EnumValue(h,i));i+=1
    except OSError:break
   i=0
   while True:
    try:name=winreg.EnumKey(h,i);children[name]=snapshot(key+'\\'+name);i+=1
    except OSError:break
   return {'values':values,'children':children}
 except FileNotFoundError:return None
def remove_key(key):
 data=snapshot(key)
 if data is None:return
 for name in data['children']:remove_key(key+'\\'+name)
 winreg.DeleteKeyEx(winreg.HKEY_CURRENT_USER,key,VIEW,0)
def restore(key,data):
 if data is None:return
 with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER,key,0,winreg.KEY_WRITE|VIEW) as h:
  for name,value,kind in data['values']:winreg.SetValueEx(h,name,0,kind,value)
 for name,child in data['children'].items():restore(key+'\\'+name,child)
def run(command,timeout=90):
 p=subprocess.run([str(x) for x in command],env=ENV,capture_output=True,timeout=timeout)
 if p.returncode:raise RuntimeError('Command failed: '+str(command[0])+' exit '+str(p.returncode))
 return p
@contextlib.contextmanager
def server():
 log=(SCRATCH/'qa-service.log').open('ab');proc=subprocess.Popen([str(APP/'runtime/python.exe'),'-B','-m','uvicorn','server.app:app','--host','127.0.0.1','--port','8767','--no-access-log'],cwd=APP,env=ENV,stdout=log,stderr=log)
 try:
  for _ in range(100):
   if proc.poll() is not None:raise RuntimeError('Installed embedded server exited')
   try:
    with OP.open(BASE+'/health',timeout=1) as response:health=json.load(response)
    if Path(health['root']).resolve()!=STATE.resolve():raise RuntimeError('Another service owns QA port')
    yield health;break
   except (urllib.error.URLError,TimeoutError):time.sleep(.1)
  else:raise RuntimeError('Installed server readiness timed out')
 finally:
  if proc.poll() is None:proc.terminate();proc.wait(timeout=10)
  log.close()
def api(health,route,body=None):
 req=urllib.request.Request(BASE+route,data=None if body is None else json.dumps(body).encode('utf-8'),headers={'Content-Type':'application/json','X-Collector-Token':health['settings_token']})
 with OP.open(req,timeout=15) as response:return json.load(response)
def collect(health,payload):
 job=api(health,'/collect/start',payload)['job_id']
 for _ in range(200):
  state=api(health,'/collect/status/'+job)
  if state['status'] in ('completed','failed'):
   if state['status']!='completed':raise RuntimeError(state.get('message','collect failed'))
   return state['result']
  time.sleep(.05)
 raise RuntimeError('collection timed out')
def install(setup):
 run([setup,'/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS','/TASKS=!desktopicon','/GROUP=InspirationCollector-Isolated-QA','/DIR='+str(APP),'/LOG='+str(SCRATCH/(setup.stem+'.log'))],180)
 assert (APP/'extension/manifest.json').is_file()
def verified_baseline():
 package=args.baseline_package
 if package is None or not package.is_absolute() or package.name!='InspirationCollector-0.5.38-Windows-x64-Setup.exe':
  raise ValueError('Supply the local archived 0.5.38 installer using an absolute path')
 target=SCRATCH/package.name
 shutil.copyfile(package,target)
 with target.open('rb') as handle:
  if hashlib.file_digest(handle,'sha256').hexdigest()!='563a5bf29c82ee3c493cf1d53162f0b540e815a160da9ab337fa7e4d96bc3b71':
   raise ValueError('Unexpected baseline package digest')
 return target
def image_bytes():
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',8,8,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+b'\x00\x00\xff'*8)*8))+chunk(b'IEND',b'')
def main():
 global STATE
 # Refuse to stop or replace any server on the isolated port.
 with socket.socket() as s:s.bind(('127.0.0.1',8767))
 original=snapshot(KEY)
 if original is not None:
  names={name:value for name,value,_ in original['values']};assert names.get('DisplayName','').startswith('Inspiration Collector')
 try:
  old=verified_baseline();install(old)
  assert json.loads((APP/'extension/manifest.json').read_text('utf-8'))['version']=='0.5.38'
  with server() as health:
   assert health['release']=='0.5.38';api(health,'/settings/directory',{'directory':str(LIBRARY)})
   payload={'canonical_url':'https://example.test/install-migration','page_title':'Installer migration fixture','destination':str(LIBRARY),'images':[{'url':'https://img.example.test/fixture.png','data_base64':base64.b64encode(image_bytes()).decode(),'content_type':'image/png'}]}
   saved=collect(health,payload);assert saved['new_images']==1
  sentinel=LIBRARY/'MANUAL-EDIT-KEEP.md';sentinel.write_text('User-owned sentinel; never delete or rewrite.\n',encoding='utf-8')
  before={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in LIBRARY.rglob('*') if p.is_file()}
  REPORT['results']['old_install_and_real_image_save']=True
  install(ROOT/f'dist/InspirationCollector-{VERSION}-Windows-x64-Setup.exe')
  assert json.loads((APP/'extension/manifest.json').read_text('utf-8'))['version']==VERSION
  with server() as health:
   assert health['release']==VERSION and Path(health['inbox']).resolve()==LIBRARY.resolve()
   history=api(health,'/history');assert 'https://example.test/install-migration' in json.dumps(history)
   repeated=collect(health,payload);assert repeated['new_images']==0
   note=collect(health,{'canonical_url':'https://example.test/install-note','page_title':'Installed note fixture','destination':str(LIBRARY),'collection_mode':'text','body_text':'Synthetic installed HTTP fixture','md_only':True,'include_images':False,'ocr_enabled':False})
   assert list(Path(note['directory']).glob('*.md'))
   try:OP.open(BASE+'/tasks',timeout=3);raise AssertionError('Unauthorized access accepted')
   except urllib.error.HTTPError as e:assert e.code==403
   REPORT['results'].update(upgrade_keeps_library_setting=True,upgrade_keeps_history=True,upgrade_keeps_deduplication=True,installed_markdown_api=True,unauthorized_rejected=True)
  for p,digest in before.items():assert p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==digest
  REPORT['results']['upgrade_keeps_original_files']=True
  run([APP/'InspirationCollector.exe','--smoke','8767',STATE],45)
  assert json.loads((STATE/'smoke-result.json').read_text('utf-8'))=={'release_ok':True,'service_stopped':True}
  REPORT['results']['installed_launcher_without_developer_path']=True
  run([APP/'InspirationCollector.exe','--tray-smoke','8767',STATE],45)
  assert not (STATE/'tray-error.txt').exists();REPORT['results']['tray_without_main_window_and_clean_exit']=True
  run([APP/'unins000.exe','/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/LOG='+str(SCRATCH/'uninstall.log')],120)
  for _ in range(100):
   if not (APP/'extension/manifest.json').exists():break
   time.sleep(.1)
  assert not (APP/'extension/manifest.json').exists()
  for p,digest in before.items():assert p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==digest
  assert (STATE/'data/inspiration/collector-settings.json').is_file()
  REPORT['results']['uninstall_preserves_library_and_state']=True
  # A separate fresh install must not rely on remnants of the older program or state.
  STATE=SCRATCH/'fresh-state';ENV['LIBLIB_ROOT']=str(STATE);fresh_library=SCRATCH/'fresh-library'
  install(ROOT/f'dist/InspirationCollector-{VERSION}-Windows-x64-Setup.exe')
  run([APP/'InspirationCollector.exe','--smoke','8767',STATE],45)
  with server() as health:
   assert health['release']==VERSION and not health['library_configured']
   api(health,'/settings/directory',{'directory':str(fresh_library)})
   fresh=collect(health,{**payload,'destination':str(fresh_library)})
   assert fresh['new_images']==1
  REPORT['results']['fresh_install_embedded_startup_and_image_api']=True
  run([APP/'unins000.exe','/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'],120)
  for _ in range(100):
   if not (APP/'extension/manifest.json').exists():break
   time.sleep(.1)
  assert not (APP/'extension/manifest.json').exists()
  assert list(fresh_library.rglob('*.png'))
  REPORT['results']['fresh_uninstall_keeps_saved_image']=True
 finally:
  remove_key(KEY);restore(KEY,original);assert snapshot(KEY)==original;REPORT['original_app_registry_restored']=True
  (SCRATCH/'verification.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(REPORT,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
