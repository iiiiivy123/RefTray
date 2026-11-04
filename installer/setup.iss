#ifndef AppVersion
  #error AppVersion must be passed explicitly by the versioned build script
#endif
[Setup]
AppId={{293CFEA9-3205-4D70-96E6-A5F7491438CC}
AppName=Inspiration Collector
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\InspirationCollector
DefaultGroupName=Inspiration Collector
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\dist
OutputBaseFilename=InspirationCollector-{#AppVersion}-Windows-x64-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\build-windows\payload\extension\reftray-a.ico
; Running-instance shutdown is checked in PrepareToInstall and InitializeUninstall.
; AppMutex=Local\InspirationCollectorLauncher would block before the handshake.
UninstallDisplayIcon={app}\InspirationCollector.exe
CloseApplications=no
DisableProgramGroupPage=yes
[Files]
Source: "..\build-windows\payload\*"; DestDir: "{app}"; Excludes: "*.pyc,__pycache__\*,Scripts\*,bin\*"; Flags: ignoreversion recursesubdirs createallsubdirs
[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut"
[Icons]
Name: "{userdesktop}\灵感采集"; Filename: "{app}\InspirationCollector.exe"; Tasks: desktopicon
Name: "{group}\灵感采集"; Filename: "{app}\InspirationCollector.exe"
Name: "{group}\使用说明"; Filename: "{sys}\notepad.exe"; Parameters: """{app}\README.txt"""
[InstallDelete]
Type: files; Name: "{app}\开始使用.html"
Type: files; Name: "{group}\首次安装引导.lnk"
[Run]
Filename: "{sys}\notepad.exe"; Parameters: """{app}\README.txt"""; Description: "Read instructions"; Flags: nowait postinstall skipifsilent
Filename: "{app}\InspirationCollector.exe"; Description: "Start Inspiration Collector"; Flags: nowait postinstall skipifsilent

[Code]
function StopOwnedLauncher(): String;
var
  ExitCode: Integer;
  Launcher: String;
begin
  Result := '';
  if not CheckForMutexes('Local\InspirationCollectorLauncher') then exit;
  Launcher := ExpandConstant('{app}\InspirationCollector.exe');
  if not FileExists(Launcher) then begin
    Result := '后台仍在运行。请从系统托盘退出灵感采集后重试。';
    exit;
  end;
  if not Exec(Launcher, '--prepare-upgrade', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
    Result := '无法联系灵感采集后台，请从系统托盘退出后重试。'
  else if (ExitCode <> 0) or CheckForMutexes('Local\InspirationCollectorLauncher') then
    Result := '后台尚未确认退出。请等待采集或目录选择完成，再重试；旧版后台请从托盘退出。';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := StopOwnedLauncher();
end;

function InitializeUninstall(): Boolean;
var
  Error: String;
begin
  Error := StopOwnedLauncher();
  Result := Error = '';
  if not Result then MsgBox(Error, mbError, MB_OK);
  if Result and not UninstallSilent then
    Result := MsgBox('卸载仅移除程序，默认保留全部素材、偏好、采集历史和缓存。独立安装的媒体工具也会保留。继续卸载？', mbConfirmation, MB_YESNO) = IDYES;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usDone) and not UninstallSilent then
    MsgBox('程序已卸载。素材仍在您选择的素材库；偏好、历史和缓存保留于 ' + ExpandConstant('{localappdata}\InspirationCollector') + '。请勿直接删除整个目录：旧版素材也可能在其中。请在 chrome://extensions 手动移除灵感采集扩展。', mbInformation, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssDone) and not WizardSilent then
    MsgBox('Chrome 扩展目录：' + ExpandConstant('{app}\extension') + #13#10 + '首次使用：在 chrome://extensions 启用开发者模式，加载此文件夹。' + #13#10 + '更新：在 chrome://extensions 点击灵感采集扩展卡片上的重新加载；刷新管理网页不会更新扩展。', mbInformation, MB_OK);
end;
