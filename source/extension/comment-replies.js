// One bounded DOM action per call; the background owns cancellation and timing.
(() => {
 const visible=node=>node.getBoundingClientRect().width>0&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden';
 const text=node=>(node?.innerText||node?.textContent||'').trim();
 const expandLabel=value=>/^(?:(?:展开|查看|加载)(?:剩余|全部|更多|所有)?\s*\d*\s*条?\s*(?:回复|回覆)(?:\s*\(\d+\))?|view\s+(?:(?:all\s+)?\d+\s+|(?:\d+\s+)?more\s+|all\s+)?repl(?:y|ies)(?:\s*\(\d+\))?)$/i.test(value.replace(/\s+/g,' ').trim());
 function step(root,kind,options,state={}){
  if(!root||!['xhs','instagram'].includes(kind))return {done:true,reason:'没有确认当前帖子的评论区域。',state};
  const selector=kind==='xhs'?'.comment-item':'ul ul li';
  const nodes=[...root.querySelectorAll(selector)];
  const parents=nodes.filter(node=>!node.parentElement?.closest(selector)).slice(0,Math.max(1,Math.min(100,Number(options.comment_limit)||10)));
  const limit=Math.max(1,Math.min(10,Number(options.replies_per_comment)||2));
  const attempts={...(state.attempts||{})};
  for(const [index,parent] of parents.entries()){
   if(!visible(parent)||parent.querySelectorAll(selector).length>=limit)continue;
   const own=parent.cloneNode(true);for(const child of own.querySelectorAll(selector))child.remove();
   const id=parent.getAttribute('data-comment-id')||parent.id||index+':'+text(own.querySelector(kind==='xhs'?'.content,.note-text':'span[dir="auto"]')).slice(0,80);
   if((attempts[id]||0)>=3)continue;
   const buttons=[...parent.querySelectorAll('button,[role="button"],[class*="show-more"],[class*="reply-more"],[class*="more-repl"]')];
   const button=buttons.find(node=>visible(node)&&!node.disabled&&node.getAttribute('aria-disabled')!=='true'&&!node.closest('a')&&node.closest(selector)===parent&&expandLabel(text(node)));
   if(!button)continue;
   attempts[id]=(attempts[id]||0)+1;
   button.click();
   return {done:false,state:{attempts},reason:''};
  }
  return {done:true,state:{attempts},reason:'展开检查已结束；达到数量上限或没有更多可识别入口时，保留当前已加载回复。'};
 }
 globalThis.CollectorReplies={step,expandLabel};
 if(typeof module!=='undefined')module.exports={step,expandLabel};
})();
