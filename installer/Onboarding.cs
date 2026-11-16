using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Windows.Forms;
using System.Web.Script.Serialization;

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
 static void OpenOnboarding(){
  if(onboarding!=null&&!onboarding.IsDisposed){onboarding.Show();onboarding.Activate();return;}
  try{
   var health=DesktopHealth();bool configured=Convert.ToBoolean(health["library_configured"]);
   var window=new Form{Text="RefTray · 开始使用",ClientSize=new Size(680,540),MinimumSize=new Size(620,520),StartPosition=FormStartPosition.CenterScreen,BackColor=Color.FromArgb(246,245,241),ForeColor=Color.FromArgb(41,40,36),Font=new Font("Microsoft YaHei UI",10),AutoScaleMode=AutoScaleMode.Dpi};
   onboarding=window;
   var body=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true,Padding=new Padding(28)};window.Controls.Add(body);
   body.Controls.Add(new Label{Text="欢迎使用 RefTray",AutoSize=true,Font=new Font(window.Font.FontFamily,19,FontStyle.Bold),Margin=new Padding(0,0,0,18)});
   var status=new Label{AutoSize=true,MaximumSize=new Size(600,0)};
   status.Text=configured?"素材库已保留：\n"+health["inbox"]:"1  先选择素材库\n图片将保存到这里；以后可在设置里更改。";body.Controls.Add(status);
   var choices=new FlowLayoutPanel{AutoSize=true,MaximumSize=new Size(600,0)};body.Controls.Add(choices);choices.Visible=!configured;
   var steps=new Label{AutoSize=true,MaximumSize=new Size(600,0),Margin=new Padding(0,18,0,8),Visible=configured};body.Controls.Add(steps);
   steps.Text="2  加载 Chrome 扩展\n在 Chrome 打开 chrome://extensions，打开右上角“开发者模式”，点击“加载已解压的扩展程序”，选择下方文件夹。\n\n已加载的用户点击 RefTray 卡片的“重新加载”，再刷新作品网页。";
   var extension=new TextBox{ReadOnly=true,Width=590,Text=ExtensionDirectory(),Visible=configured};body.Controls.Add(extension);
   var actions=new FlowLayoutPanel{AutoSize=true,MaximumSize=new Size(600,0),Visible=configured};body.Controls.Add(actions);
   actions.Controls.Add(GuideButton("复制扩展管理地址",()=>Clipboard.SetText("chrome://extensions")));
   actions.Controls.Add(GuideButton("复制扩展文件夹",()=>Clipboard.SetText(ExtensionDirectory())));
   Action<bool> choose=create=>{
    libraryPicking=true;
    try{using(var picker=new FolderBrowserDialog{Description=create?"选择父目录，点击“新建文件夹”，命名后选中它并确认。":"选择已有素材库文件夹",ShowNewFolderButton=create,SelectedPath=Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)}){
     if(picker.ShowDialog(window)!=DialogResult.OK){status.Text="尚未选择素材库。可以重新选择；原文件不会移动。";return;}
     SaveLibrary(picker.SelectedPath);
     status.Text="素材库已保存：\n"+DesktopHealth()["inbox"];choices.Visible=false;steps.Visible=extension.Visible=actions.Visible=true;
    }}finally{libraryPicking=false;}
   };
   choices.Controls.Add(GuideButton("选择已有文件夹",()=>choose(false)));
   choices.Controls.Add(GuideButton("新建文件夹",()=>choose(true)));
   body.Controls.Add(new Label{AutoSize=true,MaximumSize=new Size(600,0),Text="加载后打开作品网页，点击 Chrome 工具栏的 RefTray 保存第一张图片。\n可随时从 Windows 托盘右键 →“开始使用”返回这里。",Margin=new Padding(0,18,0,8)});
   body.Controls.Add(GuideButton("稍后继续 / 关闭",()=>window.Close()));
   window.FormClosed+=(s,e)=>onboarding=null;window.Show();
  }catch(Exception error){MessageBox.Show("无法打开首次使用引导："+error.Message,"RefTray");}
 }
}
