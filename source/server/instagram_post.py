"""Read image attachments of a public Instagram embed without a login or script execution."""
import json
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request

from .image_download import public_opener


class EmbedPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.script = False
        self.records = []

    def handle_starttag(self, tag, attrs):
        self.script = tag == 'script'

    def handle_endtag(self, tag):
        if tag == 'script':
            self.script = False

    def handle_data(self, text):
        if not self.script or len(text) > 2_000_000 or '"contextJSON"' not in text:
            return
        for key in re.finditer(r'"contextJSON"\s*:\s*(?=")', text):
            try:
                encoded, _ = json.JSONDecoder().raw_decode(text,key.end())
                record = json.loads(encoded)
                if isinstance(record,dict):
                    self.records.append(record)
            except (TypeError, ValueError, RecursionError):
                continue


def images_from_record(record, code):
    context = record.get('context') or {}
    media = (record.get('gql_data') or {}).get('shortcode_media') or {}
    if context.get('shortcode') != code or media.get('shortcode') != code:
        raise ValueError('嵌入数据与原帖编号不符')
    if context.get('copyright_blocked') is not False or (media.get('owner') or {}).get('is_private'):
        raise ValueError('当前作品未确认允许公开嵌入')
    kind = media.get('__typename')
    if kind != context.get('type') or kind not in ('GraphImage','GraphSidecar') or media.get('is_video') is not False:
        raise ValueError('未确认到静态作品，未保存视频封面')
    nodes = [media]
    if kind == 'GraphSidecar':
        children = media.get('edge_sidecar_to_children') or {}
        edges = children.get('edges')
        if not isinstance(edges,list) or not 1 <= len(edges) <= 100 or (children.get('page_info') or {}).get('has_next_page'):
            raise ValueError('轮播图片列表缺失或不完整')
        nodes = [edge.get('node') or {} for edge in edges]
    images, skipped = [], 0
    ids = set()
    for node in nodes:
        if not node.get('id') or node['id'] in ids:
            raise ValueError('附件缺少独立编号或重复')
        ids.add(node['id'])
        if node.get('is_video') is True:
            skipped += 1
            continue
        url = node.get('display_url') or ''
        parsed = urlsplit(url)
        if (node.get('is_video') is not False or parsed.scheme != 'https' or parsed.port not in (443,None)
                or parsed.username is not None or parsed.password is not None
                or not (parsed.hostname or '').endswith(('.cdninstagram.com','.fbcdn.net'))):
            raise ValueError('图片来源或媒体类型未确认')
        images.append({'url':url})
    if not images:
        raise ValueError('该作品仅含视频，未保存封面')
    author = (media.get('owner') or {}).get('username')
    return {'canonical_url':'https://www.instagram.com/p/'+code+'/', 'platform':'instagram',
            'images':images,'author_handle':author,'page_title':(author or 'Instagram')+' '+code,
            'scope':'verified_embed_images','warning':f'已核对公开作品中的 {len(images)} 张图片；另有 {skipped} 个视频未采集。'}


def resolve_embed(code):
    url = 'https://www.instagram.com/p/'+code+'/embed/'
    class EmbedRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, status, msg, headers, newurl):
            if newurl.rstrip('/') != url.rstrip('/'):
                raise ValueError('公开嵌入页跳转，未取得原帖')
            return super().redirect_request(req,fp,status,msg,headers,newurl)
    with public_opener(EmbedRedirect()).open(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=12) as response:
        raw = response.read(3*1024*1024+1)
        if len(raw)>3*1024*1024 or response.url.rstrip('/') != url.rstrip('/'):
            raise ValueError('嵌入页过大或身份变化')
    page = EmbedPage()
    page.feed(raw.decode('utf-8','replace'))
    page.close()
    matches = [record for record in page.records if (record.get('context') or {}).get('shortcode')==code]
    if len(matches)!=1:
        raise ValueError('未取得唯一的公开原帖，浏览器已保存的文件可用 reftray_find_saved 查询')
    return images_from_record(matches[0], code)
