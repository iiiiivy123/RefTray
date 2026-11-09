"""Adapt yt-dlp's licensed BiliBili extractor to the collector's guarded single-work transport."""
import re
from copy import deepcopy
from urllib.parse import parse_qs,urlsplit


def supported_cdn_url(value):
    try:
        u = urlsplit(value or '')
        return (u.scheme == 'https' and not u.username and not u.password and u.port in (None, 443)
                and any(u.hostname == d or (u.hostname or '').endswith('.'+d)
                        for d in ('bilivideo.com', 'bilivideo.cn')))
    except ValueError:
        return False


def prefer_supported_cdn(play_info):
    """Use only alternatives supplied for this exact track by Bilibili."""
    result = deepcopy(play_info)
    dash = result.get('dash') or {}
    tracks = [*(dash.get('video') or []), *(dash.get('audio') or []),
              *((dash.get('dolby') or {}).get('audio') or []), *(result.get('durl') or [])]
    flac = (dash.get('flac') or {}).get('audio')
    if flac:
        tracks.append(flac)
    for track in tracks:
        candidates = [track.get('baseUrl'), track.get('base_url'), track.get('url'),
                      *(track.get('backupUrl') or track.get('backup_url') or [])]
        selected = next((url for url in candidates if supported_cdn_url(url)), None)
        if selected:
            for key in ('baseUrl', 'base_url', 'url'):
                if key in track:
                    track[key] = selected
    return result


def single_source(data,url,output_format='original'):
    from .video import validate_url
    parsed=urlsplit(url)
    bv=re.fullmatch(r'/video/(BV[0-9A-Za-z]{10})/?',parsed.path)[1]
    part=int(parse_qs(parsed.query).get('p',['1'])[0])
    expected={f'{bv}_p{part}'} | ({bv} if part==1 else set())
    if (data.get('_type') not in (None,'video') or data.get('entries') or data.get('extractor_key')!='BiliBili'
            or str(data.get('id')) not in expected or data.get('has_drm') or data.get('is_live') or data.get('is_preview')):
        raise ValueError('B站解析结果不是指定稿件/分P的完整单视频，未读取合集或其他作品')
    web=data.get('webpage_url')
    if web:
        from .source_identity import canonical
        if canonical(web)[0]!=url:raise ValueError('B站解析返回的稿件地址或分P与请求不一致')
    streams=data.get('requested_formats') or [data]
    if not 1<=len(streams)<=2:raise ValueError('B站返回了未知轨道组合')
    for track in streams:
        if track.get('has_drm'):
            raise ValueError('当前B站音视频轨道受保护')
        if not supported_cdn_url(track.get('url')) or track.get('protocol','https') not in ('https','http'):
            raise ValueError('当前B站音视频轨道没有可用的常规HTTPS下载地址')
        validate_url(track['url'])
    audio=next((s for s in streams if s.get('acodec') not in (None,'none')),None)
    videos=[s for s in streams if s.get('vcodec') not in (None,'none')]
    common={'canonical_url':url,'page_title':data.get('title'),'author_name':data.get('uploader'),
            'duration':data.get('duration'),'kind':'video','source_identity':{'bvid':bv,'part':part,'extractor':'yt-dlp BiliBili'}}
    if output_format=='audio' and audio and audio.get('vcodec') in (None,'none'):
        return {'media':[{**common,'url':audio['url'],'media_kind':'bilibili-audio','quality':'AAC / 可用音轨'}]}
    if len(videos)!=1:raise ValueError('B站未返回当前作品唯一有效的视频轨道')
    video=videos[0]
    if audio is None:raise ValueError('B站未返回有效音轨；未把不完整视频标记为成功')
    source={**common,'url':video['url'],'quality':f"{video.get('height','?')}p · {video.get('vcodec','?')}",'media_kind':'bilibili-file'}
    if audio is not video:source.update(audio_url=audio['url'],media_kind='bilibili-dash')
    return {'media':[source]}
