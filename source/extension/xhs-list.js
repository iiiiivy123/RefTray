// Only the selected profile tab and its visible note cards define membership.
(() => {
  function profile(url,doc){
    const u=new URL(url),id=u.pathname.match(/^\/user\/profile\/([a-f0-9]{24})\/?$/i)?.[1];
    if(!/(^|\.)xiaohongshu\.com$/.test(u.hostname)||!id)throw Error('请打开具体的笔记或收藏列表');
    const selected=doc.querySelector('.user-page .reds-tab-item.active,.user .reds-tab-item.active,.reds-tabs-list .reds-tab-item.active,[role="tab"][aria-selected="true"]');
    const tab=(selected?.textContent||'').trim();
    if(!/^(笔记|收藏|Notes|Saved|Collections)$/i.test(tab))throw Error('未确认当前是笔记还是收藏列表，请先选择对应栏目');
    const favorites=/^(收藏|Saved|Collections)$/i.test(tab);
    const root=doc.querySelector('.feeds-container:not([hidden]),[role="tabpanel"]:not([hidden])');
    if(!root)throw Error('当前列表尚未加载');
    if(root.querySelector('a[href*="/collection/"],.collection-card,.board-card'))throw Error('当前是收藏夹总览，请进入有笔记图片的具体收藏夹');
    const name=(doc.querySelector('.user-name,.user-nickname')?.textContent||id).trim();
    const identity=u.origin+u.pathname.replace(/\/$/,'')+(favorites?'?tab=collections':'');
    return {list_url:identity,list_kind:favorites?'favorites':'works',list_name:favorites?'收藏':'笔记',list_owner:name,...(!favorites?{author_url:u.origin+u.pathname,author_name:name}:{})};
  }
  if(typeof module!=='undefined'){module.exports={profile};return;}
  try{return profile(location.href,document);}catch(e){return {error:e.message};}
})();
