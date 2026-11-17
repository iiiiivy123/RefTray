using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Diagnostics;
using Microsoft.Win32;

internal static partial class Launcher {
 static void RequestGuide(){
  try{using(var pipe=new System.IO.Pipes.NamedPipeClientStream(".","InspirationCollectorControl",System.IO.Pipes.PipeDirection.InOut)){
   pipe.Connect(3000);using(var writer=new StreamWriter(pipe)){writer.WriteLine("open-onboarding");writer.Flush();}
  }}catch(Exception error){MessageBox.Show("请从托盘打开“开始使用”："+error.Message,"RefTray");}
 }
 static Form onboarding;
 static volatile bool libraryPicking;
 static bool quietStart, requestedGuide;
 static readonly JavaScriptSerializer json = new JavaScriptSerializer();
 static Dictionary<string,object> DesktopHealth(){return json.Deserialize<Dictionary<string,object>>(Health());}
 static void SaveLibrary(string directory){
  var health=DesktopHealth();
  using(var client=new LocalClient()){
   client.Proxy=null;client.Headers["Content-Type"]="application/json";
   client.Headers["X-Collector-Token"]=(string)health["settings_token"];
   try{client.UploadString("http://127.0.0.1:"+port+"/settings/directory","POST",json.Serialize(new {directory=directory}));}
   catch(WebException error){
    if(error.Response!=null)using(var reader=new StreamReader(error.Response.GetResponseStream())){
     var reply=json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
     throw new Exception(reply.ContainsKey("detail")?Convert.ToString(reply["detail"]):"素材库未保存，请重试。");
    }
    throw;
   }
  }
 }
 static Button GuideButton(string text, Action action){
  var button=new Button{Text=text,AutoSize=true,Padding=new Padding(12,6,12,6),FlatStyle=FlatStyle.Flat,BackColor=Color.White,Margin=new Padding(0,8,12,8)};
  button.Click+=(s,e)=>{try{action();}catch(Exception error){MessageBox.Show(error.Message,"RefTray",MessageBoxButtons.OK,MessageBoxIcon.Warning);}};
  return button;
 }
 static void OpenChromeExtensions(){
  var chrome=Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe","",null) as string
   ?? Registry.GetValue(@"HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe","",null) as string;
  if(String.IsNullOrEmpty(chrome)||!File.Exists(chrome)){
   foreach(var root in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}){
    var candidate=Path.Combine(root,@"Google\Chrome\Application\chrome.exe");if(File.Exists(candidate)){chrome=candidate;break;}
   }
  }
  if(String.IsNullOrEmpty(chrome)||!File.Exists(chrome))throw new Exception("未找到 Chrome。请先安装 Chrome，再回来继续；扩展管理地址是 chrome://extensions。");
  Process.Start(new ProcessStartInfo(chrome,"chrome://extensions"){UseShellExecute=true});
 }
 static string GuideConnection(Dictionary<string,object> health,string expected){
  if(Convert.ToString(health["release"])!=expected)return "后台版本不一致，请先启动刚安装的 RefTray。";
  object raw;if(!health.TryGetValue("last_paired_extension",out raw)||!(raw is Dictionary<string,object>))return "尚未连上扩展。加载后，请打开一次 Chrome 工具栏的 RefTray，再检查。";
  var paired=(Dictionary<string,object>)raw;object version,seen;
  if(!paired.TryGetValue("release",out version)||Convert.ToString(version)!=expected)return "扩展仍是旧版。请在 RefTray 卡片点击“重新加载”，再刷新作品网页。";
  var now=(DateTime.UtcNow-new DateTime(1970,1,1)).TotalSeconds;
  if(!paired.TryGetValue("seen_at",out seen)||now-Convert.ToDouble(seen)>90)return "连接记录已过期。请打开一次 Chrome 工具栏的 RefTray，再检查。";
  return null;
 }
 static void OpenOnboarding(){
  if(onboarding!=null&&!onboarding.IsDisposed){onboarding.Show();onboarding.Activate();return;}
  try{
   var health=DesktopHealth();bool configured=Convert.ToBoolean(health["library_configured"]);
   var window=new Form{Text="RefTray · 开始使用",ClientSize=new Size(680,590),MinimumSize=new Size(696,629),StartPosition=FormStartPosition.CenterScreen,BackColor=Color.FromArgb(246,248,252),ForeColor=Color.FromArgb(25,37,59),Font=new Font("Microsoft YaHei UI",11),AutoScaleMode=AutoScaleMode.Dpi};
   onboarding=window;
   var body=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true,Padding=new Padding(32)};window.Controls.Add(body);
   body.Controls.Add(new Label{Text="欢迎使用 RefTray",AutoSize=true,Font=new Font(window.Font.FontFamily,19,FontStyle.Bold),Margin=new Padding(0,0,0,18)});
   var status=new Label{AutoSize=true,MaximumSize=new Size(600,0)};
   status.Text=configured?"素材库已保留："+health["inbox"]:"先选择素材库\n图片将保存到这里；以后可在设置里更改。";status.ForeColor=Color.FromArgb(90,103,124);body.Controls.Add(status);
   var choices=new FlowLayoutPanel{AutoSize=true,MaximumSize=new Size(600,0)};body.Controls.Add(choices);choices.Visible=!configured;
   var guide=new FlowLayoutPanel{AutoSize=true,FlowDirection=FlowDirection.TopDown,WrapContents=false,MaximumSize=new Size(600,0),Margin=new Padding(0,28,0,0),Visible=configured};body.Controls.Add(guide);
   var step=new Label{Name="guide-step",AutoSize=true,ForeColor=Color.FromArgb(36,86,214),Margin=new Padding(0,0,0,10)};
   var title=new Label{Name="guide-title",AutoSize=true,MaximumSize=new Size(590,0),Font=new Font(window.Font.FontFamily,18,FontStyle.Bold),Margin=new Padding(0,0,0,14)};
   var description=new Label{Name="guide-description",AutoSize=true,MaximumSize=new Size(590,0),Margin=new Padding(0,0,0,12)};
   var extension=new TextBox{Name="guide-path",ReadOnly=true,Width=580,Text=ExtensionDirectory(),Visible=false};
   var feedback=new Label{Name="guide-feedback",AutoSize=true,MaximumSize=new Size(590,0),ForeColor=Color.FromArgb(148,73,8),Margin=new Padding(0,8,0,4)};
   int stage=0;Action render=null;
   var primary=GuideButton("",()=>{});primary.Name="guide-primary";primary.MinimumSize=new Size(270,48);primary.BackColor=Color.FromArgb(36,86,214);primary.ForeColor=Color.White;primary.FlatAppearance.BorderSize=0;
   var shortcut=new LinkLabel{Name="guide-shortcut",Text="已经加载或重新加载？直接检查连接",AutoSize=true,LinkColor=Color.FromArgb(36,86,180),Margin=new Padding(0,12,0,12)};
   var back=new LinkLabel{Name="guide-back",Text="返回上一步",AutoSize=true,LinkColor=Color.FromArgb(90,103,124),Margin=new Padding(0,8,0,8)};
   render=()=>{
    step.Text=stage==3?"连接就绪":"连接 Chrome · "+(stage+1)+" / 3";
    title.Text=new[]{"先打开扩展管理","再选择扩展文件夹","最后检查连接","可以开始保存了"}[stage];
    description.Text=new[]{"首次使用：在 Chrome 页面右上角打开“开发者模式”。\n更新用户：点击 RefTray 卡片的“重新加载”。","点击 Chrome 的“加载已解压的扩展程序”。\n下一步会打开文件夹并复制路径，方便你直接选择。","加载或重新加载后，打开一次工具栏的 RefTray。\n再点击下面的按钮，确认版本和连接。","在作品网页点击蓝色“保存”，即可按默认设置保存。\n拖动左侧圆点，可以移动按钮。"}[stage];
    primary.Text=new[]{"打开 Chrome 扩展管理","打开并复制扩展文件夹","检查连接","完成"}[stage];
    extension.Visible=stage==1;shortcut.Visible=stage<2;back.Visible=stage>0&&stage<3;feedback.Text="";
   };
   primary.Click+=(s,e)=>{
    primary.Enabled=false;
    try{
     if(stage==0){OpenChromeExtensions();stage=1;render();}
     else if(stage==1){Process.Start(new ProcessStartInfo("explorer.exe","\""+ExtensionDirectory()+"\""){UseShellExecute=true});Clipboard.SetText(ExtensionDirectory());stage=2;render();}
     else if(stage==2){var issue=GuideConnection(DesktopHealth(),Release());if(issue!=null){feedback.Text=issue;return;}stage=3;render();feedback.ForeColor=Color.FromArgb(20,115,69);feedback.Text="已连接 RefTray "+Release();}
     else window.Close();
    }catch(Exception error){feedback.Text="这一步未完成："+error.Message;}finally{primary.Enabled=true;if(!window.IsDisposed)primary.Focus();}
   };
   shortcut.LinkClicked+=(s,e)=>{stage=2;render();};back.LinkClicked+=(s,e)=>{stage--;render();};
   guide.Controls.AddRange(new Control[]{step,title,description,extension,feedback,primary,shortcut,back});render();
   Action<bool> choose=create=>{
    libraryPicking=true;
    try{using(var picker=new FolderBrowserDialog{Description=create?"选择父目录，点击“新建文件夹”，命名后选中它并确认。":"选择已有素材库文件夹",ShowNewFolderButton=create,SelectedPath=Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)}){
     if(picker.ShowDialog(window)!=DialogResult.OK){status.Text="尚未选择素材库。可以重新选择；原文件不会移动。";return;}
     SaveLibrary(picker.SelectedPath);
     status.Text="素材库已保存："+DesktopHealth()["inbox"];choices.Visible=false;guide.Visible=true;
    }}finally{libraryPicking=false;}
   };
   choices.Controls.Add(GuideButton("选择已有文件夹",()=>choose(false)));
   choices.Controls.Add(GuideButton("新建文件夹",()=>choose(true)));
   body.Controls.Add(new Label{AutoSize=true,MaximumSize=new Size(600,0),ForeColor=Color.FromArgb(90,103,124),Text="可随时从 Windows 托盘右键 →“开始使用”返回。",Margin=new Padding(0,20,0,8)});
   var later=new LinkLabel{Text="稍后继续",AutoSize=true,LinkColor=Color.FromArgb(90,103,124),Margin=new Padding(0,8,0,8)};later.LinkClicked+=(s,e)=>window.Close();body.Controls.Add(later);
   window.FormClosed+=(s,e)=>onboarding=null;window.Show();
  }catch(Exception error){MessageBox.Show("无法打开首次使用引导："+error.Message,"RefTray");}
 }
}
