import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

from server.catalog import Catalog


class TaskCatalogTests(unittest.TestCase):
    def test_filter_before_pagination_and_partial_is_unfinished(self):
        with tempfile.TemporaryDirectory() as root:
            catalog = Catalog(Path(root))
            for n in range(47):
                catalog.save_task({'id': f'bad-{n}', 'completed': True, 'status': 'failed', 'saved': 0, 'failed': 1})
            catalog.save_task({'id': 'partial', 'completed': True, 'status': 'partial', 'saved': 1, 'failed': 1})
            catalog.save_task({'id': 'success', 'completed': True, 'status': 'completed', 'saved': 1, 'failed': 0})
            catalog.save_task({'id': 'paused', 'completed': False, 'status': 'paused', 'saved': 0, 'failed': 0})
            first = catalog.task_page(page=1, page_size=20, view='failed')
            last = catalog.task_page(page=3, page_size=20, view='failed')
            self.assertEqual((first['total'], len(first['items']), len(last['items'])), (47, 20, 7))
            self.assertFalse(set(x['id'] for x in first['items']) & set(x['id'] for x in last['items']))
            unfinished = catalog.task_page(view='unfinished')
            self.assertEqual({x['id'] for x in unfinished['items']}, {'partial', 'paused'})
            ignored = catalog.task_page(view='ignored', ignored_ids=['bad-0'])
            self.assertEqual([x['id'] for x in ignored['items']], ['bad-0'])
            self.assertEqual(catalog.task_page(view='failed', ignored_ids=['bad-0'])['total'], 46)

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.catalog = Catalog(Path(self.temporary.name))

    def test_revision_roundtrip_replay_and_conflict(self):
        saved = self.catalog.save_task({'id': 'a', 'records': {'one': 'saved'}, 'queue': ['b']}, expected_revision=0)
        self.assertEqual((saved['schema_version'], saved['task_id'], saved['revision']), (1, 'a', 1))
        self.assertEqual(self.catalog.get_task('a'), saved)
        self.assertEqual(self.catalog.save_task(saved), saved)
        for record, expected in [({**saved, 'status': 'changed'}, None), ({**saved, 'revision': 0}, None), (saved, 0)]:
            with self.assertRaises(ValueError):
                self.catalog.save_task(record, expected)
        newer = self.catalog.save_task({**saved, 'status': 'completed'}, expected_revision=1)
        self.assertEqual(newer['revision'], 2)
        self.assertEqual(self.catalog.get_task('a'), newer)
        self.assertIsNone(self.catalog.get_task('missing'))

    def test_two_writers_cannot_advance_same_revision(self):
        self.catalog.save_task({'id': 'a'})
        barrier = Barrier(2)
        def write(status):
            barrier.wait()
            try:
                return self.catalog.save_task({'id': 'a', 'status': status}, expected_revision=1)['revision']
            except ValueError:
                return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(write, ['one', 'two']))
        self.assertCountEqual(outcomes, [2, 'conflict'])

    def test_coalesced_offline_revisions_keep_identity_and_replay_after_lost_response(self):
        pending = {'id': 'offline', 'task_id': 'offline', 'schema_version': 1, 'revision': 3, 'records': {'three': {'status': 'saved'}}}
        saved = self.catalog.save_task(pending, expected_revision=0)
        self.assertEqual(saved['revision'], 3)
        replay = self.catalog.save_task(pending, expected_revision=3)
        self.assertEqual(replay['revision'], 3)
        with self.assertRaises(ValueError):
            self.catalog.save_task({**pending, 'revision': 4}, expected_revision=0)
        self.assertEqual(self.catalog.save_task({**pending, 'revision': 5}, expected_revision=3)['revision'], 5)

    def test_legacy_summary_derives_failure_status_in_sql_without_loading_records(self):
        legacy = {'id': 'old-failure', 'completed': True, 'records': {
            'a': {'status': 'saved'}, 'b': {'status': 'failed'}, 'c': {'status': 'partial'},
            'd': {'status': 'skipped'}, 'e': {'status': 'pending'}}, 'queue': ['e']}
        with self.catalog.connect() as db:
            db.execute('INSERT INTO tasks VALUES(?,?,?)', (legacy['id'], json.dumps(legacy), 123))
        from unittest.mock import patch
        with patch('server.catalog.json.loads', side_effect=AssertionError('full checkpoint decoded')):
            item = self.catalog.task_page()['items'][0]
        self.assertEqual((item['total'], item['done'], item['failed'], item['saved'], item['skipped'], item['status']), (5, 4, 2, 2, 1, 'partial'))
        self.assertNotIn('records', item)
        self.assertEqual(self.catalog.get_task(legacy['id'])['records'], legacy['records'])

    def test_legacy_records_read_and_upgrade_without_schema_rebuild(self):
        legacy = {'id': 'old', 'records': {'one': 'saved'}, 'queue': ['two'], 'status': 'paused'}
        with self.catalog.connect() as db:
            db.execute('INSERT INTO tasks VALUES(?,?,?)', ('old', json.dumps(legacy), 123))
        reopened = Catalog(Path(self.temporary.name))
        self.assertEqual(reopened.get_task('old')['revision'], 0)
        self.assertEqual(reopened.tasks()[0]['queue'], ['two'])
        upgraded = reopened.save_task({**legacy, 'status': 'running'}, expected_revision=0)
        self.assertEqual(upgraded['revision'], 1)
        self.assertEqual(upgraded['records'], legacy['records'])

    def test_summary_pagination_never_constructs_full_checkpoint_rows(self):
        for index in range(45):
            self.catalog.task({'id': str(index), 'name': 'Task ' + str(index), 'progress': index,
                               'records': {'large': 'x' * 10000}, 'queue': ['large'] * 200})
        with self.catalog.connect() as db:
            db.execute('UPDATE tasks SET updated=CAST(id AS INTEGER)')
        # Summary read must not JSON-decode even a single complete checkpoint in Python.
        from unittest.mock import patch
        with patch('server.catalog.json.loads', side_effect=AssertionError('full checkpoint decoded')):
            first = self.catalog.task_page()
            second = self.catalog.task_page(page=2)
        self.assertEqual((first['total'], first['page'], first['page_size'], len(first['items'])), (45, 1, 20, 20))
        self.assertEqual(first['items'][0]['id'], '44')
        self.assertEqual(second['items'][0]['id'], '24')
        self.assertNotIn('records', first['items'][0])
        self.assertNotIn('queue', first['items'][0])
        self.assertEqual(len(self.catalog.get_task('44')['queue']), 200)


if __name__ == '__main__':
    unittest.main()
