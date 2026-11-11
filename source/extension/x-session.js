// Observe only tweet responses the open X page already requested with its session.
// No extra requests, cookie reads, headers, account export, or persistent storage.
(() => {
  if (globalThis.RefTrayXSession) return;
  const records = new Map(), maxBytes = 4000000;
  const eligible = value => {
    try { const u = new URL(value, location.href); return u.origin === location.origin &&
      /^\/i\/api\/(?:graphql\/[^/]+\/(?:TweetDetail|TweetResultByRestId|UserTweets|UserMedia|UserTweetsAndReplies)|2\/timeline\/)/.test(u.pathname); }
    catch (_) { return false; }
  };
  function remember(data) {
    const stack = [data], seen = new WeakSet(); let count = 0;
    while (stack.length && count++ < 12000) {
      const v = stack.pop();
      if (!v || typeof v !== 'object' || seen.has(v)) continue;
      seen.add(v);
      let parsed = globalThis.XEagleMedia.tweetRecord(v);
      const legacy=v.legacy, user=v.core?.user_results?.result;
      const account=user?.legacy?.screen_name||user?.core?.screen_name;
      const textOnly=!legacy?.extended_entities?.media?.length&&!legacy?.entities?.media?.length&&!v.card&&!legacy?.card&&!legacy?.quoted_status_id_str&&!v.quoted_status_result;
      if(!parsed && /^\d{10,20}$/.test(String(v.rest_id||v.id_str||'')) && typeof legacy?.full_text==='string' && legacy.full_text.trim() && account && textOnly){
        const id=String(v.rest_id||v.id_str);
        records.delete(id);records.set(id,{postId:id,media:[],text:legacy.full_text.slice(0,20000),account,seen:Date.now(),text_only:true});
        while(records.size>120)records.delete(records.keys().next().value);
      }
      if (parsed?.media.length) {
        const media = parsed.media.filter(m => {try {const u=new URL(m.url);return u.protocol==='https:' && /(^|\.)twimg\.com$/.test(u.hostname);}catch(_){return false;}});
        if(media.length){records.delete(parsed.tweetId);records.set(parsed.tweetId,{postId:parsed.tweetId,media,text:parsed.text.slice(0,20000),account:parsed.account,seen:Date.now()});}
        while(records.size>120)records.delete(records.keys().next().value);
      }
      for (const child of Object.values(v).slice(0,500)) if(child && typeof child==='object')stack.push(child);
    }
  }
  globalThis.RefTrayXSession = Object.freeze({get(id) {
    const row=records.get(String(id));
    return row && Date.now()-row.seen<15*60*1000 ? structuredClone(row) : null;
  }});
  const originalFetch=globalThis.fetch;
  globalThis.fetch=function(...args) {
    const promise=Reflect.apply(originalFetch,this,args);
    promise.then(response=>{
      if(!eligible(response.url)||!response.ok)return;
      const copy=response.clone();
      (async()=>{
        const reader=copy.body.getReader(); let size=0, text='',decoder=new TextDecoder();
        try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)return;text+=decoder.decode(value,{stream:true});}text+=decoder.decode();remember(JSON.parse(text));}
        finally {await reader.cancel().catch(()=>{});}
      })().catch(()=>{});
    }).catch(()=>{});
    return promise;
  };
  const send=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send=function(...args){
    this.addEventListener('load',()=>{
      try {if(!eligible(this.responseURL)||this.status!==200)return;
        if(this.responseType==='json'){const data=this.response;if(JSON.stringify(data).length<=maxBytes)remember(data);}
        else if(!this.responseType||this.responseType==='text'){if(this.responseText.length<=maxBytes)remember(JSON.parse(this.responseText));}
      }catch(_){}
    },{once:true});
    return Reflect.apply(send,this,args);
  };
})();
