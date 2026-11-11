// Stop only verified stdio clients of this exact installation before replacement.
using System;
using System.IO;
using System.Diagnostics;
using System.Management;
using System.Threading;

internal static partial class Launcher {
 static bool OwnedMcpCommand(string command,string python,string adapter){
  foreach(var executable in new[]{python,Quote(python)})foreach(var script in new[]{adapter,Quote(adapter)})foreach(var flag in new[]{" "," -B "})
   if(String.Equals(command.Trim(),executable+flag+script,StringComparison.OrdinalIgnoreCase))return true;
  return false;
 }
 static void StopRuntimeClients(string program){
  string python=Full(Path.Combine(program,"runtime","python.exe")),adapter=Full(Path.Combine(program,"server","mcp_stdio.py"));
  DateTime observedBefore=DateTime.UtcNow;
  using(var search=new ManagementObjectSearcher("SELECT ExecutablePath,CommandLine,ProcessId FROM Win32_Process WHERE Name='python.exe'")){
   foreach(ManagementObject process in search.Get())using(process){
    var executable=process["ExecutablePath"] as string;var command=process["CommandLine"] as string;
    if(String.IsNullOrEmpty(executable)||!String.Equals(Full(executable),python,StringComparison.OrdinalIgnoreCase))continue;
    if(String.IsNullOrEmpty(command)||!OwnedMcpCommand(command,python,adapter))throw new Exception("仍有其他进程使用本程序运行库，请结束后再恢复；尚未替换程序。");
    // WMI query results need not have an invokable instance path. Use the
    // verified process ID and recheck the executable and creation time before
    // stopping it, so a recycled ID cannot target another runtime process.
    try{using(var client=Process.GetProcessById(Convert.ToInt32(process["ProcessId"]))){
     if(client.StartTime.ToUniversalTime()>observedBefore||!String.Equals(Full(client.MainModule.FileName),python,StringComparison.OrdinalIgnoreCase))throw new Exception("AI 连接在恢复期间发生变化，请稍后重新恢复。");
     client.Kill();
    }}catch(ArgumentException){} // Client already exited.
   }
  }
  for(int attempt=0;attempt<50;attempt++){
   bool remaining=false;
   using(var search=new ManagementObjectSearcher("SELECT ExecutablePath FROM Win32_Process WHERE Name='python.exe'")){
    foreach(ManagementObject process in search.Get())using(process){var executable=process["ExecutablePath"] as string;if(!String.IsNullOrEmpty(executable)&&String.Equals(Full(executable),python,StringComparison.OrdinalIgnoreCase))remaining=true;}
   }
   if(!remaining)return;Thread.Sleep(100);
  }
  throw new Exception("RefTray 接口仍占用程序文件，尚未替换程序。请稍后重新恢复。");
 }
}
