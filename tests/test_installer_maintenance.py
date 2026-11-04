import base64
import hashlib
import json
import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path
from server.maintenance import cleanup_upgrade, cleanup_state, digest


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.program = self.root / 'program'
        self.state = self.root / 'state'
        self.program.mkdir(); self.state.mkdir()
        self.incoming = self.root / 'incoming.json'
    def tearDown(self): self.temp.cleanup()
    def file(self, name, text):
        target = self.program / name; target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text); return target
    def manifests(self, old, new):
        (self.program / 'managed-files.json').write_text(json.dumps({'schema_version': 1, 'files': old}))
        self.incoming.write_text(json.dumps({'schema_version': 1, 'files': new}))
    def database(self):
        path = self.state / 'data/inspiration/collector-index.sqlite3'
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(path)) as db, db:
            for table in ('preferences', 'captures', 'tasks'):
                db.execute('CREATE TABLE ' + table + '(data TEXT)')
                db.execute('INSERT INTO ' + table + ' VALUES(?)', ('keep',))
        return path
    def test_upgrade_removes_only_unchanged_stale_owned_files(self):
        old = self.file('server/obsolete.py', 'old')
        modified = self.file('server/modified.py', 'hand edited')
        user = self.file('server/my-notes.txt', 'user')
        expected = hashlib.sha256(b'original').hexdigest()
        self.manifests({'server/obsolete.py': digest(old), 'server/modified.py': expected}, {})
        result = cleanup_upgrade(self.program, self.incoming, self.state)
        self.assertEqual(['server/obsolete.py'], result['removed'])
        self.assertFalse(old.exists()); self.assertEqual('hand edited', modified.read_text())
        self.assertTrue(user.exists())
    def test_modified_program_file_gets_backup_before_installer_replaces_it(self):
        target = self.file('server/app.py', 'user edit')
        self.manifests({'server/app.py': 'old-sha'}, {'server/app.py': 'new-sha'})
        cleanup_upgrade(self.program, self.incoming, self.state)
        backups = list((self.program / 'preserved-program-files').iterdir())
        self.assertEqual('user edit', backups[0].read_text())
        self.assertEqual('user edit', target.read_text())
    def test_invalid_manifest_does_not_delete_an_earlier_valid_entry(self):
        target = self.file('server/old.py', 'old')
        self.manifests({'server/old.py': digest(target), '../material.txt': 'bad'}, {})
        with self.assertRaises(ValueError): cleanup_upgrade(self.program, self.incoming, self.state)
        self.assertTrue(target.exists())
    def test_legacy_wheel_record_removes_only_owned_unchanged_dependency(self):
        target = self.file('runtime/Lib/site-packages/oldpkg/__init__.py', 'old module')
        metadata = self.file('runtime/Lib/site-packages/oldpkg-1.0.dist-info/RECORD', '')
        encoded = base64.urlsafe_b64encode(hashlib.sha256(target.read_bytes()).digest()).decode().rstrip('=')
        metadata.write_text('oldpkg/__init__.py,sha256=' + encoded + ',10\noldpkg-1.0.dist-info/RECORD,,\n')
        custom = self.file('runtime/Lib/site-packages/custom-notes.txt', 'user notes')
        self.incoming.write_text(json.dumps({'schema_version': 1, 'files': {}}))
        result = cleanup_upgrade(self.program, self.incoming, self.state)
        self.assertTrue(result['legacy_manifest_missing'])
        self.assertFalse(target.exists()); self.assertFalse(metadata.exists())
        self.assertEqual('user notes', custom.read_text())

    def test_preinstall_plan_keeps_old_runtime_until_new_runtime_is_ready(self):
        target = self.file('runtime/old-library.dll', 'old')
        self.manifests({'runtime/old-library.dll': digest(target)}, {})
        previous = self.root / 'previous.json'
        cleanup_upgrade(self.program, self.incoming, self.state, plan_only=True, export_manifest=previous)
        self.assertTrue(target.exists())
        self.assertTrue(previous.is_file())
        cleanup_upgrade(self.program, self.incoming, self.state, previous_manifest=previous)
        self.assertFalse(target.exists())

    def test_configured_material_inside_program_is_preserved(self):
        target = self.file('server/library/art.txt', 'art')
        config = self.state / 'data/inspiration/collector-settings.json'
        config.parent.mkdir(parents=True); config.write_text(json.dumps({'save_directory': str(target.parent)}))
        self.manifests({'server/library/art.txt': digest(target)}, {})
        cleanup_upgrade(self.program, self.incoming, self.state)
        self.assertEqual('art', target.read_text())
    def test_history_cleanup_preserves_preferences_and_materials(self):
        database = self.database()
        material = self.state / 'data/inspiration/inbox/art.txt'
        material.parent.mkdir(); material.write_text('edited artwork')
        cleanup_state(self.state, history=True)
        with closing(sqlite3.connect(database)) as db, db:
            self.assertEqual(1, db.execute('SELECT COUNT(*) FROM preferences').fetchone()[0])
            self.assertEqual(0, db.execute('SELECT COUNT(*) FROM captures').fetchone()[0])
            self.assertEqual(0, db.execute('SELECT COUNT(*) FROM tasks').fetchone()[0])
        self.assertEqual('edited artwork', material.read_text())
    def test_default_keep_changes_nothing(self):
        database = self.database(); original = digest(database)
        self.assertEqual([], cleanup_state(self.state)['cleared'])
        self.assertEqual(original, digest(database))
    def test_cache_overlap_refuses_before_clearing_preferences(self):
        database = self.database()
        config = self.state / 'data/inspiration/collector-settings.json'
        library = self.state / 'cache/my-library'; library.mkdir(parents=True)
        config.write_text(json.dumps({'save_directory': str(library)}))
        with self.assertRaises(ValueError): cleanup_state(self.state, preferences=True, cache=True)
        self.assertTrue(config.exists())
        with closing(sqlite3.connect(database)) as db, db:
            self.assertEqual(1, db.execute('SELECT COUNT(*) FROM preferences').fetchone()[0])

if __name__ == '__main__': unittest.main()
