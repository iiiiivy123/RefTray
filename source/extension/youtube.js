// Read only the selected, already-loaded playlist/channel list; exclude sidebar recommendations.
(() => {
  function profile(url,doc,state){
    const u=new URL(url),playlist=['/playlist','/watch'].includes(u.pathname)&&/^[\w-]+$/.test(u.searchParams.get('list')||'');
    const channel=/^\/(?:@[^/]+|channel\/[\w-]+)\/(videos|shorts)\/?$/.test(u.pathname);
    if(!/(^|\.)youtube\.com$/.test(u.hostname)||(!playlist&&!channel))throw Error('请打开具体YouTube播放列表，或频道的视频/Shorts列表');
    const root=doc.querySelector(playlist?(u.pathname==='/watch'?'ytd-watch-flexy #playlist ytd-playlist-panel-renderer':'ytd-browse:not([hidden]) ytd-playlist-video-list-renderer, ytd-playlist-video-list-renderer'):'ytd-browse:not([hidden]) ytd-rich-grid-renderer, ytd-browse:not([hidden]) ytd-grid-renderer');
    const urls=new Set();
    for(const a of root?.querySelectorAll('a[href]')||[]){
      if(a.closest('ytd-miniplayer,[hidden],ytd-ad-slot-renderer,ytd-promoted-video-renderer,[is-ad]'))continue;
      if(!a.closest(playlist?'ytd-playlist-video-renderer,ytd-playlist-panel-video-renderer,yt-lockup-view-model':'ytd-rich-item-renderer,ytd-grid-video-renderer,yt-lockup-view-model,ytm-shorts-lockup-view-model'))continue;
      try{const link=new URL(a.href,u),id=link.pathname==='/watch'?link.searchParams.get('v'):link.pathname.match(/^\/shorts\/([\w-]{11})/)?.[1];
        if(playlist&&link.searchParams.has('list')&&link.searchParams.get('list')!==u.searchParams.get('list'))continue;
        if(u.pathname==='/watch'&&link.searchParams.get('list')!==u.searchParams.get('list'))continue;
        if(/(^|\.)youtube\.com$/.test(link.hostname)&&/^[\w-]{11}$/.test(id||''))urls.add('https://www.youtube.com/watch?v='+id);
      }catch(_){}
    }
    // Modern channel layouts can expose the list as loaded renderer data before DOM links.
    // Only traverse the selected tab whose route matches this videos/shorts page.
    if(!urls.size){
      const tabs=state?.contents?.twoColumnBrowseResultsRenderer?.tabs||[];
      const selected=tabs.map(t=>t.tabRenderer).find(t=>t?.selected&&(()=>{try{return new URL(t.endpoint?.commandMetadata?.webCommandMetadata?.url,u).pathname.replace(/\/$/,'')===u.pathname.replace(/\/$/,'');}catch(_){return false;}})());
      const visit=(node,depth=0)=>{
        if(!node||typeof node!=='object'||depth>25)return;
        if(node.adSlotRenderer||node.promotedSparklesWebRenderer||node.richSectionRenderer)return;
        const video=node.playlistVideoRenderer||node.playlistPanelVideoRenderer||node.videoRenderer||node.gridVideoRenderer||node.reelItemRenderer;
        const listId=video?.navigationEndpoint?.watchEndpoint?.playlistId;
        if(playlist&&listId&&listId!==u.searchParams.get('list'))return;
        const lockup=node.lockupViewModel;
        const id=video?.videoId||(lockup?.contentType==='LOCKUP_CONTENT_TYPE_VIDEO'?lockup.contentId:null)||node.shortsLockupViewModel?.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
        if(/^[\w-]{11}$/.test(id||'')){urls.add('https://www.youtube.com/watch?v='+id);return;}
        for(const [key,value]of Object.entries(node))if(!['endpoint','navigationEndpoint','menu','header'].includes(key))visit(value,depth+1);
      };
      if(!playlist)visit(selected?.content);
      else {
        const listId=u.searchParams.get('list'),panel=state?.contents?.twoColumnWatchNextResults?.playlist?.playlist;
        if(u.pathname==='/watch'&&panel?.playlistId===listId)visit(panel.contents);
        else if(u.pathname==='/playlist'){
          const metadata=state?.metadata?.playlistMetadataRenderer;
          let matched=false;try{matched=Boolean(metadata?.playlistUrl)&&new URL(metadata.playlistUrl,u).searchParams.get('list')===listId;}catch(_){}
          matched ||= state?.header?.playlistHeaderRenderer?.playlistId===listId;
          matched ||= tabs.some(t=>t.tabRenderer?.selected&&t.tabRenderer.endpoint?.browseEndpoint?.browseId==='VL'+listId);
          if(matched)visit(state?.contents?.twoColumnBrowseResultsRenderer);
          else visit(selected?.content);
        }
      }
    }
    if(!urls.size)throw Error('当前视频列表未解析到作品：已检查可见列表和当前选中栏目数据；未读取首页推荐。请刷新此列表后重试。');
    const identity=playlist?'https://www.youtube.com/playlist?list='+u.searchParams.get('list'):'https://www.youtube.com'+u.pathname.replace(/\/$/,'');
    const result={author_url:identity,author_name:(doc.querySelector(playlist?(u.pathname==='/watch'?'ytd-watch-flexy #playlist #header-description h3 a,ytd-watch-flexy #playlist h3 a':'ytd-playlist-header-renderer h1,yt-page-header-renderer h1'):'yt-page-header-renderer h1,ytd-channel-name')?.textContent||doc.title).trim(),view:playlist?'playlist':u.pathname.endsWith('/shorts')?'shorts':'videos',urls:[...urls]};
    const owner=(doc.querySelector('ytd-playlist-header-renderer #owner-text,ytd-playlist-byline-renderer,ytd-watch-flexy #playlist #owner-container a,ytd-channel-name')?.textContent||(!playlist?result.author_name:'')).trim();
    return {...result,list_url:identity,list_kind:result.view,list_name:result.author_name.replace(/\s*-\s*YouTube$/,''),list_owner:owner};
  }
  if(typeof module!=='undefined'){module.exports={profile};return;}
  try{return profile(location.href,document,window.ytInitialData);}catch(e){return {error:e.message};}
})();
