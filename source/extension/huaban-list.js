// Only visible Pin cards carrying evidence of membership in this board or author list.
(() => {
  function snapshot(value,doc,onCard) {
    const url=new URL(value);
    const route=url.pathname.match(/^\/(?:discovery\/)?(boards|user)\/([\w-]+)\/?$/);
    if(!/^(www\.)?huaban\.com$/.test(url.hostname)||!route||route[1]==='boards'&&!/^\d+$/.test(route[2]))
      throw Error('请打开花瓣具体画板或作者采集列表');
    const board=route[1]==='boards', urls=new Set(),pins={};
    const adapter=globalThis.CollectorHuaban||(typeof require==='function'?require('./huaban.js'):null);
    const add=(id,card)=>{
      const canonical=url.origin+'/pins/'+id;urls.add(canonical);
      onCard?.(id,card);
      const image=adapter?.cardImage(card,id);
      if(image)pins[canonical]={platform:'huaban',canonical_url:canonical,page_title:image.alt||('花瓣 '+id),body_text:'',images:[image],has_video:false,_media:[],extraction_warnings:[]};
    };
    const listPath='/'+route[1]+'/'+route[2];
    const excluded='nav,aside,[hidden],[aria-hidden="true"],[data-module-name*="推荐"],.recommendations,.related-pins';
    // The modern board grid uses clickable divs. Its nested analytics node carries
    // both identities; a recommendation with another board must never be included.
    if(board)for(const card of doc.querySelectorAll('[data-pin-id]')){
      const id=card.dataset.pinId;
      if(!/^\d+$/.test(id||'')||!card.getClientRects().length||card.closest(excluded))continue;
      const evidence=[card,...card.querySelectorAll('[data-board-id][data-content-id]')];
      if(evidence.some(node=>node.dataset.boardId===route[2]&&(node===card||node.dataset.contentId===id)&&!node.closest(excluded)))add(id,card);
    }
    for(const node of doc.querySelectorAll('a[href*="/pins/"]')){
      const pin=new URL(node.href,url);
      const id=pin.pathname.match(/^\/pins\/(\d+)\/?$/)?.[1];
      if(pin.origin!==url.origin||!id||!node.getClientRects().length)continue;
      const card=node.closest('[data-pin-id],.pin-card,.pin.wfc');
      if(!card||card.closest(excluded))continue;
      if(card.dataset.pinId && card.dataset.pinId!==id)continue;
      const owner=board?card.dataset.boardId:card.dataset.userId;
      const matchesLink=[...card.querySelectorAll('a[href]')].some(a=>{
        const u=new URL(a.href,url);
        return u.origin===url.origin && u.pathname.replace(/^\/discovery\//,'/').replace(/\/$/,'')===listPath;
      });
      if(owner ? owner!==route[2] : !matchesLink)continue;
      add(id,card);
    }
    if(!urls.size)throw Error('尚未确认属于当前花瓣列表的作品，请等待作品卡片加载');
    const listUrl=url.origin+listPath;
    const name=(doc.querySelector('main h1,h1')?.textContent.trim()||((board?'画板 ':'作者 ')+route[2])).slice(0,180);
    return {author_url:listUrl,author_name:name,list_url:listUrl,list_kind:board?'board':'works',list_name:name,urls:[...urls],pins};
  }
  function openPin(listUrl,pinUrl,view=globalThis){
    const normal=value=>new URL(value).href.replace('/discovery/','/').replace(/\/$/,'');
    if(normal(view.location.href)!==normal(listUrl))throw Error('已离开原花瓣列表，停止读取');
    const target=new URL(pinUrl),id=target.pathname.match(/^\/pins\/(\d+)\/?$/)?.[1];
    if(target.origin!==new URL(listUrl).origin||!id||target.search)throw Error('花瓣作品身份不匹配');
    const adapter=globalThis.CollectorHuaban||(typeof require==='function'?require('./huaban.js'):null);
    let image;
    snapshot(view.location.href,view.document,(member,card)=>{if(member===id)image ||= adapter.cardElement(card,id);});
    if(!image)return {opened:false};
    const token={opened:true,listUrl:view.location.href,pinUrl:target.href,historyLength:view.history.length,documentId:view.performance.timeOrigin,entryKey:view.navigation?.currentEntry?.key};
    image.click();return token;
  }
  function restorePin(token,view=globalThis){
    if(view.location.href===token.listUrl)return {restoring:false};
    const samePin=view.location.href.replace(/\/$/,'')===token.pinUrl.replace(/\/$/,'');
    if(!samePin||view.performance.timeOrigin!==token.documentId)return {changed:true};
    // Opening a new Pin after Back replaces the forward entry, so history.length
    // can stay unchanged. Identify our exact preceding entry instead of its count.
    if(token.entryKey){
      const current=view.navigation?.currentEntry;
      const previous=view.navigation?.entries().find(entry=>entry.index===current?.index-1);
      if(previous?.key!==token.entryKey||previous.url!==token.listUrl)return {changed:true};
    }else if(view.history.length!==token.historyLength+1)return {changed:true};
    view.history.back();return {restoring:true};
  }
  globalThis.CollectorHuabanList={snapshot,openPin,restorePin};
  if(typeof module!=='undefined'){module.exports={snapshot,openPin,restorePin};return;}
  return (async()=>{
    const expected=location.href;
    for(let attempt=0;attempt<16;attempt++){
      if(location.href!==expected)return {error:'花瓣列表已切换，停止读取'};
      try{return snapshot(expected,document);}catch(error){
        if(!error.message.startsWith('尚未确认属于当前花瓣列表')||attempt===15)return {error:error.message};
      }
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  })();
})();
