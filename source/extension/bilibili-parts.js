// A multi-part work is a finite list from its own loaded metadata, not sidebar links.
(() => {
  function key(value) {
    try {
      const u=new URL(value),id=/^(www\.)?bilibili\.com$/.test(u.hostname)&&u.pathname.match(/^\/video\/(BV[\da-zA-Z]{10})\/?$/)?.[1];
      const parts=u.searchParams.getAll('p'),part=Number(parts[0]||1);
      if(!id||parts.length>1||parts[0]===''||!Number.isSafeInteger(part)||part<1)return null;
      return id+':'+part;
    } catch(_){return null;}
  }
  function read(url,state) {
    const identity=key(url),video=state?.videoData;
    if(!identity||video?.bvid!==identity.split(':')[0]||!/^\d+$/.test(String(video?.owner?.mid||'')))throw Error('视频选集尚未加载，请等待当前稿件加载后重试');
    const pages=video.pages;
    if(!Array.isArray(pages)||pages.length<2)throw Error('当前稿件没有分P选集');
    const seen=new Set(),cids=new Set();
    for(const page of pages){
      if(!Number.isSafeInteger(page.page)||page.page<1||!/^\d+$/.test(String(page.cid||''))||seen.has(page.page)||cids.has(String(page.cid)))throw Error('选集编号未能核对，请刷新当前稿件后重试');
      seen.add(page.page);cids.add(String(page.cid));
    }
    if(!seen.has(Number(identity.split(':')[1])))throw Error('当前分P不在该选集中');
    const base='https://www.bilibili.com/video/'+video.bvid+'/',owner=video.owner.name||String(video.owner.mid);
    const parts=[...pages].sort((a,b)=>a.page-b.page).map(p=>({page:p.page,cid:String(p.cid),title:String(p.part||''),duration:p.duration,url:base+(p.page>1?'?p='+p.page:'')}));
    return {author_url:base,author_name:owner,handle:String(video.owner.mid),view:'parts',parts,urls:parts.map(p=>p.url),
      list_url:base,list_kind:'collection',list_owner:owner,list_name:String(video.title||video.bvid).slice(0,200)};
  }
  const api={key,read};globalThis.CollectorBiliParts=api;
  if(typeof module!=='undefined'){module.exports=api;return;}
  if(typeof document!=='undefined')try{return read(location.href,window.__INITIAL_STATE__);}catch(error){return {error:error.message};}
})();
