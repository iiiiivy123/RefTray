"""MCP schemas and task queries shared with the browser request contract."""
import json
import re
from urllib.error import HTTPError
from urllib.parse import urlencode
from .capture_request import CaptureOptions

OPTIONS = CaptureOptions.model_json_schema()
OPTIONS.pop('title', None)
URL = {'type': 'string', 'minLength': 1}
ID = {'type': 'string', 'pattern': r'^[\w-]{1,100}$'}
SCOPE = {'type': 'string', 'enum': ['single', 'author', 'board']}
MODE = {'type': 'string', 'enum': ['images', 'text', 'plain', 'video']}
CAPTURE = {'url': URL, 'mode': MODE, 'scope': SCOPE, 'options': OPTIONS}
TOOLS = [
 ('reftray_check_update', '检查 RefTray 官方正式新版；不下载、不安装', {}),
 ('reftray_install_update', '用户要求更新时，下载并安装已检查的正式版本；一并更新后台、扩展和 MCP，保留素材与设置。返回后在后台执行；安装会关闭旧 MCP 连接，重连后用 reftray_update_status 查询结果', {'version': {'type':'string','pattern':r'^\d{1,5}\.\d{1,5}\.\d{1,5}$'}}),
 ('reftray_update_status', '查看持久保存的更新进度、结果和备份位置；升级或 MCP 重连后仍可查询', {}),
 ('reftray_restore_update', '用户要求恢复旧版本时，使用已核验的完整旧程序备份恢复后台、扩展和 MCP；保留当前素材、设置和记录。恢复期间连接会关闭，重新连接后查询 reftray_update_status', {}),
 ('reftray_capture_batch', '采集作者、画板、小红书收藏夹或播放列表；复用扩展批量流程，跳过不符内容，返回任务号', {**CAPTURE, 'scope': {'type':'string','enum':['author','board']}}),
 ('reftray_preview_browser', '在 Chrome 后台识别当前作品的图片、GIF和视频数量；scan=true 时向下加载后扫描，不保存文件', {'url':URL, 'scan':{'type':'boolean'}}),
 ('reftray_task_control', '暂停、继续、停止任务；retry 只重试批量失败项。已保存文件保留，恢复返回可查询的任务号', {'job_id':ID,'kind':{'type':'string','enum':['task','collect','video','local']},'action':{'type':'string','enum':['pause','resume','stop','retry']}}),
 ('reftray_list_tasks', '按状态分页查看任务和结果', {'page':{'type':'integer','minimum':1},'view':{'type':'string','enum':['all','running','unfinished','failed']}}),
 ('reftray_diagnostics', '按任务号或诊断号查看具体失败原因；不需要打开管理页', {'job_id':ID,'diagnostic_id':{'type':'string'},'code':{'type':'string'}}),
 ('reftray_search_saved', '按标题、平台和分类搜索已保存作品，返回实际目录', {'query':{'type':'string'},'platform':{'type':'string'},'category':{'type':'string'},'page':{'type':'integer','minimum':1}}),
 ('reftray_process_local', '把指定本地视频另存为 GIF 或提取音频，保留原文件', {'path':{'type':'string'},'format':{'type':'string','enum':['gif','audio']}}),
]
REQUIRED = {
 'reftray_check_update':[], 'reftray_install_update':['version'], 'reftray_update_status':[], 'reftray_restore_update':[],
 'reftray_status':[], 'reftray_download_post':['url'], 'reftray_capture_browser':['url'],
 'reftray_capture_batch':['url','scope'], 'reftray_preview_browser':['url'],
 'reftray_download_videos':['url'], 'reftray_stop_queue':['job_id'], 'reftray_find_saved':['url'],
 'reftray_resolve_video':['url'], 'reftray_download_video':['url'], 'reftray_job_status':['job_id','kind'],
 'reftray_task_control':['job_id','kind','action'], 'reftray_list_tasks':[], 'reftray_diagnostics':[],
 'reftray_search_saved':[], 'reftray_process_local':['path','format'],
}

def control(backend, args):
    key, kind, action = args['job_id'], args['kind'], args['action']
    if not re.fullmatch(r'[\w-]{1,100}', key):
        raise ValueError('无效的任务编号')
    if kind == 'task':
        record = backend.api('/tasks/'+key)['item']
        if record.get('mode') == 'browser-capture':
            return backend.api('/browser/control/'+key, {'action':action})
        if record.get('mode') == 'video-queue' and action == 'stop':
            return backend.api('/video/queue/'+key+'/stop', {})
        raise ValueError('此旧任务支持查看结果；请使用 Chrome 采集入口重新提交后控制')
    if kind == 'local' and action == 'stop':
        return backend.api('/tools/media/'+key+'/stop', {})
    if kind not in ('video', 'collect') or action not in ('pause', 'resume', 'stop'):
        raise ValueError('该任务不支持此操作')
    if kind == 'collect' and action != 'stop':
        raise ValueError('正在保存的单篇只支持本篇结束后停止；Chrome 批量可暂停和继续')
    return backend.api('/'+kind+'/control/'+key, {'action':{'pause':'paused','resume':'running','stop':'stopped'}[action]})

def diagnostics(backend, args):
    task = backend.api('/tasks/'+args['job_id'])['item'] if args.get('job_id') else None
    child, child_message = None, None
    if task and task.get('child_id'):
        try:
            child = backend.api('/tasks/'+task['child_id'])['item']
        except HTTPError as error:
            if error.code != 404:
                raise
            child_message = '采集明细尚未同步或已清理，下面保留主任务结果'
    ids = set(re.findall(r'\d{8}T\d{6}Z-[a-f0-9]{8}', json.dumps([task, child], ensure_ascii=False))) if task else None
    rows = backend.api('/diagnostics')['items']
    if args.get('diagnostic_id'):
        rows = [r for r in rows if r.get('id') == args['diagnostic_id']]
    elif ids is not None:
        rows = [r for r in rows if r.get('id') in ids]
    if args.get('code'):
        rows = [r for r in rows if r.get('code') == args['code']]
    return {'task':task, 'child':child, 'child_message':child_message, 'diagnostics':rows}

def extra_dispatch(name, args, backend):
    if name == 'reftray_check_update':
        return backend.api('/updates/check')
    if name == 'reftray_update_status':
        return backend.api('/updates/status')
    if name == 'reftray_restore_update':
        result = backend.api('/updates/restore', {})
        return {**result, 'message':'恢复已开始，当前素材、设置和记录保留。重新连接 RefTray 后，用 reftray_update_status 查看结果。'}
    if name == 'reftray_install_update':
        number = args.get('version')
        if not isinstance(number, str) or not re.fullmatch(r'\d{1,5}\.\d{1,5}\.\d{1,5}', number):
            raise ValueError('请先检查更新，再传入对应的正式版本号')
        result = backend.api('/updates/install', {'version':number})
        return {**result, 'message':'更新已开始，后台、扩展和 MCP 会一起更新。安装时旧 MCP 连接会关闭；重新连接后查询 reftray_update_status 查看结果。'}
    if name in ('reftray_capture_browser', 'reftray_capture_batch'):
        return backend.api('/browser/capture', {k:v for k,v in args.items() if k in CAPTURE})
    if name == 'reftray_preview_browser':
        return backend.api('/browser/capture', {'url':args['url'],'operation':'scan' if args.get('scan') else 'preview'})
    if name == 'reftray_task_control':
        return control(backend, args)
    if name == 'reftray_list_tasks':
        query = {'page':args.get('page',1), 'page_size':20}
        if args.get('view', 'all') != 'all':
            query['view'] = args['view']
        return backend.api('/tasks?'+urlencode(query))
    if name == 'reftray_diagnostics':
        return diagnostics(backend, args)
    if name == 'reftray_search_saved':
        return backend.api('/history?'+urlencode({'q':args.get('query',''),'platform':args.get('platform',''),'category':args.get('category',''),'page':args.get('page',1),'page_size':20}))
    if name == 'reftray_process_local':
        return backend.process_local(args['path'], args['format'])
    raise ValueError('Unknown tool')
