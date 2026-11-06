#ifndef AppVersion
  #error AppVersion must be passed explicitly by the versioned build script
#endif
[Setup]
AppId={{293CFEA9-3205-4D70-96E6-A5F7491438CC}
AppName=Inspiration Collector
AppVersion={#AppVersion}
DefaultDirName={code:GetInstallDirectory}
UsePreviousAppDir=yes
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
Source: "..\source\server\maintenance.py"; Flags: dontcopy
Source: "..\build-windows\payload\managed-files.json"; DestName: "incoming-managed-files.json"; Flags: dontcopy
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
Filename: "{app}\安装后说明.html"; Description: "扩展加载与更新说明"; Flags: shellexec nowait postinstall skipifsilent
Filename: "{sys}\notepad.exe"; Parameters: """{app}\README.txt"""; Description: "Read instructions"; Flags: nowait postinstall skipifsilent
Filename: "{app}\InspirationCollector.exe"; Description: "Start Inspiration Collector"; Flags: nowait postinstall skipifsilent

[Code]
function GetInstallDirectory(Param: String): String;
begin
  if not RegQueryStringValue(HKCU, 'Software\RefTray', 'InstallDirectory', Result) then
    Result := ExpandConstant('{localappdata}\Programs\InspirationCollector');
end;

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

function GetStateRoot(): String;
begin
  Result := GetEnv('LIBLIB_ROOT');
  if Result = '' then RegQueryStringValue(HKCU, 'Software\RefTray', 'StateRoot', Result);
  if Result = '' then Result := ExpandConstant('{localappdata}\InspirationCollector');
  Result := ExpandFileName(Result);
end;

function IsOwnedMcpCommand(Command, Python, Adapter: String): Boolean;
begin
  Command := Trim(Command);
  Result := (CompareText(Command, '"' + Python + '" "' + Adapter + '"') = 0) or
    (CompareText(Command, '"' + Python + '" ' + Adapter) = 0) or
    (CompareText(Command, Python + ' "' + Adapter + '"') = 0) or
    (CompareText(Command, Python + ' ' + Adapter) = 0) or
    (CompareText(Command, '"' + Python + '" -B "' + Adapter + '"') = 0) or
    (CompareText(Command, '"' + Python + '" -B ' + Adapter) = 0) or
    (CompareText(Command, Python + ' -B "' + Adapter + '"') = 0) or
    (CompareText(Command, Python + ' -B ' + Adapter) = 0);
end;

function StopOwnedMcpClients(): String;
var
  Locator, Services, Processes, Process, Remaining: Variant;
  Index, Count, Attempt, Code, Pid: Integer;
  Python, Adapter, Executable, Command: String;
begin
  Result := '';
  Python := ExpandConstant('{app}\runtime\python.exe');
  Adapter := ExpandConstant('{app}\server\mcp_stdio.py');
  if not FileExists(Python) then exit;
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Services := Locator.ConnectServer('.', 'root\CIMV2');
    Processes := Services.ExecQuery('SELECT * FROM Win32_Process WHERE Name = ''python.exe''');
    Count := Processes.Count;
    for Index := 0 to Count - 1 do begin
      Process := Processes.ItemIndex(Index);
      if not VarIsNull(Process.ExecutablePath) and not VarIsNull(Process.CommandLine) then begin
        Executable := Process.ExecutablePath;
        Command := Process.CommandLine;
        if (CompareText(Executable, Python) = 0) and IsOwnedMcpCommand(Command, Python, Adapter) then begin
          Pid := Process.ProcessId;
          { The backend has already finished its work and exited. These stdio clients
            are owned by the AI host, outside the launcher's process tree. }
          Log('Closing verified RefTray MCP client PID ' + IntToStr(Pid));
          Code := Process.Terminate(0);
          if Code <> 0 then begin
            Result := 'RefTray 接口进程仍占用程序文件，请关闭 AI 宿主中的 RefTray 接口后重试；尚未替换程序。';
            exit;
          end;
          for Attempt := 1 to 50 do begin
            Remaining := Services.ExecQuery('SELECT ProcessId FROM Win32_Process WHERE ProcessId = ' + IntToStr(Pid));
            if Remaining.Count = 0 then break;
            Sleep(100);
          end;
          if Remaining.Count <> 0 then begin
            Result := '等待 RefTray 接口退出超时；尚未替换程序，请稍后重试。';
            exit;
          end;
        end;
      end;
    end;
    { Never terminate an unrecognized user of the runtime. Block before copying,
      rather than leave a half-updated installation after a DLL sharing error. }
    Processes := Services.ExecQuery('SELECT * FROM Win32_Process WHERE Name = ''python.exe''');
    for Index := 0 to Processes.Count - 1 do begin
      Process := Processes.ItemIndex(Index);
      if not VarIsNull(Process.ExecutablePath) then begin
        Executable := Process.ExecutablePath;
        if CompareText(Executable, Python) = 0 then begin
          Result := '仍有进程使用 RefTray 运行库，请关闭该进程或 AI 宿主后重试；尚未替换程序。';
          exit;
        end;
      end;
    end;
  except
    Result := '无法检查 RefTray 接口文件占用；尚未替换程序。请关闭 AI 宿主中的 RefTray 接口后重试。';
    Log(GetExceptionMessage);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := StopOwnedLauncher();
  if Result <> '' then exit;
  Result := StopOwnedMcpClients();
  if Result <> '' then exit;
  if FileExists(ExpandConstant('{app}\runtime\python.exe')) then begin
    ExtractTemporaryFile('maintenance.py');
    ExtractTemporaryFile('incoming-managed-files.json');
    if not Exec(ExpandConstant('{app}\runtime\python.exe'), '-I "' + ExpandConstant('{tmp}\maintenance.py') + '" --upgrade-program "' + ExpandConstant('{app}') + '" --incoming-manifest "' + ExpandConstant('{tmp}\incoming-managed-files.json') + '" --report "' + GetStateRoot() + '\data\inspiration\logs\installer-maintenance.json" --state "' + GetStateRoot() + '" --plan-only --export-manifest "' + ExpandConstant('{tmp}\previous-managed-files.json') + '"', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      Result := '无法检查旧程序清单，尚未替换程序。'
    else if ExitCode <> 0 then
      Result := '旧程序清单或素材保护检查失败，尚未替换程序。详情见状态目录 data/inspiration/logs/installer-maintenance.json。';
  end;
end;

function InitializeUninstall(): Boolean;
var
  Error, Params: String;
  ExitCode: Integer;
begin
  Error := StopOwnedLauncher();
  if Error = '' then Error := StopOwnedMcpClients();
  Result := Error = '';
  if not Result then begin MsgBox(Error, mbError, MB_OK); exit; end;
  Params := '';
  if not UninstallSilent then begin
    if MsgBox('默认保留全部素材和用户数据。是否查看可选的数据清理范围？选择“否”将直接保留全部数据。', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then begin
      if MsgBox('清理偏好？仅重置采集默认值和素材库路径设置；素材文件保留。', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then Params := Params + ' --preferences';
      if MsgBox('清理采集历史和任务检查点？此操作不可撤销；已保存素材和手改文件保留。', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then Params := Params + ' --history';
      if MsgBox('清理本程序状态目录内的 cache 缓存？素材目录、独立 Node/FFmpeg/ASR 均保留。检测到素材重叠或链接时拒绝清理。', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then Params := Params + ' --cache';
    end;
  end;
  if Params <> '' then begin
    if not Exec(ExpandConstant('{app}\runtime\python.exe'), '-I "' + ExpandConstant('{app}\server\maintenance.py') + '" --report "' + GetStateRoot() + '\data\inspiration\logs\installer-maintenance.json" --state "' + GetStateRoot() + '"' + Params, '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      Error := '无法执行所选数据清理；卸载已停止。'
    else if ExitCode <> 0 then Error := '数据清理保护检查失败，卸载已停止；请保留素材并联系维护者。';
    Result := Error = '';
    if not Result then MsgBox(Error, mbError, MB_OK);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usDone) and not UninstallSilent then
    MsgBox('程序已卸载。素材仍在您选择的素材库；未选择清理的偏好、历史和缓存保留于 ' + ExpandConstant('{localappdata}\InspirationCollector') + '。请勿直接删除整个目录：旧版素材也可能在其中。请在 chrome://extensions 手动移除灵感采集扩展。', mbInformation, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ExitCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    if not Exec(ExpandConstant('{app}\runtime\python.exe'), '-I "' + ExpandConstant('{app}\server\extension_install.py') + '" --program "' + ExpandConstant('{app}') + '"', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      RaiseException('扩展目录更新未执行，安装未完成。请保留当前目录并重试安装。')
    else if ExitCode <> 0 then
      RaiseException('扩展目录更新或文件核验失败，安装未完成。未将旧扩展标为已更新，请保留当前目录并重试安装。');
  end;
  if (CurStep = ssPostInstall) and FileExists(ExpandConstant('{tmp}\previous-managed-files.json')) then begin
    if not Exec(ExpandConstant('{app}\runtime\python.exe'), '-I "' + ExpandConstant('{app}\server\maintenance.py') + '" --upgrade-program "' + ExpandConstant('{app}') + '" --incoming-manifest "' + ExpandConstant('{app}\managed-files.json') + '" --previous-manifest "' + ExpandConstant('{tmp}\previous-managed-files.json') + '" --report "' + GetStateRoot() + '\data\inspiration\logs\installer-maintenance.json" --state "' + GetStateRoot() + '"', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      MsgBox('新版已安装，但旧文件清单清理未执行。素材未移动；详情见状态目录 data/inspiration/logs/installer-maintenance.json。', mbError, MB_OK)
    else if ExitCode <> 0 then
      MsgBox('新版已安装，但旧文件清单清理失败。素材未移动；详情见状态目录 data/inspiration/logs/installer-maintenance.json。', mbError, MB_OK);
  end;
end;
