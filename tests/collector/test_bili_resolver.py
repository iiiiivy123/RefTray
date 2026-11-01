import unittest
from unittest.mock import patch
from server.media_resolver import canonical,pick
BV='BV1wtmZYoEJf'
URL='https://www.bilibili.com/video/'+BV+'/?p=1'
def fixture():
    return {'id':BV+'_p1','extractor_key':'BiliBili','webpage_url':URL,'title':'Fixture','duration':227.88,'requested_formats':[
        {'url':'https://upos.bilivideo.com/opaque/video.m4s','vcodec':'av01','acodec':'none','height':1080,'protocol':'https'},
        {'url':'https://upos.bilivideo.com/opaque/audio.m4s','vcodec':'none','acodec':'mp4a.40.2','protocol':'https'}]}
class BiliResolverTests(unittest.TestCase):
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
