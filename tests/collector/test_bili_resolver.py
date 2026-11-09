import unittest
from unittest.mock import patch
from server.media_resolver import canonical,pick
from server.bili_resolver import prefer_supported_cdn, supported_cdn_url
BV='BV1wtmZYoEJf'
URL='https://www.bilibili.com/video/'+BV+'/?p=1'
def fixture():
    return {'id':BV+'_p1','extractor_key':'BiliBili','webpage_url':URL,'title':'Fixture','duration':227.88,'requested_formats':[
        {'url':'https://upos.bilivideo.com/opaque/video.m4s','vcodec':'av01','acodec':'none','height':1080,'protocol':'https'},
        {'url':'https://upos.bilivideo.com/opaque/audio.m4s','vcodec':'none','acodec':'mp4a.40.2','protocol':'https'}]}
class BiliResolverTests(unittest.TestCase):
    def test_unusable_high_quality_track_does_not_hide_a_usable_track(self):
        from yt_dlp import YoutubeDL
        from server.resolve_public_media import CollectorBiliIE
        info = {'support_formats': [], 'dash': {'video': [
            {'id': 80, 'baseUrl': 'https://edge.bilivideo.cn:8082/unusable.m4s',
             'codecs': 'avc1', 'height': 1080},
            {'id': 64, 'baseUrl': 'https://upos.bilivideo.com/usable.m4s',
             'codecs': 'avc1', 'height': 720}]}}
        with YoutubeDL({'quiet': True, 'no_warnings': True}) as dl:
            formats = CollectorBiliIE(dl).extract_formats(info)
        self.assertEqual([f['height'] for f in formats], [720])

    def test_progressive_and_dash_backups_survive_the_real_extractor(self):
        from yt_dlp import YoutubeDL
        from server.resolve_public_media import CollectorBiliIE
        primary = 'https://edge.bilivideo.cn:8082/main.mp4'
        backup = 'https://upos.bilivideo.com/main.mp4?deadline=123'
        for info in [
            {'durl': [{'url': primary, 'backup_url': [backup], 'size': 1234, 'length': 2000}]},
            {'dash': {'audio': [{'id': 30280, 'baseUrl': primary, 'backupUrl': [backup],
                                'mimeType': 'audio/mp4', 'codecs': 'mp4a.40.2'}]}}
        ]:
            with YoutubeDL({'quiet': True, 'no_warnings': True}) as dl:
                formats = CollectorBiliIE(dl).extract_formats(info)
            self.assertEqual(formats[0]['url'], backup)

    def test_p3_track_keeps_identity_and_uses_its_own_https_backup(self):
        primary = 'https://edge.mcdn.bilivideo.cn:8082/same-audio.m4s?token=original'
        backup = 'https://upos.bilivideo.com/same-audio.m4s?token=backup'
        info = {'dash': {'audio': [{'id': 30280, 'baseUrl': primary,
                 'backupUrl': ['https://other.example/audio.m4s', backup], 'drm': True}]}}
        result = prefer_supported_cdn(info)
        self.assertEqual(result['dash']['audio'][0]['baseUrl'], backup)
        self.assertEqual(result['dash']['audio'][0]['id'], 30280)
        self.assertTrue(result['dash']['audio'][0]['drm'])
        self.assertEqual(info['dash']['audio'][0]['baseUrl'], primary)
        for url in (primary, 'https://127.0.0.1/a', 'https://user:pass@upos.bilivideo.com/a',
                    'https://bilivideo.com.evil.example/a', 'http://upos.bilivideo.com/a'):
            self.assertFalse(supported_cdn_url(url))
        no_backup = {'dash': {'audio': [{'base_url': primary}]}}
        self.assertEqual(prefer_supported_cdn(no_backup), no_backup)

    def test_canonical_pins_one_bv_and_part_ignoring_collection_tracking(self):
        self.assertEqual(canonical('https://www.bilibili.com/video/'+BV+'/?spm_id_from=collection'),(URL,'bilibili'))
        self.assertEqual(canonical('https://www.bilibili.com/video/'+BV+'/?p=2&spm_id_from=collection')[0],URL.replace('p=1','p=2'))
        for suffix in ['?p=0','?p=abc','?p=1&p=2']:
            with self.assertRaises(ValueError):canonical('https://www.bilibili.com/video/'+BV+'/'+suffix)
    def test_exact_work_ytdlp_formats_use_existing_bili_transport(self):
        with patch('server.video.validate_url',side_effect=lambda u:u):
            result=pick(fixture(),URL,'bilibili')['media'][0]
        self.assertEqual(result['media_kind'],'bilibili-dash');self.assertIn('audio.m4s',result['audio_url']);self.assertEqual(result['canonical_url'],URL)
    def test_audio_only_selection_needs_no_video(self):
        f=fixture();f.update(f['requested_formats'][1]);f.pop('requested_formats')
        with patch('server.video.validate_url',side_effect=lambda u:u):r=pick(f,URL,'bilibili','audio')['media'][0]
        self.assertEqual(r['media_kind'],'bilibili-audio');self.assertNotIn('audio_url',r)
    def test_other_bv_part_playlist_or_untrusted_domain_are_rejected(self):
        for change in [{'id':'BV0000000000_p1'},{'id':BV+'_p2'},{'_type':'playlist','entries':[fixture()]}]:
            f=fixture();f.update(change)
            with self.assertRaises(ValueError):pick(f,URL,'bilibili')
        f=fixture();f['requested_formats'][0]['url']='https://evil.example/a.mp4'
        with self.assertRaises(ValueError):pick(f,URL,'bilibili')
if __name__=='__main__':unittest.main()
