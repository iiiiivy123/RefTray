"""Local capture index, independent of the chosen media directory. No file moves."""
import hashlib
import json
import re
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit


def source_id(value):
    u = urlsplit(value)
    host = (u.hostname or '').lower()
    if host in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be'):
        from .media_resolver import canonical
        return canonical(value)[0]
    if host in ('bilibili.com','www.bilibili.com') and re.fullmatch(r'/video/BV[\da-zA-Z]{10}/?',u.path):
        from .destinations import source_key
        return source_key(value)
    for domain, pattern, prefix in (
        ('xiaohongshu.com', r'/([a-f0-9]{24})/?$', 'xhs'),
        ('x.com', r'/status/(\d+)', 'x'), ('twitter.com', r'/status/(\d+)', 'x'),
        ('instagram.com', r'^/(?:[\w.]+/)?(?:p|reels?)/([\w-]+)', 'instagram'),
        ('pinterest.com', r'^/pin/(\d+)', 'pinterest'), ('pinterest.cn', r'^/pin/(\d+)', 'pinterest')):
        if host == domain or host.endswith('.' + domain):
            match = re.search(pattern, u.path, re.I)
            if match: return prefix + ':' + match[1]
    from .destinations import source_key
    return source_key(value)


def public_url(value):
    from .destinations import source_key
    return source_key(value)


def fingerprint(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


class Catalog:
    def __init__(self, root):
        self.path = Path(root) / 'data/inspiration/collector-index.sqlite3'
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0, 1): raise ValueError('采集索引版本不兼容，请恢复对应版本，未重建或清空索引')
            db.executescript('''CREATE TABLE IF NOT EXISTS captures (
                id INTEGER PRIMARY KEY, source TEXT, url TEXT, title TEXT, author TEXT,
                mode TEXT, directory TEXT, files TEXT, coverage TEXT, updated REAL,
                UNIQUE(source,mode,directory));
                CREATE TABLE IF NOT EXISTS assets (url_hash TEXT, path TEXT, sha TEXT, size INTEGER,
                PRIMARY KEY(url_hash,path));
                CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT, updated REAL);
                CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT);
                CREATE INDEX IF NOT EXISTS captures_updated ON captures(updated DESC, id DESC);
                CREATE INDEX IF NOT EXISTS captures_source ON captures(source, updated DESC);
                PRAGMA user_version=1;''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def record(self, url, title, author, mode, directory, files, coverage):
        folder = Path(directory).resolve()
        confirmed = []
        for name in files:
            path = (folder / name).resolve()
            if not path.is_relative_to(folder) or not path.is_file(): continue
            confirmed.append({'path': str(path), 'size': path.stat().st_size, 'sha': fingerprint(path)})
        if not confirmed: return
        with self.connect() as db:
            old = db.execute('SELECT files,coverage FROM captures WHERE source=? AND mode=? AND directory=?',
                             (source_id(url), mode, str(folder))).fetchone()
            if old:
                previous = {f['path']: f for f in json.loads(old['files']) if Path(f['path']).is_file()}
                previous.update({f['path']: f for f in confirmed})
                confirmed = list(previous.values())
                coverage = {**json.loads(old['coverage']), **coverage}
            db.execute('''INSERT INTO captures(source,url,title,author,mode,directory,files,coverage,updated)
                VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(source,mode,directory) DO UPDATE SET
                title=excluded.title,author=excluded.author,files=excluded.files,coverage=excluded.coverage,updated=excluded.updated''',
                (source_id(url), public_url(url), title or '', author or '', mode, str(folder),
                 json.dumps(confirmed), json.dumps(coverage), time.time()))
        return True

    def register_asset(self, url, path, sha):
        path = Path(path)
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO assets VALUES(?,?,?,?)',
                       (hashlib.sha256(url.encode()).hexdigest(), str(path.resolve()), sha, path.stat().st_size))

    def cached(self, url, *, image=False):
        with self.connect() as db:
            rows = db.execute('SELECT * FROM assets WHERE url_hash=?', (hashlib.sha256(url.encode()).hexdigest(),)).fetchall()
        for row in rows:
            p = Path(row['path'])
            try:
                if p.is_file() and p.stat().st_size == row['size'] and fingerprint(p) == row['sha']:
                    if image or p.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.tif', '.tiff'):
                        from .image_validation import validate_image
                        validate_image(p.read_bytes())
                    return p
            except (OSError, ValueError):
                pass
            # Forget the broken cache reference, preserving the user's old file.
            with self.connect() as db:
                db.execute('DELETE FROM assets WHERE url_hash=? AND path=?', (row['url_hash'], row['path']))
        return None

    @staticmethod
    def describe(row, check_files=True):
        item = dict(row)
        item['files'] = json.loads(item['files'])
        item['coverage'] = json.loads(item['coverage'])
        item.update(Catalog.classify(item['mode'], item['directory'], item['coverage'], item['url']))
        item['available'] = check_files and bool(item['files']) and all(Path(f['path']).is_file() and Path(f['path']).stat().st_size == f['size'] for f in item['files'])
        return item

    @staticmethod
    def classify(mode, directory, coverage, url):
        item = {'mode': mode, 'directory': directory, 'coverage': coverage, 'url': url}
        parts = Path(item['directory']).parts
        item['category'] = item['coverage'].get('category') or ('batch' if any(p in ('批量','图片批量','图文批量','作者采集','画板采集') for p in parts) else 'video' if item['coverage'].get('videos') and not item['coverage'].get('text') and not item['coverage'].get('images') else item['mode'])
        host = urlsplit(item['url']).hostname or ''
        item['platform'] = next((name for domain,name in [('artstation.com','ArtStation'),('bilibili.com','B站'),('xiaohongshu.com','小红书'),('twitter.com','X'),('x.com','X'),('instagram.com','Instagram'),('pinterest.com','Pinterest'),('pinterest.cn','Pinterest'),('huaban.com','花瓣')] if host == domain or host.endswith('.'+domain)), '其他网页')
        if host in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be'):item['platform']='YouTube'
        return {k: item[k] for k in ('category', 'platform')}

    def search(self, query='', category='', platform=''):
        with self.connect() as db:
            rows = db.execute('SELECT * FROM captures WHERE title LIKE ? OR author LIKE ? OR url LIKE ? ORDER BY updated DESC', ['%' + query[:300] + '%'] * 3)
            found=[]
            for row in rows:
                item=self.describe(row)
                if category and item['category'] != category or platform and item['platform'] != platform: continue
                found.append(item)
                if len(found)>=200: break
            return found

    def search_page(self, query='', category='', platform='', page=1, page_size=40):
        page_size = page_size if page_size in (20, 40, 80) else 40
        where = ['(title LIKE ? OR author LIKE ? OR url LIKE ?)']
        params = ['%' + query[:300] + '%'] * 3
        if category:
            where.append('capture_category(mode,directory,coverage)=?')
            params.append(category)
        if platform:
            where.append('capture_platform(url)=?')
            params.append(platform)
        predicate = ' AND '.join(where)
        with self.connect() as db:
            db.create_function('capture_category', 3, lambda mode, directory, coverage:
                               self.classify(mode, directory, json.loads(coverage), '')['category'], deterministic=True)
            db.create_function('capture_platform', 1, lambda url:
                               self.classify('', '', {}, url)['platform'], deterministic=True)
            total = db.execute('SELECT COUNT(*) FROM captures WHERE ' + predicate, params).fetchone()[0]
            pages = max(1, (total + page_size - 1) // page_size)
            page = min(max(1, page), pages)
            rows = db.execute('SELECT * FROM captures WHERE ' + predicate +
                              ' ORDER BY updated DESC, id DESC LIMIT ? OFFSET ?',
                              [*params, page_size, (page - 1) * page_size]).fetchall()
        return {'items': [self.describe(row) for row in rows],
                'total': total, 'page': page, 'pages': pages, 'page_size': page_size}

    def lookup(self, url, required):
        with self.connect() as db:
            rows = db.execute('SELECT * FROM captures WHERE source=? ORDER BY updated DESC', (source_id(url),)).fetchall()
        for row in rows:
            item = self.describe(row)
            if item['available'] and all(item['coverage'].get(k) is True for k in required) and all(f.get('sha') and fingerprint(f['path'])==f['sha'] for f in item['files']): return item
        return None

    def get(self, identity):
        with self.connect() as db:
            row = db.execute('SELECT * FROM captures WHERE id=?', (identity,)).fetchone()
        if not row: raise ValueError('采集记录不存在')
        return self.describe(row)

    def defaults(self, value=None):
        with self.connect() as db:
            if value is not None: db.execute('INSERT OR REPLACE INTO preferences VALUES(1,?)', (json.dumps(value),))
            row = db.execute('SELECT data FROM preferences WHERE id=1').fetchone()
        return json.loads(row[0]) if row else {}

    def task(self, value):
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO tasks VALUES(?,?,?)', (value['id'], json.dumps(value, ensure_ascii=False), time.time()))

    def tasks(self):
        with self.connect() as db:
            return [{**json.loads(row[0]), 'updated': row[1] * 1000} for row in db.execute('SELECT data,updated FROM tasks ORDER BY updated DESC')]
