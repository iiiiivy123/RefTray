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
AppMutex=Local\InspirationCollectorLauncher
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
