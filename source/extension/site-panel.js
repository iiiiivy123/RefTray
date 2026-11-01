(() => {
  function describe(value) {
    let u; try { u = new URL(value); } catch (_) { return {site: '未知页面', bulk: null, current: '当前页'}; }
    const host = u.hostname;
    if(/(^|\.)artstation\.com$/.test(host))return {site:'ArtStation',bulk:null,current:'当前作品',hint:'保存当前作品已加载图片与说明；不包含推荐作品、嵌入视频或3D预览'};
    if(/(^|\.)(youtube\.com|youtu\.be)$/.test(host))return {site:'YouTube',bulk:null,current:'当前视频'};
    if (/(^|\.)bilibili\.com$/.test(host))return {site:'B站',bulk:host==='space.bilibili.com'?'author':null,current:'当前稿件',hint:'批量仅采UP主投稿视频；广告、推荐和其他UP主内容不保存'};
    if (/(^|\.)instagram\.com$/.test(host)) return {site:'Instagram',bulk:'author',current:'当前帖',hint:'打开作者主页的帖子或 Reels 列表；逐帖核对作者后采集'};
    if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return {site:'X',bulk:'author',current:'当前帖',hint:'打开作者主页的帖子页；按页面顺序采集本人帖子，不含转帖'};
    if (/(^|\.)xiaohongshu\.com$/.test(host)) return {site: '小红书', bulk: 'author', current: '当前帖', label: '作者全部图', hint: '打开作者主页后低频逐篇采集'};
    if (/(^|\.)pinterest\.(com|cn)$/.test(host)) return {site: 'Pinterest', bulk: 'board', current: '当前 Pin', label: '当前 Board 全部图', hint: '先打开具体画板；只采集画板内的 Pin'};
    if (/(^|\.)huaban\.com$/.test(host)) return {site: '花瓣', bulk: 'author', current: '当前采集', label: '批量图片', hint: '保留原有批量采集流程'};
    return {site: /instagram\.com$/.test(host) ? 'Instagram' : /(^|\.)(x\.com|twitter\.com)$/.test(host) ? 'X' : /weibo\.(com|cn)$/.test(host) ? '微博' : '网页', bulk: null, current: '当前帖', hint: '仅支持当前页采集'};
  }
  function context(value) {
    const result=describe(value);let u;
    try{u=new URL(value);}catch(_){return {...result,single:false,bulk:null,reason:'请打开普通网页。'};}
    const p=u.pathname;
    let single=true,bulk=result.bulk;
    if(result.site==='ArtStation')return {...result,single:/^\/artwork\/[a-zA-Z0-9]+\/?$/.test(p),bulk:/^\/[\w-]+(?:\/albums\/\d+)?\/?$/.test(p)?'author':null,hint:'仅采集当前明确显示的作品列表；合集封面页请先进入合集',reason:'请打开作品详情、作品列表或具体合集'};
    if(result.site==='YouTube')return {...result,single:(u.hostname==='youtu.be'&&/^\/[\w-]{11}\/?$/.test(p)||p==='/watch'&&/^[\w-]{11}$/.test(u.searchParams.get('v')||'')||/^\/shorts\/[\w-]{11}\/?$/.test(p)),bulk:u.hostname!=='youtu.be'&&(['/playlist','/watch'].includes(p)&&/^[\w-]+$/.test(u.searchParams.get('list')||'')||/^\/(?:@[^/]+|channel\/[\w-]+)\/(videos|shorts)\/?$/.test(p))?'author':null,mode:'video',hint:'按当前播放列表或频道列表顺序保存前N个视频；不包含侧栏推荐',reason:'请打开具体视频、播放列表，或频道的视频/Shorts列表'};
    if(!/^https?:$/.test(u.protocol)){single=false;bulk=null;}
    else if(result.site==='小红书'){single=/^\/(?:explore|discovery\/item)\/[a-f0-9]{24}/i.test(p)||/^\/user\/profile\/[a-f0-9]{24}\/[a-f0-9]{24}/i.test(p);bulk=/^\/user\/profile\/[a-f0-9]{24}\/?$/i.test(p)?'author':null;}
    else if(result.site==='X'){single=/^\/[^/]+\/status\/\d+/.test(p);bulk=/^\/[^/]+(?:\/(?:media|with_replies))?\/?$/.test(p)&&!/^\/(home|explore|search|notifications|messages|settings|i|login)(\/|$)/.test(p)?'author':null;}
    else if(result.site==='B站'){
      const video=/^\/video\/BV[\da-zA-Z]{10}\/?$/.test(p);
      const article=/^\/(opus\/\d+|read\/cv\d+)\/?$/.test(p);
      single=video||article;
      bulk=u.hostname==='space.bilibili.com'&&/^\/\d+\/(?:upload\/video|video|lists\/\d+)\/?$/.test(p)?'author':null;
      if(video||bulk){result.mode='video';result.hint='按当前列表和排序采集前N篇，不跨栏目或递归其他合集';}
      if(article){result.mode='text';result.hint='保存此篇图文正文与所选附件';}
      if(u.hostname==='space.bilibili.com'&&/^\/\d+\/upload\/(opus|article)/.test(p)||/^(www\.)?bilibili\.com$/.test(u.hostname)&&/^\/read\/readlist\/rl\d+\/?$/.test(p)){
        bulk='author';result.mode='text';result.hint='按当前图文列表及排序采集前N篇；不递归进入其他文集';
      }
    }
    else if(result.site==='Instagram'){single=/^\/(p|reels?)\/[\w-]+/.test(p);bulk=/^\/[^/]+(?:\/reels)?\/?$/.test(p)&&!/^\/(explore|accounts|direct|reels)(\/|$)/.test(p)?'author':null;}
    else if(result.site==='Pinterest'){single=/^\/pin\/\d+/.test(p);bulk=/^\/[^/]+\/[^/]+\/?$/.test(p)&&!/^\/(pin|search|ideas|settings)(\/|$)/.test(p)?'board':null;}
    else if(result.site==='花瓣'){single=/^\/pins\/\d+/.test(p);bulk=/^\/(?:user|boards)\//.test(p)?'author':null;}
    return {...result,single,bulk,reason:bulk?'这是列表页，请选择「批量保存」。':'此处无法采集，请打开一篇作品详情；批量保存请打开作者列表或具体画板。'};
  }
  globalThis.CollectorSite = {context};
  if (typeof module !== 'undefined') module.exports = {context};
})();
