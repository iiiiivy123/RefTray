param(
 [string]$ProgramDirectory='F:\LibLib自动化\plugins\liblib-automation\scripts\collector',
 [string]$StateDirectory='F:\LibLib自动化',
 [string]$Payload=(Join-Path $PSScriptRoot 'payload')
)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($ProgramDirectory).TrimEnd('\')
$state=[IO.Path]::GetFullPath($StateDirectory).TrimEnd('\')
$source=[IO.Path]::GetFullPath($Payload).TrimEnd('\')
if (-not (Test-Path -LiteralPath (Join-Path $target 'extension\manifest.json'))) {throw '没有找到原安装；未修改任何文件。'}
$manifest=Get-Content -LiteralPath (Join-Path $source 'managed-files.json') -Raw | ConvertFrom-Json
foreach($entry in $manifest.files.PSObject.Properties){
 $path=[IO.Path]::GetFullPath((Join-Path $source $entry.Name))
 if(-not $path.StartsWith($source+'\',[StringComparison]::OrdinalIgnoreCase)){throw '更新清单路径无效'}
 if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value){throw '更新包校验失败，未覆盖程序。'}
}
$config=Join-Path $state 'data\inspiration\collector-settings.json'
$configHash=if(Test-Path -LiteralPath $config){(Get-FileHash -LiteralPath $config).Hash}else{$null}
$connection=Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue
if($connection){
 $client=New-Object Net.WebClient
 $client.Proxy=$null
 try{$health=$client.DownloadString('http://127.0.0.1:8766/health') | ConvertFrom-Json}finally{$client.Dispose()}
 if($health.busy -ne $false -or [IO.Path]::GetFullPath($health.root).TrimEnd('\') -ne $state){throw '后台忙或无法确认归属，请完成任务后重试；未覆盖程序。'}
 $launcher=Join-Path $target 'InspirationCollector.exe'
 if(Test-Path -LiteralPath $launcher){
  $result=Start-Process -FilePath $launcher -ArgumentList '--prepare-upgrade' -WindowStyle Hidden -Wait -PassThru
  if($result.ExitCode -ne 0){throw '后台没有确认退出，未覆盖程序。'}
 }else{
  $legacy=Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)"
  if($legacy.CommandLine -notmatch ' -m server\.local_tray$'){throw '不是已确认的旧版后台，未结束进程。'}
  if(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($legacy.ProcessId)"){throw '旧版后台仍有子任务，请先退出托盘后台。'}
  # Only the verified idle legacy process, never a process-name or port-wide kill.
  Stop-Process -Id $legacy.ProcessId
  Wait-Process -Id $legacy.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
 }
 if(Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue){throw '端口尚未释放，未覆盖程序。'}
}
$backup=Join-Path $state ('_维护备份\RefTray-before-'+$manifest.release+'-'+(Get-Date -Format yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach($entry in $manifest.files.PSObject.Properties){
 $destination=[IO.Path]::GetFullPath((Join-Path $target $entry.Name))
 if(-not $destination.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){throw '安装清单路径无效'}
 if(Test-Path -LiteralPath $destination){
  $saved=Join-Path $backup $entry.Name
  New-Item -ItemType Directory -Path (Split-Path $saved -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $destination -Destination $saved
 }
 New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
 Copy-Item -LiteralPath (Join-Path $source $entry.Name) -Destination $destination -Force
}
Copy-Item -LiteralPath (Join-Path $source 'managed-files.json') -Destination (Join-Path $target 'managed-files.json') -Force
$start=Join-Path $target 'start_collector.ps1'
if(Test-Path -LiteralPath $start){Copy-Item -LiteralPath $start -Destination (Join-Path $backup 'start_collector.ps1')}
@'
$env:LIBLIB_ROOT=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../..')).Path
Start-Process -FilePath (Join-Path $PSScriptRoot 'InspirationCollector.exe') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
'@ | Set-Content -LiteralPath $start -Encoding utf8
if($configHash -and (Get-FileHash -LiteralPath $config).Hash -ne $configHash){throw '偏好文件发生变化，请检查备份；未继续启动。'}
$previousRoot=$env:LIBLIB_ROOT
try{
 $env:LIBLIB_ROOT=$state
 Start-Process -FilePath (Join-Path $target 'InspirationCollector.exe') -WorkingDirectory $target -WindowStyle Hidden
}finally{$env:LIBLIB_ROOT=$previousRoot}
Write-Host ('程序已覆盖到 '+$manifest.release+'；备份：'+$backup)
Write-Host '请在 chrome://extensions 为灵感采集点重新加载，然后重开弹窗。'
