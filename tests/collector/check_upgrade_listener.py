"""Exercise the real upgrade-listener method in an isolated named-pipe harness."""
import subprocess
import tempfile
import uuid
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[2]
    source = (root / 'installer/Launcher.cs').read_text('utf-8')
    listener = source[source.index(' static void UpgradeListener('):source.index(' static readonly object logLock')]
    listener = listener.replace('InspirationCollectorControl', 'RefTrayCheck-' + uuid.uuid4().hex)
    pipe_name = listener.split('NamedPipeServerStream("')[1].split('"')[0]
    harness = '''using System;using System.IO;using System.IO.Pipes;using System.Text;using System.Threading;using System.Windows.Forms;
class Control {public bool IsDisposed;public void BeginInvoke(Action a){IsDisposed=true;a();}}
class Application {public static ManualResetEvent Done=new ManualResetEvent(false);public static void ExitThread(){Done.Set();}}
class Check {static int stops;static string launcherSecret="fixture";static void StartUpdate(){} static void StartRecovery(){}static void Log(string value){}static void Stop(){stops++;}static void Stop(string mode){stops++;}
''' + listener + '''
static string Send(string command){using(var p=new NamedPipeClientStream(".","PIPE",PipeDirection.InOut)){
p.Connect(3000);using(var w=new StreamWriter(p,Encoding.UTF8,1024,true))using(var r=new StreamReader(p,Encoding.UTF8,false,1024,true)){
w.AutoFlush=true;w.WriteLine(command);return r.ReadLine();}}}
static int Main(){UpgradeListener(new Control());using(var idle=new NamedPipeClientStream(".","PIPE",PipeDirection.InOut)){idle.Connect(3000);Thread.Sleep(3500);if(Send("invalid")!="无效更新请求")return 1;
Console.WriteLine("idle client did not occupy listener; first invalid request handled");}Thread.Sleep(150);
if(Send("invalid-again")!="无效更新请求")return 2;Console.WriteLine("second invalid request handled");Thread.Sleep(150);
if(Send("prepare-upgrade")!="ready")return 3;
if(!Application.Done.WaitOne(3000)||stops!=1)return 4;Console.WriteLine("invalid requests preserved listener; valid upgrade acknowledged");return 0;}}
'''.replace('PIPE', pipe_name)
    compiler = Path(r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe')
    with tempfile.TemporaryDirectory(prefix='reftray-listener-check-') as temporary:
        directory = Path(temporary)
        cs = directory / 'check.cs'
        cs.write_text(harness, 'utf-8-sig')
        binary = directory / 'check.exe'
        subprocess.run([str(compiler), '/nologo', '/codepage:65001', '/r:System.Windows.Forms.dll', '/out:'+str(binary), str(cs)], check=True, timeout=20)
        subprocess.run([str(binary)], check=True, timeout=20)
        # FastAPI sends UTF-8 JSON without a charset. .NET Framework otherwise
        # uses the machine ANSI code page and misreads Chinese state directories.
        client=source[source.index(' class LocalClient:'):source.index(' static string Release(')]
        encoding_harness=r'''using System;using System.IO;using System.Net;using System.Net.Sockets;using System.Text;using System.Threading;
class CheckEncoding {
CLIENT
static int Main(){
 var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();
 string address="http://127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port+"/health";
 string expected="{\"root\":\"素材库/中文目录 空格\"}";
 var thread=new Thread(()=>{using(var socket=listener.AcceptTcpClient())using(var stream=socket.GetStream()){
  var reader=new StreamReader(stream,Encoding.ASCII,false,1024,true);while(reader.ReadLine()!=""){}
  byte[] body=Encoding.UTF8.GetBytes(expected),header=Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "+body.Length+"\r\nConnection: close\r\n\r\n");
  stream.Write(header,0,header.Length);stream.Write(body,0,body.Length);
 }});thread.IsBackground=true;thread.Start();
 try{using(var c=new LocalClient()){c.Proxy=null;if(c.DownloadString(address)!=expected)return 9;}}
 finally{listener.Stop();thread.Join(2000);}
 Console.WriteLine("UTF-8 health JSON preserves Chinese state paths");return 0;
}}
'''.replace('CLIENT',client)
        cs.write_text(encoding_harness,'utf-8-sig')
        subprocess.run([str(compiler),'/nologo','/codepage:65001','/out:'+str(binary),str(cs)],check=True,timeout=20)
        subprocess.run([str(binary)],check=True,timeout=20)
        subprocess.run([str(compiler), '/nologo', '/codepage:65001', '/target:winexe', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Web.Extensions.dll', '/r:System.Management.dll', '/out:'+str(directory / 'launcher.exe'), str(root / 'installer/Launcher.cs'), str(root / 'installer/Update.cs'), str(root / 'installer/Recovery.cs'), str(root / 'installer/RuntimeClients.cs')], check=True, timeout=20)


if __name__ == '__main__':
    main()

