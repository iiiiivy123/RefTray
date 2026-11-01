"""Stable media identity plus output parameters; signed URLs are not cache identities."""
import json
from urllib.parse import urlsplit, parse_qs
from .catalog import source_id


def complete_cached(path, value):
    """Do not reuse an unverified silent X video as a complete download."""
    if not path:
        return None
    if value.output_format == 'original' and (urlsplit(value.canonical_url).hostname or '').lower() in ('x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'):
        from .bilibili_media import inspect
        if not any(s.get('codec_type') == 'audio' for s in inspect(path).get('streams', [])):
            return None
    return path


def key(value):
    if value.media_kind == 'resolved':
        from .segmented_media import selection
        recipe = selection(value.resolver_id, value.canonical_url, value.url)
        media = [recipe.get('media_id'), [(f.get('format_id'), f.get('width'), f.get('height'), f.get('vcodec'), f.get('acodec')) for f in recipe['formats']]]
        if not media[0] or any(not f.get('format_id') for f in recipe['formats']):
            media = [value.url, value.audio_url]  # Unknown identities must not merge distinct media.
    else:
        def identity(url):
            if not url:
                return None
            u = urlsplit(url)
            # Keep unknown query parameters: they can identify a different asset or quality.
            tokens = {'expires', 'expire', 'deadline', 'signature', 'sign', 'token', 'wsTime', 'wsSecret', 'upsig', 'trid', 'oi', 'os'}
            query = {k: v for k, v in parse_qs(u.query, keep_blank_values=True).items() if k not in tokens}
            return [u.hostname, u.path, query]
        media = [identity(value.url), identity(value.audio_url)]
    scope = value.list_url if value.capture_scope == 'batch' else None
    return ('collector-list:' + scope + ':' if scope else '') + 'collector-output-v1:' + json.dumps([source_id(value.canonical_url), media, value.quality,
                value.output_format, value.trim_start, value.trim_end], sort_keys=True)
