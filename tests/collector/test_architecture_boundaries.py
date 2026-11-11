import ast
import json
import re
import unittest
from pathlib import Path

class ArchitectureBoundaryTests(unittest.TestCase):
    def test_readers_and_batch_rules_do_not_own_task_singletons(self):
        root=Path(__file__).resolve().parents[2]/'source/extension'
        for name in ('page-reader.js','batch-state.js'):
            code=(root/name).read_text('utf-8')
            self.assertFalse(re.search(r'\b(taskContext|healthCache|batchJob)\b',code),name)
        code=(root/'batch-state.js').read_text('utf-8')
        self.assertFalse(re.search(r'\b(chrome|fetch|service)\s*[.(]',code))

    def test_recovery_does_not_require_the_api_or_downloader_to_start(self):
        root=Path(__file__).resolve().parents[2]/'source/server'
        for name in ('update_recovery.py','update_storage.py'):
            tree=ast.parse((root/name).read_text('utf-8'))
            imports={n.module for n in ast.walk(tree) if isinstance(n,ast.ImportFrom)}
            self.assertFalse(imports & {'fastapi','server.app','server.updates','server.mcp_tools','server.video'},name)

    def test_resolver_does_not_depend_on_download_runtime(self):
        root=Path(__file__).resolve().parents[2]/'source/server'
        for name in ('bili_resolver','preflight','media_urls'):
            tree=ast.parse((root/(name+'.py')).read_text('utf-8-sig'))
            imports={n.module for n in ast.walk(tree) if isinstance(n,ast.ImportFrom)}
            self.assertFalse(imports & {'video','storage','catalog'}, (name, imports))

    def test_capture_does_not_delegate_media_execution_to_mcp_transport(self):
        root=Path(__file__).resolve().parents[2]/'source/extension'
        self.assertFalse('BrowserRunner.downloadVideos' in (root/'background.js').read_text('utf-8-sig'))

    def test_server_relative_imports_have_no_cycle(self):
        root=Path(__file__).resolve().parents[2]/'source/server'
        graph={}
        for path in root.glob('*.py'):
            dependencies=set()
            for node in ast.walk(ast.parse(path.read_text('utf-8-sig'))):
                if isinstance(node,ast.ImportFrom):
                    if node.level:
                        dependencies.update([node.module.split('.')[0]] if node.module else [a.name for a in node.names])
                    elif node.module=='server':
                        dependencies.update(a.name for a in node.names)
                    elif (node.module or '').startswith('server.'):
                        dependencies.add(node.module.split('.')[1])
                elif isinstance(node,ast.Import):
                    dependencies.update(a.name.split('.')[1] for a in node.names if a.name.startswith('server.'))
            graph[path.stem]=dependencies
        for owner, dependencies in graph.items():
            self.assertFalse(dependencies-set(graph), (owner, dependencies-set(graph)))
        done=set()
        def visit(node,path):
            self.assertNotIn(node,path,' -> '.join(path+[node]))
            if node in done: return
            for dep in graph.get(node,()): visit(dep,path+[node])
            done.add(node)
        for node in graph: visit(node,[])

    def test_extension_local_script_references_exist(self):
        root=Path(__file__).resolve().parents[2]/'source/extension'
        manifest=json.loads((root/'manifest.json').read_text('utf-8-sig'))
        references={manifest['background']['service_worker']}
        for item in manifest.get('content_scripts',[]): references.update(item.get('js',[]))
        for path in root.glob('*.js'):
            text=path.read_text('utf-8-sig')
            for group in re.findall(r'importScripts\(([^)]+)\)|\bfiles\s*:\s*\[([^\]]+)\]',text):
                references.update(re.findall(r'[\'"]([^\'"]+\.js)[\'"]',''.join(group)))
        for path in root.glob('*.html'):
            references.update(re.findall(r'<script[^>]+src=[\'"]([^\'"]+)[\'"]',path.read_text('utf-8-sig')))
        for name in references:
            self.assertTrue((root/name).is_file(), name)

    def test_platform_media_rules_reject_unknown_platforms_without_assuming_x(self):
        from server.media_urls import supports_cdn, validate_file_url
        from server.segmented_media import guard_url
        from unittest.mock import patch
        allowed={'bilibili':'https://upos.bilivideo.cn/file.m4s',
                 'youtube':'https://r1.googlevideo.com/videoplayback',
                 'x':'https://video.twimg.com/video.mp4'}
        with patch('server.media_urls.validate_public_url',side_effect=lambda u:u):
            for platform,url in allowed.items():
                self.assertTrue(supports_cdn(url,platform));self.assertEqual(validate_file_url(url),url)
                for wrong in set(allowed)-{platform}: self.assertFalse(supports_cdn(url,wrong))
        for platform in ('unknown','','instagram'):
            with self.assertRaises(ValueError): guard_url(allowed['x'],platform)
        for suffix in (':8082/a','@evil.example/a','.evil.example/a'):
            self.assertFalse(supports_cdn('https://video.twimg.com'+suffix,'x'))

    def test_identity_rules_have_no_runtime_dependencies(self):
        root=Path(__file__).resolve().parents[2]/'source/server/source_identity.py'
        tree=ast.parse(root.read_text('utf-8'))
        imports=[n for n in ast.walk(tree) if isinstance(n,(ast.Import,ast.ImportFrom))]
        names={n.module if isinstance(n,ast.ImportFrom) else a.name for n in imports for a in (n.names if isinstance(n,ast.Import) else [None])}
        self.assertEqual(names,{'re','urllib.parse'})
