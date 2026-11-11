"""Offline guides must read cleanly and remain navigable without a network."""
import re, sys, unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import build_help

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.text=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a': self.links.append(dict(attrs).get('href',''))
    def handle_data(self,data): self.text.append(data)

class HelpPagesTests(unittest.TestCase):
    def test_every_packaged_local_link_resolves_and_no_raw_html_decorations_leak(self):
        pages=build_help.documents(ROOT)
        self.assertIn('usage.html',pages)
        for name,source in pages.items():
            parser=Links();parser.feed(source)
            for href in parser.links:
                url=urlsplit(href)
                if not url.scheme and url.path:self.assertIn(url.path,pages,(name,href))
            self.assertNotIn('<p align=', ''.join(parser.text))
        self.assertNotIn('Windows 构建前检查', pages['index.html'])
        self.assertIn('关于与更新',pages['update.html'])

    def test_current_layout_and_legacy_links_both_work_offline(self):
        pages=build_help.documents(ROOT)
        self.assertIn('save-layout.html',pages)
        self.assertIn('SAVE-LAYOUT-REVIEW-2026-11-11.html',pages)
        for name in ('index.html','usage.html','SAVE-LAYOUT-REVIEW-2026-11-11.html'):
            self.assertIn('href="save-layout.html"',pages[name],name)
        self.assertEqual(pages['save-layout.html'],pages['SAVE-LAYOUT-REVIEW-2026-11-11.html'])
        self.assertIn('P03-第三讲',pages['save-layout.html'])

    def test_build_commands_live_in_the_developer_guide(self):
        readme=(ROOT/'README.md').read_text('utf-8')
        development=(ROOT/'docs/development/README.md').read_text('utf-8')
        self.assertIn('(docs/development/README.md)',readme)
        for command in ('python tools/build_windows.py --check-dependencies','test_architecture_boundaries.py'):
            self.assertNotIn(command,readme)
            self.assertIn(command,development)
        self.assertNotIn('F:/RefTray',development)
        self.assertNotIn('F:/RefTray',readme)

    def test_current_documentation_relative_file_links_resolve(self):
        names=('README.md','README_EN.md','AGENTS.md','docs/README.md','docs/development/README.md',
               'docs/usage.md','docs/install.md','docs/update.md','docs/mcp.md','docs/save-layout.md',
               'docs/use-cases.md','docs/use-cases-en.md','docs/rights-and-privacy.md',
               'docs/marketing/brand-guide.md','docs/marketing/press-kit.md','docs/marketing/launch-copy.md','docs/development/publishing.md',
               'docs/marketing/demo-script.md','docs/releases/release-1.0.1.md','docs/development/archive/SAVE-LAYOUT-REVIEW-2026-11-11.md')
        for name in names:
            source=(ROOT/name).read_text('utf-8-sig')
            self.assertNotIn('\ufffd',source,name)
            for href in re.findall(r'\[[^]\n]+\]\(([^\s)]+)\)',source):
                url=urlsplit(href)
                if not url.scheme and url.path:
                    self.assertTrue((ROOT/name).parent.joinpath(url.path).is_file(),(name,href))

    def test_markup_is_rendered_and_plain_fallback_has_no_markdown_noise(self):
        text='# 教程\n\n## 保存\n\n- **图片**：选 `高清`。\n- [更新](update.md)\n\n| 模式 | 用途 |\n| --- | --- |\n| 图文 | 正文 |\n\n```text\n示例路径\n```'
        rendered=build_help.body(text,'docs/usage.md')
        self.assertIn('<strong>图片</strong>',rendered)
        self.assertIn('href="update.html"',rendered)
        self.assertIn('<table>',rendered)
        plain=build_help.plain(text,'docs/usage.md')
        for noise in ('## ','**','`','| --- |','[更新]'):self.assertNotIn(noise,plain)
        for word in ('教程','图片','示例路径','正文'):self.assertIn(word,plain)

    def test_raw_html_and_unsafe_links_never_execute(self):
        rendered=build_help.body('<script>alert(1)</script>\n[bad](javascript:evil)\n[bad](file:///secret)\n[bad](//evil.test/x)','README.md')
        self.assertNotIn('<script>',rendered)
        self.assertNotIn('href=',rendered)
        self.assertIn('&lt;script&gt;',rendered)

class HelpEndpointTests(unittest.TestCase):
    def test_only_authorized_requests_open_the_fixed_packaged_guide(self):
        import tempfile
        from types import SimpleNamespace
        from unittest.mock import patch
        from fastapi import HTTPException, Request
        from server.app import create_app
        from server.config import Settings
        from server.catalog import Catalog
        from server.video import VideoDownloads
        with tempfile.TemporaryDirectory() as tmp:
            settings=Settings(Path(tmp));catalog=Catalog(settings.root)
            app=create_app(SimpleNamespace(settings=settings,storage=SimpleNamespace(catalog=catalog),videos=VideoDownloads(catalog)))
            routes={r.path:r.endpoint for r in app.routes if hasattr(r,'endpoint')}
            token=routes['/health'](Request({'type':'http','method':'GET','headers':[],'query_string':b''}))['settings_token']
            request=Request({'type':'http','method':'POST','headers':[(b'x-collector-token',token.encode())]})
            with patch('server.app.os.startfile',create=True) as opened:
                with self.assertRaises(HTTPException) as denied:routes['/help/open'](Request({'type':'http','method':'POST','headers':[]}))
                self.assertEqual(denied.exception.status_code,403);opened.assert_not_called()
                with patch.object(Path,'is_file',return_value=False):
                    with self.assertRaises(HTTPException) as missing:routes['/help/open'](request)
                    self.assertEqual(missing.exception.status_code,404);opened.assert_not_called()
                with patch.object(Path,'is_file',return_value=True):
                    self.assertEqual(routes['/help/open'](request),{'opened':True})
                opened.assert_called_once_with(str(ROOT/'source/help/index.html'))

if __name__=='__main__':unittest.main()
