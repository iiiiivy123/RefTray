// Finite video lists come from the current work's own metadata, never recommendations.
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
    if(!Array.isArray(pages)||pages.length<2)return readCollection(url,video);
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
  function readCollection(url,video) {
    const season=video.ugc_season,id=String(season?.id||''),owner=String(video.owner.mid);
    if(!/^\d+$/.test(id)||String(video.season_id)!==id||String(season.mid)!==owner)throw Error('当前视频没有可核对的分P或合集目录');
    if(!Array.isArray(season.sections)||!season.sections.length)throw Error('合集目录尚未加载完整，请稍后重新打开采集');
    const urls=[],seen=new Set(),sections=new Set();
    for(const section of season.sections){
      const sid=String(section.id||'');
      if(!/^\d+$/.test(sid)||sections.has(sid)||String(section.season_id)!==id||!Array.isArray(section.episodes))throw Error('合集分组身份未能核对，未读取其他列表');
      sections.add(sid);
      for(const item of section.episodes){
        const page=item.page,part=Number(page?.page),cid=String(item.cid||''),aid=String(item.aid||'');
        const target='https://www.bilibili.com/video/'+item.bvid+'/'+(part>1?'?p='+part:'');
        const identity=key(target);
        if(!identity||!Number.isSafeInteger(part)||part<1||!/^\d+$/.test(aid)||String(item.arc?.aid)!==aid||
          !/^\d+$/.test(cid)||String(page?.cid)!==cid||String(item.season_id)!==id||String(item.section_id)!==sid||
          String(item.arc?.author?.mid)!==owner||seen.has(identity))throw Error('合集条目身份未能核对，未保存推荐或其他UP主内容');
        seen.add(identity);urls.push(target);
      }
    }
    if(!Number.isSafeInteger(season.ep_count)||season.ep_count<1||urls.length!==season.ep_count)throw Error('合集目录尚未加载完整，请稍后重新打开采集');
    if(!seen.has(key(url)))throw Error('当前视频不在此合集中，未读取其他列表');
    const base='https://www.bilibili.com/video/'+video.bvid+'/',name=video.owner.name||owner;
    return {author_url:base,author_name:name,handle:owner,view:'collection',urls,
      list_url:'https://space.bilibili.com/'+owner+'/lists/'+id,list_kind:'collection',list_owner:name,list_name:String(season.title||'合集 '+id).slice(0,200)};
  }
  const api={key,read};globalThis.CollectorBiliParts=api;
  if(typeof module!=='undefined'){module.exports=api;return;}
  if(typeof document!=='undefined')try{return read(location.href,window.__INITIAL_STATE__);}catch(error){return {error:error.message};}
})();
