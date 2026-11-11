"""Render the project's controlled Markdown subset into offline reading pages.

Only distribution documentation is an input. No runtime dependency or remote
assets are needed; raw HTML stays escaped and links use a scheme allowlist.
"""
import html
import posixpath
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

PAGES=('README.md','docs/usage.md','docs/install.md','docs/update.md','docs/mcp.md',
       'docs/use-cases.md','docs/rights-and-privacy.md','docs/SAVE-LAYOUT-REVIEW-2026-11-11.md','docs/release-0.5.54.md','docs/release-0.5.55.md','docs/release-1.0.0.md')
NAMES={name:('index.html' if name=='README.md' else Path(name).stem+'.html') for name in PAGES}
STYLE='''body{margin:0;background:#f7f7f7;color:#222;font:16px/1.85 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:880px;margin:48px auto;padding:0 28px 60px}nav{display:flex;gap:22px;flex-wrap:wrap;border-bottom:1px solid #ddd;padding-bottom:18px;margin-bottom:36px}a{color:inherit;text-decoration:underline;text-underline-offset:4px}h1{font-size:30px;line-height:1.4;margin:32px 0}h2{font-size:22px;margin:38px 0 16px}h3{font-size:18px;margin-top:26px}p,li{overflow-wrap:anywhere}li{margin:7px 0}table{border-collapse:collapse;width:100%;font-size:15px}td,th{text-align:left;border-bottom:1px solid #ddd;padding:12px 14px;vertical-align:top}th{font-weight:600}code{font-family:Consolas,monospace;background:#eee;padding:2px 4px}pre{background:#eee;padding:18px;white-space:pre-wrap;overflow-wrap:anywhere}pre code{padding:0}footer{margin-top:40px;padding-top:20px;border-top:1px solid #ddd;color:#777;font-size:13px}@media(max-width:600px){main{margin:24px auto;padding:0 18px 40px}table{font-size:14px}td,th{padding:8px}}'''

def destination(value,source):
    url=urlsplit(value)
    if url.scheme:return value if url.scheme in ('https','http','mailto') else ''
    if value.startswith('//'):return ''
    if not url.path:return value
    path=posixpath.normpath(posixpath.join(posixpath.dirname(source),url.path))
    if path in NAMES:return NAMES[path]+('#'+url.fragment if url.fragment else '')
    if path.startswith('../'):return ''
    return 'https://github.com/iiiiivy123/inspiration-collector/blob/main/'+path+('#'+url.fragment if url.fragment else '')

def inline(text,source):
    tokens=re.split(r'(`[^`\n]+`|\*\*[^\n]+?\*\*|\[[^\]\n]+\]\([^\s)]+\))',text)
    result=[]
    for token in tokens:
        if token.startswith('`') and token.endswith('`'):result.append('<code>'+html.escape(token[1:-1])+'</code>')
        elif token.startswith('**') and token.endswith('**'):result.append('<strong>'+inline(token[2:-2],source)+'</strong>')
        elif (link:=re.fullmatch(r'\[([^\]]+)\]\(([^)]+)\)',token)):
            target=destination(link[2],source);label=html.escape(link[1])
            result.append('<a href="'+html.escape(target,quote=True)+'">'+label+'</a>' if target else label)
        else:result.append(html.escape(token))
    return ''.join(result)

def body(markdown,source):
    lines=markdown.splitlines();out=[];i=0;listing=None
    def close_list():
        nonlocal listing
        if listing:out.append('</'+listing+'>');listing=None
    while i<len(lines):
        line=lines[i].strip()
        if not line:close_list();i+=1;continue
        if line.startswith('```'):
            close_list();code=[];i+=1
            while i<len(lines) and not lines[i].strip().startswith('```'):code.append(lines[i]);i+=1
            out.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>');i+=1;continue
        if (heading:=re.match(r'^(#{1,6})\s+(.+)$',line)):
            close_list();level=len(heading[1]);anchor=re.sub(r'[^\w\- ]','',heading[2]).strip().lower().replace(' ','-')
            out.append(f'<h{level} id="{html.escape(anchor,quote=True)}">'+inline(heading[2],source)+f'</h{level}>');i+=1;continue
        if '|' in line and i+1<len(lines) and re.fullmatch(r'[|:\s-]+',lines[i+1]) and '---' in lines[i+1]:
            close_list();cells=lambda row:[c.strip() for c in row.strip().strip('|').split('|')]
            out.append('<table><thead><tr>'+''.join('<th>'+inline(c,source)+'</th>' for c in cells(line))+'</tr></thead><tbody>');i+=2
            while i<len(lines) and '|' in lines[i] and lines[i].strip():
                out.append('<tr>'+''.join('<td>'+inline(c,source)+'</td>' for c in cells(lines[i]))+'</tr>');i+=1
            out.append('</tbody></table>');continue
        if (item:=re.match(r'^([-*]|\d+\.)\s+(.+)$',line)):
            tag='ol' if item[1][0].isdigit() else 'ul'
            if listing!=tag:close_list();out.append('<'+tag+'>');listing=tag
            out.append('<li>'+inline(item[2],source)+'</li>');i+=1;continue
        close_list()
        if re.fullmatch(r'-{3,}',line):out.append('<hr>')
        else:out.append('<p>'+inline(line,source)+'</p>')
        i+=1
    close_list();return '\n'.join(out)

def documents(root):
    result={}
    for name in PAGES:
        markdown=(Path(root)/name).read_text('utf-8-sig')
        if name=='README.md':markdown=markdown.split('## Windows 构建前检查',1)[0]
        title=markdown.splitlines()[0].lstrip('# ')
        result[NAMES[name]]='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(title)+'</title><style>'+STYLE+'</style></head><body><main><nav><a href="index.html">RefTray</a><a href="usage.html">使用说明</a><a href="install.html">首次安装</a><a href="update.html">更新与恢复</a><a href="mcp.html">AI 接入</a></nav>'+body(markdown,name)+'<footer>RefTray · 随安装包提供的离线说明</footer></main></body></html>'
    return result

class PlainText(HTMLParser):
    def __init__(self):super().__init__();self.parts=[]
    def handle_data(self,data):self.parts.append(data)
    def handle_endtag(self,tag):
        if tag in ('td','th'):self.parts.append('    ')
        elif tag in ('p','li','tr','pre','h1','h2','h3','h4'):self.parts.append('\n\n')

def plain(markdown,source):
    parser=PlainText();parser.feed(body(markdown,source))
    return re.sub(r'\n[ \t]*\n(?:\s*\n)+','\n\n',''.join(parser.parts)).strip()+'\n'
