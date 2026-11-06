// Only visible Pin cards carrying evidence of membership in this board or author list.
(() => {
  function snapshot(value,doc) {
    const url=new URL(value);
    const route=url.pathname.match(/^\/(boards|user)\/([\w-]+)\/?$/);
    if(!/^(www\.)?huaban\.com$/.test(url.hostname)||!route||route[1]==='boards'&&!/^\d+$/.test(route[2]))
      throw Error('请打开花瓣具体画板或作者采集列表');
    const board=route[1]==='boards', urls=new Set();
    for(const node of doc.querySelectorAll('a[href*="/pins/"]')){
      const pin=new URL(node.href,url);
      const id=pin.pathname.match(/^\/pins\/(\d+)\/?$/)?.[1];
      if(pin.origin!==url.origin||!id||!node.getClientRects().length)continue;
      const card=node.closest('[data-pin-id],.pin-card,.pin.wfc');
      if(!card||card.closest('nav,aside,[hidden],[aria-hidden="true"],[data-module-name*="推荐"],.recommendations,.related-pins'))continue;
      if(card.dataset.pinId && card.dataset.pinId!==id)continue;
      const owner=board?card.dataset.boardId:card.dataset.userId;
      const matchesLink=[...card.querySelectorAll('a[href]')].some(a=>{
        const u=new URL(a.href,url);
        return u.origin===url.origin && u.pathname.replace(/\/$/,'')===url.pathname.replace(/\/$/,'');
      });
      if(owner ? owner!==route[2] : !matchesLink)continue;
      urls.add(url.origin+'/pins/'+id);
    }
    if(!urls.size)throw Error('尚未确认属于当前花瓣列表的作品，请等待作品卡片加载');
    const listUrl=url.origin+url.pathname.replace(/\/$/,'');
    const name=(doc.querySelector('main h1,h1')?.textContent.trim()||((board?'画板 ':'作者 ')+route[2])).slice(0,180);
    return {author_url:listUrl,author_name:name,list_url:listUrl,list_kind:board?'board':'works',list_name:name,urls:[...urls]};
  }
  if(typeof module!=='undefined'){module.exports={snapshot};return;}
  try{return snapshot(location.href,document);}catch(error){return {error:error.message};}
})();
