"""Isolated yt-dlp worker. X quotes/cards/retweets are outside the main-post scope."""
import json
import sys
from pathlib import Path
if __name__=='__main__':sys.path[:0]=[str(Path(__file__).resolve().parents[1]),sys.argv[1]]
from yt_dlp import YoutubeDL
from yt_dlp.extractor.twitter import TwitterIE
from yt_dlp.extractor.bilibili import BiliBiliIE
from yt_dlp.utils import ExtractorError

class CollectorBiliIE(BiliBiliIE):
    @classmethod
    def ie_key(cls):return "BiliBili"
    def extract_formats(self, play_info):
        if __package__:
            from .bili_resolver import prefer_supported_cdn, supported_cdn_url, track_backups
        else:
            from server.bili_resolver import prefer_supported_cdn, supported_cdn_url, track_backups
        formats = super().extract_formats(prefer_supported_cdn(play_info))
        # Filter before yt-dlp ranks quality; an unusable high-quality track must
        # not hide a downloadable track from this same, identity-checked part.
        formats = [fmt for fmt in formats if supported_cdn_url(fmt.get('url'))]
        backups = track_backups(play_info)
        for fmt in formats:fmt['collector_backup_urls'] = backups.get(fmt['url'], [])
        if not formats:
            raise ExtractorError('当前B站音视频轨道没有可用的常规HTTPS下载地址', expected=True)
        return formats
    def _download_playinfo(self,*args,**kwargs):
        data=super()._download_playinfo(*args,**kwargs)
        if data and (data.get("is_preview") or data.get("is_drm") or data.get("drm_tech_type")):
            raise ExtractorError("Protected or preview-only playback is not supported",expected=True)
        return data

class MainPostTwitterIE(TwitterIE):
    # Replace the registered Twitter extractor without copying its network logic.
    @classmethod
    def ie_key(cls):return 'Twitter'

    def _graphql_to_legacy(self, data, tweet_id):
        status = super()._graphql_to_legacy(data, tweet_id)
        # yt-dlp 2026.10.26 drops the main result's rest_id during conversion.
        # Read only its documented direct envelope, never IDs in quoted results.
        result = data.get('tweetResult', {}).get('result', {})
        if result.get('__typename') == 'TweetWithVisibilityResults':
            result = result.get('tweet', {})
        rest_id = result.get('rest_id')
        if status.get('id_str') in (None, '') and status.get('id') in (None, '') and rest_id not in (None, ''):
            status['id_str'] = str(rest_id)
        return status

    def _call_syndication_api(self, tweet_id):
        status = super()._call_syndication_api(tweet_id)
        # Upstream combines quoted_tweet.mediaDetails with the main media list.
        # Keep only the main tweet's own, already converted media objects.
        status['extended_entities'] = {'media': status.get('mediaDetails') or []}
        status.pop('quoted_tweet', None)
        return status

    def _extract_status(self, tweet_id):
        status=super()._extract_status(tweet_id)
        ids = [str(status[key]) for key in ('id_str', 'id') if status.get(key) not in (None, '')]
        if not ids:
            raise ValueError('主帖身份字段缺失，无法确认当前作品；请打开原帖详情后重试')
        if any(value != str(tweet_id) for value in ids):
            raise ValueError('主帖身份不匹配，拒绝转帖或其他作品')
        status.pop('quoted_status',None)
        status.pop('card',None)
        self.motion_kinds={str(m.get('id_str') or m.get('id')):'gif' if m.get('type')=='animated_gif' else 'video' for m in status.get('extended_entities',{}).get('media',[])}
        return status

    def _real_extract(self,url):
        result=super()._real_extract(url)
        for item in result.get('entries') or [result]:
            item['collector_kind']=self.motion_kinds.get(str(item.get('id')),'video')
        return result

def format_selector(quality='best',output_format='original',single_bili=False):
    if quality not in ('best','1080','720','480'):raise ValueError('unsupported quality')
    if output_format=='audio' and single_bili:return 'bestaudio[ext=m4a]/bestaudio/best'
    cap = '' if quality == 'best' else '[height<='+quality+']'
    if single_bili:return 'bestvideo[vcodec^=avc1]'+cap+'+bestaudio[acodec^=mp4a]/bestvideo'+cap+'+bestaudio/best'+cap
    return 'bestvideo'+cap+'+bestaudio/best'+cap

options={'quiet':True,'no_warnings':True,'noplaylist':True,'skip_download':True,
         'socket_timeout':15,'retries':0,'extractor_retries':0,'format':format_selector()}
if __name__=='__main__':
    options['format']=format_selector(sys.argv[4] if len(sys.argv)>4 else 'best',sys.argv[5] if len(sys.argv)>5 else 'original',sys.argv[2].startswith('https://www.bilibili.com/video/'))
    if len(sys.argv)>3 and sys.argv[3]:options['js_runtimes']={'node':{'path':sys.argv[3]}}
    with YoutubeDL(options) as downloader:
        downloader.add_info_extractor(MainPostTwitterIE(downloader))
        downloader.add_info_extractor(CollectorBiliIE(downloader))
        info=downloader.extract_info(sys.argv[2],download=False)
        print(json.dumps(downloader.sanitize_info(info),ensure_ascii=False))
