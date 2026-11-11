"""Approved folder examples, preservation, and failed-capture side effects."""
import base64
import io
import json
import tempfile
import unittest
import time
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.response import addinfourl
from PIL import Image
from server.config import Settings, save_directory
from server.destinations import resolve_destination
from server.models import CollectRequest, ImageItem, VideoDownloadRequest
from server.storage import Storage
from server.video import VideoDownloads

SCHEMA = 'function-platform-v3'

def request(url='https://www.xiaohongshu.com/explore/'+'a'*24, **values):
    return CollectRequest(canonical_url=url, page_title='标题', capture_scope='single',
        ocr_enabled=False, directory_schema=SCHEMA, **values)

def picture(color='red'):
    out=io.BytesIO(); Image.new('RGB',(4,4),color).save(out,format='PNG')
    return ImageItem(url='https://example.org/'+color+'.png',data_base64=base64.b64encode(out.getvalue()).decode())

class SaveLayoutTests(unittest.TestCase):
    def test_disabled_sections_are_absent_and_ocr_failures_are_specific(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);storage=Storage(Settings(root,save_directory=root/'library'))
            value=request(collection_mode='text',body_text='正文',images=[picture()])
            result=storage.collect(value);folder=Path(result['directory']);md=next(folder.glob('*.md'))
            text=md.read_text('utf-8')
            for unwanted in ['## 已加载评论','## 图片识别文字','未完成或未启用','## 采集提示']:
                self.assertNotIn(unwanted,text)
            self.assertIn('![正文图片]',text)
            self.assertEqual(result['warnings'],[])
            with patch('server.storage.recognize',return_value={'status':'failed','text':'','error':'语言包缺失'}):
                storage.collect(value.model_copy(update={'ocr_enabled':True}))
            self.assertIn('识别失败：语言包缺失',md.read_text('utf-8'))
            with patch('server.storage.recognize',return_value={'status':'completed','text':''}):
                storage.collect(value.model_copy(update={'ocr_enabled':True}))
            self.assertIn('未检测到文字',md.read_text('utf-8'))

    def test_move_library_relinks_verified_files_and_reuses_media_and_plain_documents(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);old=root/'C素材';new=root/'D素材';storage=Storage(Settings(root/'state',save_directory=old))
            value=request(collection_mode='text',body_text='正文',images=[picture()])
            plain=value.model_copy(update={'canonical_url':'https://example.org/plain','images':[],'md_only':True})
            media=storage.collect(value);text=storage.collect(plain)
            original_md=Path(text['directory'])/text['files'][0]
            # 0.5.52 plain documents had only a central index, no portable sidecar.
            next((original_md.parent/'_来源记录').glob('metadata_文字_*.json')).unlink()
            # Simulate a user's whole-library move, preserving all relative paths.
            old.rename(new)
            linked=storage.catalog.relocate_library(old,new)
            self.assertEqual(linked,{'linked':2,'pending':0})
            self.assertTrue(storage.catalog.lookup(plain.canonical_url,['text']))
            storage.settings=save_directory(storage.settings,str(new))
            second=storage.collect(value);second_plain=storage.collect(plain)
            self.assertEqual(Path(second['directory']),new/Path(media['directory']).relative_to(old))
            self.assertEqual(second['new_images'],0)
            self.assertEqual(second_plain['files'],text['files'])
            moved_md=new/original_md.relative_to(old)
            self.assertEqual(list(moved_md.parent.glob('*.md')),[moved_md])
            # A different empty root changes only future saves, no phantom reassociation.
            self.assertEqual(storage.catalog.relocate_library(new,root/'empty'),{'linked':0,'pending':0})

    def test_relink_rejects_changed_files_and_keeps_task_snapshots(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);old=root/'old';new=root/'new';storage=Storage(Settings(root/'state',save_directory=old))
            value=request(collection_mode='text',body_text='正文',images=[picture()])
            result=storage.collect(value);folder=Path(result['directory'])
            storage.catalog.save_task({'id':'unfinished','directory':str(folder),'status':'paused'})
            old.rename(new);moved=new/folder.relative_to(old)
            next(moved.glob('*.md')).write_text('用户改过','utf-8')
            self.assertEqual(storage.catalog.relocate_library(old,new),{'linked':0,'pending':1})
            with storage.catalog.connect() as db:
                self.assertEqual(db.execute('SELECT directory FROM captures').fetchone()[0],str(folder))
                self.assertIn(str(folder).replace('\\','\\\\'),db.execute('SELECT data FROM tasks').fetchone()[0])
            self.assertEqual(next(moved.glob('*.md')).read_text('utf-8'),'用户改过')

    def test_approved_platform_paths_without_creating_directories(self):
        batch={'capture_scope':'batch','list_owner':'Ivy','list_name':'减肥'}
        cases=[
          (request(collection_mode='text'), '图文/小红书/图文-标题'),
          (request(), '图片/小红书/图片-标题'),
          (request('https://www.bilibili.com/opus/123',collection_mode='text'), '图文/B站/图文-标题'),
          (request('https://www.bilibili.com/read/cv123',collection_mode='text'), '图文/B站/图文-标题'),
          (request('https://www.bilibili.com/video/BV1234567890/',capture_kind='video'), '视频/B站/视频-标题'),
          (request('https://x.com/user/status/123',collection_mode='text'), '图文/X/图文-标题'),
          (request('https://www.instagram.com/p/abc/'), '图片/Instagram/图片-标题'),
          (request('https://huaban.com/pins/123/'), '图片/花瓣/图片-标题'),
          (request('https://www.pinterest.com/pin/123/'), '图片/Pinterest'),
          (request('https://www.artstation.com/artwork/abc'), '图片/ArtStation/图片-标题'),
          (request('https://weibo.com/123/abc',collection_mode='text'), '图文/微博/图文-标题'),
          (request('https://example.org/article',collection_mode='text'), '图文/其他网页/图文-标题'),
        ]
        def grouped(value,kind,url,expected,**extra):
            cases.append((value.model_copy(update={**batch,'list_kind':kind,'list_url':url,**extra}),expected))
        grouped(request(collection_mode='text'),'favorites','https://www.xiaohongshu.com/board/'+'b'*24,'批量/小红书/收藏夹采集-减肥-Ivy/图文-标题')
        grouped(request(collection_mode='text'),'works','https://www.xiaohongshu.com/user/profile/'+'c'*24,'批量/小红书/主页采集-Ivy/图文-标题')
        grouped(request('https://huaban.com/pins/123/'),'board','https://huaban.com/boards/123','批量/花瓣/画板采集-减肥')
        grouped(request('https://www.pinterest.com/pin/123/'),'board','https://www.pinterest.com/ivy/board','批量/Pinterest/画板采集-减肥-Ivy')
        grouped(request('https://www.bilibili.com/video/BV1234567890/?p=3',capture_kind='video'),'collection','https://www.bilibili.com/video/BV1234567890/','批量/B站/分P采集-减肥-Ivy/P03-第三篇',page_title='P003 第三篇')
        grouped(request('https://www.bilibili.com/video/BV1234567890/',capture_kind='video'),'collection','https://space.bilibili.com/123/lists/4','批量/B站/合集采集-减肥-Ivy/视频-标题')
        grouped(request('https://www.bilibili.com/read/cv123',collection_mode='text'),'collection','https://www.bilibili.com/read/readlist/rl4','批量/B站/文集采集-减肥-Ivy/图文-标题')
        grouped(request('https://www.bilibili.com/video/BV1234567890/',capture_kind='video'),'videos','https://space.bilibili.com/123/upload/video','批量/B站/主页采集-Ivy/视频-标题')
        grouped(request('https://www.youtube.com/watch?v=abcdefghijk',capture_kind='video'),'playlist','https://www.youtube.com/playlist?list=PL1','批量/YouTube/列表采集-减肥-Ivy/视频-标题')
        grouped(request('https://www.youtube.com/shorts/abcdefghijk',capture_kind='video'),'shorts','https://www.youtube.com/@ivy/shorts','批量/YouTube/Shorts采集-Ivy/视频-标题')
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for value, expected in cases:
                with self.subTest(expected=expected):
                    folder,_,_=resolve_destination(root,value)
                    self.assertEqual(folder,root/expected)
                    self.assertEqual(list(root.iterdir()),[],'Planning must not create empty folders')

    def test_saved_document_media_repeat_and_edited_markdown(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);storage=Storage(Settings(root,save_directory=root/'library'))
            value=request(collection_mode='text',body_text='正文',images=[picture()])
            first=storage.collect(value);folder=Path(first['directory'])
            self.assertEqual(folder,root/'library/图文/小红书/图文-标题')
            md=next(folder.glob('*.md'));md.write_text(md.read_text('utf-8')+'\n我的笔记','utf-8')
            second=storage.collect(value)
            self.assertEqual(second['directory'],first['directory']);self.assertEqual(second['new_images'],0)
            self.assertIn('我的笔记',md.read_text('utf-8'))
            self.assertEqual(len(list(folder.glob('*.png'))),1)
            self.assertEqual({p.name for p in (root/'library').iterdir()},{'图文'})
            changed=storage.collect(value.model_copy(update={'page_title':'改了标题'}))
            self.assertEqual(changed['directory'],str(folder))

    def test_failed_or_empty_images_create_no_work_folders(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);storage=Storage(Settings(root,save_directory=root/'library'))
            for images in ([],[ImageItem(url='https://example.org/broken.png')]):
                with patch.object(storage,'_download',side_effect=ValueError('broken image')):
                    with self.assertRaises((ValueError,RuntimeError)):storage.collect(request(images=images))
                self.assertEqual(list((root/'library').iterdir()),[])
            with patch.object(storage,'_download',side_effect=ValueError('broken image')):
                with self.assertRaises(RuntimeError):storage.collect(request(collection_mode='text',images=[ImageItem(url='https://example.org/broken.png')]))
            self.assertEqual(list((root/'library').iterdir()),[])

    def test_plain_text_is_a_file_in_the_group_and_skips_asset_folders(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);storage=Storage(Settings(root,save_directory=root/'library'))
            value=request(collection_mode='text',body_text='正文',md_only=True).model_copy(update={
                'capture_scope':'batch','list_kind':'favorites','list_url':'https://www.xiaohongshu.com/board/'+'b'*24,
                'list_name':'减肥','list_owner':'Ivy'})
            result=storage.collect(value);folder=Path(result['directory'])
            self.assertEqual(folder,root/'library/批量/小红书/收藏夹采集-减肥-Ivy')
            self.assertTrue(result['files'][0].startswith('文字-标题_'))
            self.assertEqual([p.name for p in folder.iterdir() if p.is_dir()],['_来源记录'])

    def test_previous_schema_resume_stays_put_and_user_folder_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);storage=Storage(Settings(root,save_directory=root/'library'))
            value=request(collection_mode='text',body_text='原文')
            old=value.model_copy(update={'directory_schema':'function-platform-v2'})
            old_result=storage.collect(old);old_files={p:p.read_bytes() for p in Path(old_result['directory']).rglob('*') if p.is_file()}
            occupied=root/'library/图文/小红书/图文-标题';occupied.mkdir();(occupied/'我的文件.txt').write_text('保留','utf-8')
            new=storage.collect(value)
            self.assertNotEqual(new['directory'],str(occupied))
            for p,data in old_files.items():self.assertEqual(p.read_bytes(),data)
            self.assertEqual(storage.collect(old)['directory'],old_result['directory'])
            self.assertEqual((occupied/'我的文件.txt').read_text('utf-8'),'保留')

    def test_setting_root_does_not_precreate_unused_categories(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=root/'library'
            save_directory(Settings(root),str(folder))
            self.assertEqual(list(folder.iterdir()),[])

    def test_write_failure_removes_only_new_empty_directories(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);storage=Storage(Settings(root,save_directory=root/'library'))
            original = Path.write_bytes
            def fail(path, data):
                original(path, data[:5])
                raise OSError('fixture disk full')
            with patch.object(Path,'write_bytes',fail):
                with self.assertRaisesRegex(RuntimeError,'disk full'):
                    storage.collect(request(images=[picture()]))
            self.assertEqual(list((root/'library').iterdir()),[])
            existing=root/'library/图片/小红书';existing.mkdir(parents=True)
            with patch.object(Path,'write_bytes',fail):
                with self.assertRaises(RuntimeError):storage.collect(request(images=[picture()]))
            self.assertTrue(existing.is_dir());self.assertEqual(list(existing.iterdir()),[])

    def test_flat_board_batch_results_and_same_named_boards_stay_separate(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);storage=Storage(Settings(root,save_directory=root/'library'))
            value=request('https://huaban.com/pins/123',images=[picture()]).model_copy(update={
                'capture_scope':'batch','list_kind':'board','list_url':'https://huaban.com/boards/1','list_name':'参考'})
            first=storage.collect(value)
            other_post=storage.collect(value.model_copy(update={'canonical_url':'https://huaban.com/pins/456','images':[picture('blue')]}))
            second=storage.collect(value.model_copy(update={'list_url':'https://huaban.com/boards/2'}))
            self.assertEqual(first['directory'],first['batch_directory'])
            self.assertEqual(other_post['directory'],first['directory'])
            self.assertNotEqual(second['directory'],first['directory'])
            folder=Path(first['directory'])
            self.assertEqual(len(list(folder.glob('*.png'))),2)
            self.assertEqual([p.name for p in folder.iterdir() if p.is_dir()],['_来源记录'])

    def test_plain_text_switching_platform_layer_reuses_file_and_preserves_edits(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);storage=Storage(Settings(root,save_directory=root/'library'))
            value=request(collection_mode='text',body_text='正文',md_only=True)
            first=storage.collect(value);folder=Path(first['directory']);md=folder/first['files'][0]
            md.write_text(md.read_text('utf-8')+'\n手写补充','utf-8')
            second=storage.collect(value.model_copy(update={'layout':'organized_flat'}))
            self.assertEqual(second['directory'],first['directory'])
            self.assertTrue(second['files'][0].startswith('文字-'))
            self.assertIn('手写补充',md.read_text('utf-8'))

    def test_text_main_gif_and_comment_images_share_work_folder(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);storage=Storage(Settings(root,save_directory=root/'library'))
            value=request('https://x.com/ivy/status/123',collection_mode='text',capture_kind='text',
                body_text='正文',images=[picture().model_copy(update={'role':'comment','comment_id':'reply1'})],
                comments_requested=True,comments=[{'id':'reply1','author':'回复者','text':'评论'}])
            main=storage.collect(value)
            data=io.BytesIO();Image.new('RGB',(4,4),'blue').save(data,format='GIF')
            media=VideoDownloadRequest(**{**value.model_dump(),'url':'https://cdn.example/a.gif',
                'save_directory':str(root/'library'),'output_format':'gif'})
            downloads=VideoDownloads();downloads.jobs['test']={'status':'running','control':'running','lease':time.monotonic()}
            opener=Mock();opener.open.return_value=addinfourl(io.BytesIO(data.getvalue()),{'Content-Length':str(len(data.getvalue()))},media.url,code=200)
            with patch('server.video.validate_url',return_value=media.url),patch('server.video.public_opener',return_value=opener):
                downloads._run('test',root/'library',media)
            job=downloads.jobs['test'];self.assertEqual(job['status'],'completed',job)
            self.assertEqual(job['result']['directory'],main['directory'])
            self.assertEqual(Path(job['result']['path']).read_bytes(),data.getvalue())
            self.assertEqual(storage.collect(value)['directory'],main['directory'])

    def test_failed_video_has_no_empty_group_and_does_not_remove_existing_group(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            value=VideoDownloadRequest(canonical_url='https://www.bilibili.com/video/BV1234567890/?p=3',
                url='https://cdn.example/video.mp4',save_directory=str(root),capture_scope='batch',capture_kind='video',
                directory_schema=SCHEMA,list_kind='collection',list_url='https://www.bilibili.com/video/BV1234567890/',
                list_name='课程',list_owner='作者',page_title='P003 第三讲',output_format='audio')
            expected=root/'批量/B站/分P采集-课程-作者'
            def failed():
                downloads=VideoDownloads();downloads.jobs['test']={'status':'running','control':'running','lease':time.monotonic()}
                opener=Mock();opener.open.side_effect=OSError('fixture offline')
                with patch('server.video.validate_url',return_value=value.url),patch('server.video.public_opener',return_value=opener):
                    downloads._run('test',root,value)
                self.assertEqual(downloads.jobs['test']['status'],'failed')
                self.assertIn('offline',downloads.jobs['test']['message'])
            failed();self.assertEqual(list(root.iterdir()),[])
            expected.mkdir(parents=True);failed()
            self.assertTrue(expected.is_dir());self.assertEqual(list(expected.iterdir()),[])

if __name__=='__main__':unittest.main()
