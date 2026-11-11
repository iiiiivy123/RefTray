// Runs from a verified local copy outside the backend job. No arbitrary executable/URL input.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Collections.Generic;
using System.Web.Script.Serialization;

internal static partial class Launcher {
 static readonly JavaScriptSerializer updateJson=new JavaScriptSerializer();
 static string UpdateFolder(string root){return Path.Combine(root,"data","inspiration","updates");}
 static string Full(string path){
  if(!Path.IsPathRooted(path)||path.StartsWith(@"\\"))throw new Exception("更新路径必须是本机绝对路径。");
  var result=Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
  for(var item=new DirectoryInfo(result);item!=null;item=item.Parent)
   if(item.Exists&&(item.Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("更新目录不能经过链接。");
  if(File.Exists(result)&&(File.GetAttributes(result)&FileAttributes.ReparsePoint)!=0)throw new Exception("更新文件不能是链接。");
  return result;
 }
 static Dictionary<string,object> ReadUpdate(string root){return updateJson.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(UpdateFolder(root),"pending.json"),Encoding.UTF8));}
 static string Digest(string path){using(var algorithm=SHA256.Create())using(var input=File.OpenRead(path))return BitConverter.ToString(algorithm.ComputeHash(input)).Replace("-","").ToLowerInvariant();}
 static string Quote(string value){if(value.Contains("\"")||value.EndsWith("\\"))throw new Exception("更新参数无效。");return "\""+value+"\"";}
 static string VerifyUpdate(Dictionary<string,object> plan,string program,string root){
  if(!String.Equals(Full((string)plan["program"]),Full(program),StringComparison.OrdinalIgnoreCase)||
     !String.Equals(Full((string)plan["state"]),Full(root),StringComparison.OrdinalIgnoreCase))throw new Exception("更新目标不一致，未替换程序。");
  string number=(string)plan["version"];
  if(!System.Text.RegularExpressions.Regex.IsMatch(number,@"^\d{1,5}\.\d{1,5}\.\d{1,5}$")||new Version(number)<=new Version((string)plan["current"]))throw new Exception("更新版本无效。");
  string package=Full(Path.Combine(UpdateFolder(root),number,"InspirationCollector-"+number+"-Windows-x64-Setup.exe"));
  if(!File.Exists(package)||new FileInfo(package).Length!=Convert.ToInt64(plan["size"])||Digest(package)!=(string)plan["sha256"])throw new Exception("安装包校验失败，未替换程序。");
  return package;
 }
 static void UpdateStatus(string root,string phase,string message,string number,string backup=""){
  var path=Path.Combine(UpdateFolder(root),"status.json");var temporary=path+".worker.tmp";
  File.WriteAllText(temporary,updateJson.Serialize(new {phase=phase,message=message,version=number,backup=backup,worker_pid=Process.GetCurrentProcess().Id,time=(DateTime.UtcNow-new DateTime(1970,1,1)).TotalSeconds}),new UTF8Encoding(false));
  for(int attempt=0;;attempt++){
   try{if(File.Exists(path))File.Replace(temporary,path,null);else File.Move(temporary,path);break;}
   catch(IOException){if(attempt>=19)throw;Thread.Sleep(50);}
   catch(UnauthorizedAccessException){if(attempt>=19)throw;Thread.Sleep(50);}
  }
 }
 static void StartUpdate(){
  string root=Full(state),program=Full(app);var plan=ReadUpdate(root);
  string package=VerifyUpdate(plan,program,root);
  if((string)plan["current"]!=Release())throw new Exception("当前程序版本已变化，请重新检查更新。");
  string worker=Full(Path.Combine(Path.GetDirectoryName(package),"RefTrayUpdate.exe"));
  File.Copy(Path.Combine(program,"InspirationCollector.exe"),worker,true);
  PrepareRecoveryShortcut(Path.GetDirectoryName(package),program,root);
  plan["recovery_sha256"]=Digest(worker);
  File.WriteAllText(Path.Combine(UpdateFolder(root),"pending.json"),updateJson.Serialize(plan),new UTF8Encoding(false));
  Process.Start(new ProcessStartInfo(worker,"--apply-update "+Quote(program)+" "+Quote(root)){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.GetDirectoryName(worker)});
 }
 static int RunUpdate(string program,string root){
  program=Full(program);root=Full(root);string number="",backup="";bool stopped=false;
  bool created;using(var updateMutex=new Mutex(true,UpdateMutexName(program),out created)){
   if(!created)return 3;
   try{
    var plan=ReadUpdate(root);number=(string)plan["version"];string package=VerifyUpdate(plan,program,root);
    UpdateStatus(root,"installing","正在等待后台安全退出…",number);
    Thread.Sleep(700); // Let the launcher's accept reply finish before requesting idle shutdown.
    if(!PrepareUpgrade("prepare-update-idle",false))throw new Exception("后台仍有任务或未确认退出，更新已停止，请任务结束后重试。");
    stopped=true;UpdateStatus(root,"installing","正在备份设置和采集记录…",number);
    var prepare=new ProcessStartInfo(Path.Combine(program,"runtime","python.exe"),"-I "+Quote(Path.Combine(program,"server","updates.py"))+" --backup-state "+Quote(root)+" --program "+Quote(program)){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=program};
    using(var child=Process.Start(prepare)){
     // Never leave a backup worker holding the old runtime when starting Setup.
     if(!child.WaitForExit(120000)){child.Kill();child.WaitForExit();throw new Exception("备份超时，未安装更新。");}
     if(child.ExitCode!=0)throw new Exception("设置或记录备份检查失败，未安装更新。");
    }
    plan=ReadUpdate(root);backup=(string)plan["backup"];VerifyUpdate(plan,program,root);
    UpdateStatus(root,"installing","备份已核验，正在安装更新…",number,backup);
    var install=new ProcessStartInfo(package,"/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /DIR="+Quote(program)+" /LOG="+Quote(Path.Combine(Path.GetDirectoryName(package),"installer.log"))){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.GetDirectoryName(package)};
    install.EnvironmentVariables["LIBLIB_ROOT"]=root;
    install.EnvironmentVariables["REFTRAY_UPDATE_OWNS_RECOVERY"]="1";
    using(var child=Process.Start(install)){
     // Setup owns its own rollback; do not kill it midway through replacement.
     child.WaitForExit();if(child.ExitCode!=0)throw new Exception("安装未完成（代码 "+child.ExitCode+"），备份已保留。详情见更新目录 installer.log。");
    }
    var manifest=updateJson.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(program,"extension","manifest.json")));
    if((string)manifest["version"]!=number)throw new Exception("安装后版本核验失败，请保留备份并重试安装。");
    VerifyInstalled(program);
    UpdateStatus(root,"restarting","正在启动新版后台…",number,backup);
    RestartAfterUpdate(program,root);
    WaitUpdateHealth(program,root,number);
    UpdateStatus(root,"completed","更新完成，素材和设置已保留。",number,backup);return 0;
   }catch(Exception error){
    if(stopped&&!String.IsNullOrEmpty(backup)){
     try{RestoreCore(program,root,error.Message);return 1;}
     catch(Exception recovery){Log("Update rollback: "+recovery.Message);try{UpdateStatus(root,"recovery_failed",recovery.Message,number,backup);}catch(Exception reporting){Log(reporting.Message);}}
    }else{
    try{UpdateStatus(root,"failed",error.Message,number,backup);}catch(Exception statusError){Log("Update status: "+statusError.Message);}
    }
    // Recover the old service after cancellation/preflight failure, but only from an intact payload.
    if(stopped){try{VerifyInstalled(program);if(Available())RestartAfterUpdate(program,root);}catch(Exception recovery){Log("Update recovery: "+recovery.Message);}}
    return 1;
   }
  }
 }
 static void VerifyInstalled(string program){
  var manifest=updateJson.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(program,"managed-files.json")));
  var files=(Dictionary<string,object>)manifest["files"];
  foreach(var entry in files){var file=Full(Path.Combine(program,entry.Key.Replace('/',Path.DirectorySeparatorChar)));
   if(!file.StartsWith(program+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||!File.Exists(file)||Digest(file)!=(string)entry.Value)throw new Exception("程序文件核验失败，请保留备份并重新安装。");
  }
 }
 static void RestartAfterUpdate(string program,string root){
  var start=new ProcessStartInfo(Path.Combine(program,"InspirationCollector.exe"),"--update-start"){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=program};
  start.EnvironmentVariables["LIBLIB_ROOT"]=root;Process.Start(start);
 }
}
