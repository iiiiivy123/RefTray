import unittest
from unittest.mock import patch
from server.media_resolver import pick
from server.segmented_media import selection
class PublicTrackTests(unittest.TestCase):
    def test_selected_hls_audio_without_codec_label_is_not_silently_discarded(self):
        # Ordinary public HLS sources may omit acodec for a positively identified audio-only rendition.
        info={'id':'public-nasa','duration':193,'requested_formats':[
            {'url':'https://video.twimg.com/video.m3u8','protocol':'m3u8_native','vcodec':'avc1.64001F','acodec':'none','ext':'mp4'},
            {'url':'https://video.twimg.com/audio.m3u8','protocol':'m3u8_native','vcodec':'none','acodec':None,'ext':'mp4'}]}
        with patch('server.segmented_media.guard_url'):
            source=pick(info,'https://x.com/NASA/status/2093704021114515475','x')['media'][0]
        tracks=selection(source['resolver_id'])['formats']
        self.assertEqual(len(tracks),2,'A selected audio rendition was lost before download')
        self.assertEqual(tracks[1]['vcodec'],'none')
if __name__=='__main__':unittest.main()
