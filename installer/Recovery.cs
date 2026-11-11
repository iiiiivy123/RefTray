// Recovery runs outside the program directory, including when the backend cannot start.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Windows.Forms;

internal static partial class Launcher {
 static bool QuietUpdateRestart(){
  // Older updaters restart without --update-start after Setup fails. A modal
  // error would keep the launcher and its files open while recovery waits.
  try{var plan=ReadUpdate(state);var status=updateJson.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(UpdateFolder(state),"status.json")));
   string phase=(string)status["phase"];
   return plan.ContainsKey("program_snapshot_sha256")&&String.Equals(Full((string)plan["program"]),Full(app),StringComparison.OrdinalIgnoreCase)&&
    (string)plan["version"]==Release()&&(phase=="installing"||phase=="restarting"||phase=="rolling_back"||phase=="failed");
  }catch{return false;}
 }
 static string UpdateMutexName(string program){
  using(var hash=System.Security.Cryptography.SHA256.Create())return "Local\\RefTrayUpdate-"+BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(program.ToLowerInvariant()))).Replace("-","");
 }
 static void PrepareRecoveryShortcut(string directory,string program,string root){
  File.Copy(Path.Combine(program,"InspirationCollector.exe"),Path.Combine(directory,"RefTrayRestore.exe"),true);
  File.WriteAllText(Path.Combine(directory,"restore-target.json"),updateJson.Serialize(new {program=program,state=root}),new UTF8Encoding(false));
 }
 static Dictionary<string,object> RecoverySnapshot(string program,string root,out string backup){
  var plan=ReadUpdate(root);backup=Full((string)plan["backup"]);
  if(!String.Equals(Full((string)plan["program"]),program,StringComparison.OrdinalIgnoreCase)||!String.Equals(Full((string)plan["state"]),root,StringComparison.OrdinalIgnoreCase)||
     !backup.StartsWith(Full(UpdateFolder(root))+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Digest(Path.Combine(backup,"program-snapshot.json"))!=(string)plan["program_snapshot_sha256"])throw new Exception("旧程序备份身份核验失败，当前文件保留。");
  var snapshot=updateJson.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(backup,"program-snapshot.json"),Encoding.UTF8));
  if(!String.Equals(Full((string)snapshot["program"]),program,StringComparison.OrdinalIgnoreCase)||(string)snapshot["release"]!=(string)plan["current"])throw new Exception("旧程序版本或路径不匹配。");
  return snapshot;
 }
 static void StartRecovery(){
  string program=Full(app),root=Full(state),backup;
  var snapshot=RecoverySnapshot(program,root,out backup);
  var plan=ReadUpdate(root);string helper=Full(Path.Combine(UpdateFolder(root),(string)plan["version"],"RefTrayRestore.exe"));
  if(Digest(helper)!=(string)plan["recovery_sha256"])throw new Exception("独立恢复入口校验失败，请保留备份。");
  Process.Start(new ProcessStartInfo(helper,"--restore-update "+Quote(program)+" "+Quote(root)){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.GetDirectoryName(helper)});
 }
 static void WaitUpdateHealth(string program,string root,string number){
  DateTime deadline=DateTime.UtcNow.AddSeconds(40);
  while(DateTime.UtcNow<deadline){
   try{var h=updateJson.Deserialize<Dictionary<string,object>>(Health());if((string)h["release"]==number&&String.Equals(Full((string)h["root"]),root,StringComparison.OrdinalIgnoreCase))return;}catch(System.Net.WebException){}
   Thread.Sleep(300);
  }
  throw new Exception("程序启动未确认，请查看备份目录和 service-errors.log。");
 }
 static void RestoreCore(string program,string root,string reason){
  string backup;var snapshot=RecoverySnapshot(program,root,out backup);string number=(string)snapshot["release"];
  string savedProgram=Full(Path.Combine(backup,"program"));
  // Check every runtime file before executing the backup's Python interpreter.
  foreach(var entry in (Dictionary<string,object>)snapshot["files"]){
   var file=Full(Path.Combine(savedProgram,entry.Key.Replace('/',Path.DirectorySeparatorChar)));
   if(!file.StartsWith(savedProgram+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Digest(file)!=(string)entry.Value)throw new Exception("旧程序副本损坏，已保留当前文件和备份。");
  }
  UpdateStatus(root,"rolling_back","正在恢复上一版程序，素材和当前设置保留…",number,backup);
  Thread.Sleep(700);
  if(!PrepareUpgrade("prepare-update-idle",false))throw new Exception("当前后台仍有任务，请任务结束后再恢复。");
  StopRuntimeClients(program);
  foreach(var entry in (Dictionary<string,object>)snapshot["recovery_files"]){
   string file=Full(Path.Combine(backup,"tools",entry.Key));
   if(!file.StartsWith(Full(Path.Combine(backup,"tools"))+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Digest(file)!=(string)entry.Value)throw new Exception("恢复工具校验失败，已保留程序备份。");
  }
  string script=Path.Combine(backup,"tools","update_recovery.py");
  var restore=new ProcessStartInfo(Path.Combine(savedProgram,"runtime","python.exe"),"-I "+Quote(script)+" --restore-state "+Quote(root)+" --program "+Quote(program)){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=backup};
  using(var child=Process.Start(restore)){
   // Copying and directory replacement own their transaction; never terminate halfway.
   child.WaitForExit();if(child.ExitCode!=0)throw new Exception("恢复未完成，原目录及备份保留。请检查备份目录并重新运行 RefTrayRestore.exe。");
  }
  VerifyInstalled(program);RestartAfterUpdate(program,root);WaitUpdateHealth(program,root,number);
  UpdateStatus(root,"rolled_back",(String.IsNullOrEmpty(reason)?"":"新版更新未完成，")+"已恢复到 "+number+"，素材、设置和记录保留。",number,backup);
 }
 static int RunRecovery(string program,string root,bool interactive){
  try{
   program=Full(program);root=Full(root);bool created;
   using(var owner=new Mutex(true,UpdateMutexName(program),out created)){
    if(!created)throw new Exception("已有更新或恢复正在进行，请稍后查看结果。");
    try{RestoreCore(program,root,"");}
    catch(Exception error){
     try{UpdateStatus(root,"recovery_failed",error.Message,"",(string)ReadUpdate(root)["backup"]);}catch(Exception reporting){Log(reporting.Message);}
     try{VerifyInstalled(program);if(Available())RestartAfterUpdate(program,root);}catch(Exception restart){Log(restart.Message);}
     throw;
    }
   }
   if(interactive)MessageBox.Show("上一版程序已恢复，素材和当前设置保留。请重新加载 Chrome 扩展，并重新连接 AI 的 RefTray 接口。","RefTray 恢复完成");
   return 0;
  }catch(Exception error){Log(error.Message);if(interactive)MessageBox.Show(error.Message,"RefTray 恢复结果",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
 static int RestoreFromShortcut(){
  try{var target=updateJson.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"restore-target.json"),Encoding.UTF8));return RunRecovery((string)target["program"],(string)target["state"],true);}
  catch(Exception error){MessageBox.Show(error.Message,"恢复入口读取失败");return 1;}
 }
 static int FinishInstaller(string program,string root){
  try{program=Full(program);root=Full(root);var plan=ReadUpdate(root);string number=(string)plan["version"];
   VerifyInstalled(program);RestartAfterUpdate(program,root);WaitUpdateHealth(program,root,number);
   UpdateStatus(root,"completed","已更新到 "+number+"，素材、设置和记录保留。",number,(string)plan["backup"]);return 0;}
  catch(Exception error){Log(error.Message);return 1;}
 }
 static int RestoreAfterSetup(string program,string root){
  // An older updater may still own this mutex until Setup exits. Do not compete
  // with its final checks or restore while Setup is still writing program files.
  using(var owner=new Mutex(false,UpdateMutexName(Full(program)))){
   bool acquired=false;
   try{
    var plan=ReadUpdate(root);
    if(plan.ContainsKey("installer_pid")){
     try{using(var setup=Process.GetProcessById(Convert.ToInt32(plan["installer_pid"])))
      if(!setup.WaitForExit(180000))throw new Exception("安装程序仍在退出，请稍后运行独立恢复入口。");}
     catch(ArgumentException){} // Setup exited before recovery opened its handle.
    }
    try{acquired=owner.WaitOne(180000);}catch(AbandonedMutexException){acquired=true;}
    if(!acquired)throw new Exception("更新仍未结束，请稍后运行独立恢复入口。");
    RestoreCore(Full(program),Full(root),"安装未完成");return 0;
   }catch(Exception error){Log(error.Message);
    try{UpdateStatus(root,"recovery_failed",error.Message,"",(string)ReadUpdate(root)["backup"]);}catch(Exception reporting){Log(reporting.Message);}
    try{VerifyInstalled(program);if(Available())RestartAfterUpdate(program,root);}catch(Exception restart){Log(restart.Message);}
    return 1;}
   finally{if(acquired)owner.ReleaseMutex();}
  }
 }
}
