// A visible work grid is a list. Album covers are navigation, never works.
(() => {
  function profileOwner(doc,url,handle){
    const clean=value=>typeof value==='string'?value.trim():'';
    const matchesProfile=value=>{
      if(!clean(value))return false;
      try{
        const candidate=new URL(value,url);
        return /^https?:$/.test(candidate.protocol)&&/(^|\.)artstation\.com$/.test(candidate.hostname)&&candidate.pathname.replace(/\/$/,'').toLowerCase()==='/'+handle.toLowerCase();
      }catch(_){return false;}
    };
    // Page JSON may contain both the logged-in user and the viewed artist.
    // Accept a name only on an object whose own identity matches this route.
    let nodes=0;
    function visit(value,depth=0){
      if(!value||typeof value!=='object'||depth>18||++nodes>15000)return '';
      const username=clean(value.username);
      const person=[].concat(value['@type']||[]).includes('Person');
      const matches=username?username.toLowerCase()===handle.toLowerCase():person&&(matchesProfile(value.url)||matchesProfile(value['@id']));
      if(matches){const name=clean(value.full_name)||clean(value.name);if(name)return name;}
      for(const child of Object.values(value)){const name=visit(child,depth+1);if(name)return name;}
      return '';
    }
    for(const script of doc.querySelectorAll('script[type="application/json"],script[type="application/ld+json"]')){
      if(script.textContent.length>8*1048576)continue;
      try{const name=visit(JSON.parse(script.textContent));if(name)return name;}catch(_){}
    }
    // Generic .user-name also occurs in account navigation. Require a profile
    // link on the name itself; an unrelated name elsewhere is not owner evidence.
    for(const node of doc.querySelectorAll('.profile-name,[data-profile-name],.user-name')){
      if(node.closest('[hidden],[aria-hidden="true"],nav,header,footer,aside,.recommendations,.related-projects')||!node.getClientRects().length)continue;
      if(matchesProfile(node.closest('a[href]')?.href)&&clean(node.textContent))return clean(node.textContent);
    }
    return handle;
  }
  function profile(url,doc){
    const u=new URL(url),route=u.pathname.match(/^\/([\w-]+)(?:\/albums\/(\d+))?\/?$/);
    if(!/(^|\.)artstation\.com$/.test(u.hostname)||!route||/^(artwork|search|marketplace|learning|jobs|blogs|channels|community|following|prints)$/.test(route[1]))throw Error('请进入作者作品列表或具体合集');
    const visible=n=>!n.closest('[hidden],[aria-hidden="true"],nav,header,footer,aside,.recommendations,.related-projects')&&n.getClientRects().length>0;
    const links=[...doc.querySelectorAll('a[href]')].filter(visible);
    const albumId=route[2]||u.searchParams.get('album_id');
    // The overview has image-bearing album cards. Do not recursively enter them.
    const albums=links.filter(a=>a.querySelector('img')&&(()=>{try{const p=new URL(a.href,u);return p.hostname===u.hostname&&(p.pathname.match(/^\/[\w-]+\/albums\/\d+/)||p.searchParams.has('album_id'));}catch(_){return false;}})());
    if(albums.length&&!albumId)throw Error('当前显示合集封面，请进入一个合集，再批量保存其中的作品');
    if(albumId&&!/^\d+$/.test(albumId))throw Error('未确认当前合集编号');
    const urls=new Set();
    for(const a of links){
      if(!a.querySelector('img')||a.closest('.album-card,[data-album-card]'))continue;
      try{const work=new URL(a.href,u);if(/(^|\.)artstation\.com$/.test(work.hostname)&&/^\/artwork\/[a-zA-Z0-9]+\/?$/.test(work.pathname))urls.add('https://www.artstation.com'+work.pathname.replace(/\/$/,''));}catch(_){}
    }
    if(!urls.size)throw Error('尚未识别到明确的作品图片列表；请进入作品列表或具体合集并等待加载');
    const text=selector=>(doc.querySelector(selector)?.textContent||'').trim();
    const owner=profileOwner(doc,u,route[1]);
    const name=albumId?(text('.album-title,[data-album-title],main h1')||'合集 '+albumId):'作品';
    const identity='https://www.artstation.com/'+route[1]+(albumId?'/albums/'+albumId:'');
    return {author_url:identity,author_name:owner,view:albumId?'album':'works',urls:[...urls],list_url:identity,list_kind:albumId?'album':'works',list_name:name,list_owner:owner};
  }
  if(typeof module!=='undefined'){module.exports={profile};return;}
  try{return profile(location.href,document);}catch(e){return {error:e.message};}
})();
