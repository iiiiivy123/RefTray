import ast
import unittest
from pathlib import Path

class ArchitectureBoundaryTests(unittest.TestCase):
    def test_server_relative_imports_have_no_cycle(self):
        root=Path(__file__).resolve().parents[2]/'source/server'
        graph={p.stem:{n.module.split('.')[0] for n in ast.walk(ast.parse(p.read_text('utf-8-sig'))) if isinstance(n,ast.ImportFrom) and n.level and n.module} for p in root.glob('*.py')}
        done=set()
        def visit(node,path):
            self.assertNotIn(node,path,' -> '.join(path+[node]))
            if node in done: return
            for dep in graph.get(node,()): visit(dep,path+[node])
            done.add(node)
        for node in graph: visit(node,[])

    def test_identity_rules_have_no_runtime_dependencies(self):
        root=Path(__file__).resolve().parents[2]/'source/server/source_identity.py'
        tree=ast.parse(root.read_text('utf-8'))
        imports=[n for n in ast.walk(tree) if isinstance(n,(ast.Import,ast.ImportFrom))]
        names={n.module if isinstance(n,ast.ImportFrom) else a.name for n in imports for a in (n.names if isinstance(n,ast.Import) else [None])}
        self.assertEqual(names,{'re','urllib.parse'})
