import unittest
from server.resolve_public_media import format_selector
class WorkerFormatTests(unittest.TestCase):
    def test_public_audio_keeps_existing_muxed_video_envelope(self):
        # Public providers still use the established video->audio output pipeline.
        self.assertIn('bestvideo',format_selector('best','audio'))
    def test_bili_video_prefers_compatible_avc_without_requiring_transcoder(self):
        self.assertIn('[vcodec^=avc1]',format_selector('1080','original',True))

    def test_bili_audio_is_independent_of_video_track(self):
        self.assertEqual(format_selector('best','audio',True),'bestaudio[ext=m4a]/bestaudio/best')
if __name__=='__main__':unittest.main()
