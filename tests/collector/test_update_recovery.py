import json
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from server.update_recovery import backup_state, restore_program
from server.update_storage import sha256


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.program=self.root/'app';self.program.mkdir()
        (self.program/'InspirationCollector.exe').write_bytes(b'old working program')
        self.old=(self.program/'InspirationCollector.exe').read_bytes()
        self.write_manifest('0.5.49')
        (self.program/'my-notes.txt').write_text('hand edited')
        self.state=self.root/'state';self.base=self.state/'data/inspiration/updates';self.base.mkdir(parents=True)
        self.config=self.base.parent/'collector-settings.json';self.config.write_text(json.dumps({'save_directory':str(self.root/'materials'),'custom':'keep'}))
        self.database=self.base.parent/'collector-index.sqlite3'
        with closing(sqlite3.connect(self.database)) as db, db:db.executescript("PRAGMA user_version=1; CREATE TABLE preferences(value TEXT); INSERT INTO preferences VALUES('old');")
        package=self.base/'0.5.50/InspirationCollector-0.5.50-Windows-x64-Setup.exe';package.parent.mkdir();package.write_bytes(b'new package')
        self.plan={'program':str(self.program),'state':str(self.state),'current':'0.5.49','version':'0.5.50','size':package.stat().st_size,'sha256':sha256(package)}
        (self.base/'pending.json').write_text(json.dumps(self.plan))
        self.backup=Path(backup_state(self.state,self.program)['directory'])

    def write_manifest(self,number):
        (self.program/'managed-files.json').write_text(json.dumps({'schema_version':1,'release':number,'data_schema_version':1,'files':{'InspirationCollector.exe':sha256(self.program/'InspirationCollector.exe')}}))

    def damage(self):
        (self.program/'InspirationCollector.exe').write_bytes(b'broken newer program')
        self.write_manifest('0.5.50')
        (self.program/'my-notes.txt').write_text('edited after update')

    def test_restores_program_keeps_current_settings_new_records_and_hand_edits(self):
        self.damage();config=self.config.read_bytes()
        with closing(sqlite3.connect(self.database)) as db, db:db.execute("INSERT INTO preferences VALUES('new after update')")
        result=restore_program(self.state,self.program,sync_extensions=False)
        self.assertEqual((self.program/'InspirationCollector.exe').read_bytes(),self.old)
        self.assertEqual((self.program/'my-notes.txt').read_text(),'edited after update')
        self.assertEqual(self.config.read_bytes(),config)
        with closing(sqlite3.connect(self.database)) as db, db:self.assertEqual(db.execute('SELECT COUNT(*) FROM preferences').fetchone()[0],2)
        self.assertEqual((Path(result['preserved_program'])/'InspirationCollector.exe').read_bytes(),b'broken newer program')

    def test_tampered_backup_aborts_before_current_program_changes(self):
        self.damage();(self.backup/'program/InspirationCollector.exe').write_bytes(b'corrupted backup')
        with self.assertRaisesRegex(ValueError,'备份校验失败'):restore_program(self.state,self.program,False)
        self.assertEqual((self.program/'InspirationCollector.exe').read_bytes(),b'broken newer program')

    def test_metadata_tampering_aborts_before_recovery(self):
        (self.backup/'program-snapshot.json').write_text('{}')
        with self.assertRaisesRegex(ValueError,'清单校验失败'):restore_program(self.state,self.program,False)
        self.assertEqual((self.program/'InspirationCollector.exe').read_bytes(),self.old)

    def test_new_database_format_is_preserved_instead_of_restoring_old_data(self):
        self.damage()
        with closing(sqlite3.connect(self.database)) as db, db:db.execute('PRAGMA user_version=2')
        with self.assertRaisesRegex(ValueError,'记录格式'):restore_program(self.state,self.program,False)
        with closing(sqlite3.connect(self.database)) as db, db:self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],2)

    def test_failed_directory_swap_puts_current_program_back(self):
        self.damage();rename=Path.rename
        def blocked(path,target):
            if path.name.startswith('app-restore-'):raise PermissionError('simulated lock')
            return rename(path,target)
        with patch.object(Path,'rename',blocked),self.assertRaises(PermissionError):restore_program(self.state,self.program,False)
        self.assertEqual((self.program/'InspirationCollector.exe').read_bytes(),b'broken newer program')
        self.assertEqual(list(self.root.glob('app-restore-*')),[])

    def test_registered_extension_sync_uses_restored_program_and_previous_manifest(self):
        self.damage()
        with patch('server.extension_install.install') as sync:
            result=restore_program(self.state,self.program)
        sync.assert_called_once_with(self.program,Path(result['preserved_program'])/'managed-files.json')


if __name__=='__main__':unittest.main()
