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
class Check {static int stops;static void Stop(){stops++;}static void Stop(string mode){stops++;}
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
        subprocess.run([str(compiler), '/nologo', '/codepage:65001', '/target:winexe', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/out:'+str(directory / 'launcher.exe'), str(root / 'installer/Launcher.cs')], check=True, timeout=20)


if __name__ == '__main__':
    main()

