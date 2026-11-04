"""Offline contracts exercised through installed yt-dlp conversion methods."""
import copy
import unittest
from unittest.mock import patch

from yt_dlp import YoutubeDL
from yt_dlp.extractor.twitter import TwitterIE
from server.resolve_public_media import MainPostTwitterIE


class TwitterIdentityTests(unittest.TestCase):
    def setUp(self):
        self.ie = MainPostTwitterIE(YoutubeDL({'quiet': True, 'no_warnings': True}))

    def extract_graphql(self, result):
        # Use upstream _extract_status -> overridden converter, not a mocked status.
        with patch.object(TwitterIE, 'is_logged_in', False), patch.object(TwitterIE, '_selected_api', 'graphql'), patch.object(self.ie, '_call_graphql_api', return_value={'tweetResult': {'result': copy.deepcopy(result)}}):
            return self.ie._extract_status('123')

    def test_rest_id_survives_real_upstream_conversion(self):
        result = {'__typename': 'Tweet', 'rest_id': '123', 'legacy': {'full_text': 'main'}}
        self.assertNotIn('id_str', TwitterIE._graphql_to_legacy(self.ie, {'tweetResult': {'result': copy.deepcopy(result)}}, '123'))
        self.assertEqual(self.extract_graphql(result)['id_str'], '123')

    def test_visibility_envelope_uses_only_direct_tweet(self):
        self.assertEqual(self.extract_graphql({'__typename': 'TweetWithVisibilityResults', 'tweet': {'rest_id': '123', 'legacy': {}}})['id_str'], '123')

    def test_quote_id_cannot_fill_missing_main_identity(self):
        with self.assertRaisesRegex(ValueError, '身份字段缺失'):
            self.extract_graphql({'legacy': {}, 'quoted_status_result': {'result': {'rest_id': '123', 'legacy': {'id_str': '123'}}}})

    def test_other_main_id_is_a_mismatch_not_missing(self):
        with self.assertRaisesRegex(ValueError, '身份不匹配'):
            self.extract_graphql({'rest_id': '456', 'legacy': {}})

    def test_retweet_does_not_inherit_requested_id(self):
        with self.assertRaisesRegex(ValueError, '身份不匹配'):
            self.extract_graphql({'rest_id': '123', 'legacy': {'retweeted_status_result': {'result': {'legacy': {'id_str': '456'}}}}})

    def test_legacy_numeric_id_and_conflicting_ids(self):
        with patch.object(TwitterIE, '_extract_status', return_value={'id': 123}):
            self.assertEqual(self.ie._extract_status('123')['id'], 123)
        with patch.object(TwitterIE, '_extract_status', return_value={'id_str': '123', 'id': 456}):
            with self.assertRaisesRegex(ValueError, '身份不匹配'):
                self.ie._extract_status('123')

    def test_syndication_never_includes_quoted_media(self):
        fixture = {'id_str': '123', 'mediaDetails': [{'type': 'video', 'video_info': {'variants': [{'url': 'https://video.twimg.com/ext_tw_video/321/pu/vid/avc1/720x720/main.mp4'}]}}],
                   'quoted_tweet': {'id_str': '456', 'mediaDetails': [{'type': 'animated_gif', 'video_info': {'variants': [{'url': 'https://video.twimg.com/tweet_video/quoted.mp4'}]}}]}}
        with patch.object(TwitterIE, 'is_logged_in', False), patch.object(TwitterIE, '_selected_api', 'syndication'), patch.object(self.ie, '_download_json', return_value=copy.deepcopy(fixture)):
            status = self.ie._extract_status('123')
        self.assertEqual(len(status['extended_entities']['media']), 1)
        self.assertEqual(status['extended_entities']['media'][0]['type'], 'video')
        self.assertNotIn('quoted_tweet', status)


if __name__ == '__main__':
    unittest.main()
