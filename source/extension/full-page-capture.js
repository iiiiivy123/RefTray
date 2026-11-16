/* Capture actual Chrome pixels, stitch bounded tiles, always restore page state. */
const FullPageCapture=(()=>{
 const MAX_TILES=80,MAX_PIXELS=60000000,MAX_EDGE=30000;
 function plan(width,height,viewWidth,viewHeight){
  if([width,height,viewWidth,viewHeight].some(n=>!Number.isFinite(n)||n<=0)||width>MAX_EDGE||height>MAX_EDGE)throw new Error('页面过长或尺寸无效，未保存为完整截图。');
  const axis=(length,step)=>{const out=[];for(let n=0;n<length;n+=step)out.push(Math.min(n,Math.max(0,length-step)));return [...new Set(out)];};
  const tiles=axis(height,viewHeight).flatMap(y=>axis(width,viewWidth).map(x=>({x,y})));
  if(tiles.length>MAX_TILES)throw new Error('页面超过80屏，请缩短页面后截图；没有把局部截图当整页保存。');
  return tiles;
 }
 async function page(action,token,position){
  try {
  const key='__reftraySnapshot';let s=window[key];
  if(action==='restore'){
   if(!s||s.token!==token)return;
   clearTimeout(s.timer);s.style.remove();for(const [el,value,priority] of s.fixed)el.style.setProperty('visibility',value,priority);
   for(const [el,hidden] of s.floating)el.hidden=hidden;
   for(const name of ['wheel','touchstart','pointerdown','keydown'])window.removeEventListener(name,s.cancel,true);
   window.scrollTo({left:s.x,top:s.y,behavior:'instant'});delete window[key];return;
  }
  if(action==='prepare'){
   if(s)throw new Error('此页已有截图，请稍后重试');
   if(!document.body)throw new Error('当前文档没有可截图的网页排版');
   s=window[key]={token,x:scrollX,y:scrollY,url:location.href,fixed:[],floating:[],cancelled:false};
   s.cancel=event=>{if(event.isTrusted)s.cancelled=true;};
   for(const name of ['wheel','touchstart','pointerdown','keydown'])window.addEventListener(name,s.cancel,true);
   s.style=document.createElement('style');s.style.textContent='html{scroll-behavior:auto!important;scroll-snap-type:none!important}*{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}';document.documentElement.append(s.style);
   for(const el of document.querySelectorAll('[data-reftray-float]')){s.floating.push([el,el.hidden]);el.hidden=true;}
   for(const el of document.querySelectorAll('body *'))if(['fixed','sticky'].includes(getComputedStyle(el).position))s.fixed.push([el,el.style.getPropertyValue('visibility'),el.style.getPropertyPriority('visibility')]);
   // Recovery if the extension worker terminates or loses its connection.
   s.timer=setTimeout(()=>{s.style.remove();for(const [el,v,p] of s.fixed)el.style.setProperty('visibility',v,p);for(const [el,h] of s.floating)el.hidden=h;for(const n of ['wheel','touchstart','pointerdown','keydown'])window.removeEventListener(n,s.cancel,true);window.scrollTo(s.x,s.y);delete window[key];},180000);
  }
  if(!s||s.token!==token||s.url!==location.href)throw new Error('页面已切换，截图停止');
  if(s.cancelled)throw new Error('检测到页面操作，截图已取消，未保存局部截图');
  if(action==='scroll'){
   for(const [el,v,p] of s.fixed)el.style.setProperty('visibility',position.first?v:'hidden',position.first?p:'important');
   window.scrollTo({left:position.x,top:position.y,behavior:'instant'});
   await new Promise(resolve=>setTimeout(resolve,350));
  }
  return {url:location.href,title:document.title,x:scrollX,y:scrollY,width:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),height:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),viewWidth:document.documentElement.clientWidth,viewHeight:innerHeight,innerWidth,dpr:devicePixelRatio,cancelled:s.cancelled};
  }catch(e){return {error:e.message};}
 }
 async function capture(tab,{api,progress}){
  const token=crypto.randomUUID();let task,canvas;
  // Install the same pure page function in the isolated world, without MAIN-world access.
  const call=async(action,position)=>{
   const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},args:[action,token,position],func:page});
   if(result?.error)throw new Error(result.error);
   if(!result&&action!=='restore')throw new Error('网页截图准备失败或页面已切换');return result;
  };
  async function visible(){const active=await chrome.tabs.query({active:true,windowId:tab.windowId});const window=await chrome.windows.get(tab.windowId);if(active[0]?.id!==tab.id||active[0]?.url!==tab.url||!window.focused)throw new Error('页面或窗口已切换，截图已停止；请保持目标页在前台。');}
  try{
   await visible();let size=await call('prepare');
   task=await api('/page-snapshots/start',{url:tab.url,title:size.title});
   // Trigger lazy images with a bounded pass; endless feeds fail explicitly.
   for(let y=0,steps=0;y<size.height;y+=size.viewHeight){
    if(++steps>MAX_TILES)throw new Error('页面持续增长或过长，未保存局部截图');
    plan(size.width,size.height,size.viewWidth,size.viewHeight);await visible();
    size=await call('scroll',{x:0,y,first:true});await api('/page-snapshots/'+task.id+'/progress',{message:'正在加载整页内容'});
   }
   size=await call('scroll',{x:0,y:0,first:true});
   const tiles=plan(size.width,size.height,size.viewWidth,size.viewHeight);let scale;
   for(let i=0;i<tiles.length;i++){
    await visible();const actual=await call('scroll',{...tiles[i],first:i===0});
    if(actual.cancelled||actual.width!==size.width||actual.height!==size.height||actual.viewWidth!==size.viewWidth||actual.viewHeight!==size.viewHeight||actual.dpr!==size.dpr)throw new Error('网页排版或窗口尺寸发生变化，请等加载稳定后重试；未保存局部截图。');
    if(Math.abs(actual.x-tiles[i].x)>2||Math.abs(actual.y-tiles[i].y)>2)throw new Error('网页阻止了滚动，无法保证整页完整');
    await new Promise(resolve=>setTimeout(resolve,200));await visible();
    const data=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});
    await visible();const bitmap=await createImageBitmap(await (await fetch(data)).blob());
    try{
     const ratio=bitmap.width/size.innerWidth;
     if(Math.abs(bitmap.height-size.viewHeight*ratio)>2)throw new Error('截图视口尺寸不一致，未保存局部截图');
     if(!canvas){scale=ratio;const w=Math.round(size.width*scale),h=Math.round(size.height*scale);if(w*h>MAX_PIXELS||w>MAX_EDGE||h>MAX_EDGE)throw new Error('整页像素超过安全上限（6000万像素/边长30000），未保存局部截图');canvas=new OffscreenCanvas(w,h);}
     if(Math.abs(ratio-scale)>.01)throw new Error('截图缩放发生变化，请重试');
     const w=Math.min(Math.round(size.viewWidth*scale),bitmap.width),h=Math.min(Math.round(size.viewHeight*scale),bitmap.height);
     canvas.getContext('2d').drawImage(bitmap,0,0,w,h,Math.round(actual.x*scale),Math.round(actual.y*scale),w,h);
    }finally{bitmap.close();}
    await api('/page-snapshots/'+task.id+'/progress',{message:`已截取 ${i+1}/${tiles.length} 屏`});
    await progress(`正在保存整页 ${i+1}/${tiles.length} 屏`);
   }
   const blob=await canvas.convertToBlob({type:'image/png'});if(blob.size>30*1024*1024)throw new Error('整页 PNG 超过30MB，未保存局部截图');
   const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   return await api('/page-snapshots/'+task.id+'/finish',{png:btoa(binary),width:canvas.width,height:canvas.height,css_width:size.width,css_height:size.height,device_scale:scale,tiles:tiles.length});
  }catch(error){if(task)await api('/page-snapshots/'+task.id+'/cancel',{message:error.message}).catch(()=>{});throw error;}
  finally{await call('restore').catch(()=>{});if(canvas){canvas.width=1;canvas.height=1;}}
 }
 return {plan,capture};
})();
if(typeof module!=='undefined')module.exports=FullPageCapture;
