"""Isolated yt-dlp worker. X quotes/cards/retweets are outside the main-post scope."""
import json
import sys
if __name__=='__main__':sys.path.insert(0, sys.argv[1])
from yt_dlp import YoutubeDL
from yt_dlp.extractor.twitter import TwitterIE
from yt_dlp.extractor.bilibili import BiliBiliIE
from yt_dlp.utils import ExtractorError

class CollectorBiliIE(BiliBiliIE):
    @classmethod
    def ie_key(cls):return "BiliBili"
    def _download_playinfo(self,*args,**kwargs):
        data=super()._download_playinfo(*args,**kwargs)
        if data and (data.get("is_preview") or data.get("is_drm") or data.get("drm_tech_type")):
            raise ExtractorError("Protected or preview-only playback is not supported",expected=True)
        return data

class MainPostTwitterIE(TwitterIE):
    # Replace the registered Twitter extractor without copying its network logic.
    @classmethod
    def ie_key(cls):return 'Twitter'

    def _extract_status(self, tweet_id):
        status=super()._extract_status(tweet_id)
        if str(status.get('id_str') or status.get('id') or '') != tweet_id:
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
