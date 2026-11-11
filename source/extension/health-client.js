function reftrayApiError(response, body, path) {
  const reason=typeof body?.detail==='string'?body.detail:'本地服务请求失败';
  const route=String(path).split('?')[0];
  return response.status===404&&reason==='Not Found'
    ? `当前本地后台缺少所需接口，请退出旧采集后台并启动已安装的 RefTray。（HTTP 404 · ${route}）`
    : `${reason}（HTTP ${response.status} · ${route}）`;
}
// A browser POST supplies its extension origin. Previous backend versions only support GET.
async function reftrayHealth(url, request=fetch){
  const options={signal:AbortSignal.timeout(5000),cache:'no-store',redirect:'error'};
  const version=globalThis.chrome?.runtime?.getManifest?.().version;
  const endpoint=version ? url+'?extension_version='+encodeURIComponent(version) : url;
  let response=await request(endpoint,{...options,method:'POST'});
  if(response.status===405)response=await request(url,options);
  if(response.status===403)throw new Error('此扩展目录尚未与后台配对。请从托盘打开已登记的扩展目录，在 Chrome 中加载或刷新该扩展。');
  return response;
}
