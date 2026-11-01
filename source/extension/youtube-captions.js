// Read captions in the current video's browser session; never export cookies.
(async()=>{
  const id=new URL(location.href).searchParams.get('v')||location.pathname.match(/^\/shorts\/([\w-]{11})/)?.[1];
  const player=document.querySelector('#movie_player');
  const state=player?.getPlayerResponse?.()||window.ytInitialPlayerResponse;
  const result={videoId:id,cues:[],source:'',warning:''};
  if(!id||state?.videoDetails?.videoId!==id)return {...result,warning:'网页播放数据尚未匹配当前视频'};
  const renderer=state.captions?.playerCaptionsTracklistRenderer;
  const base=code=>String(code||'').toLowerCase().split('-')[0];
  const tracks=(renderer?.captionTracks||[]).filter(t=>{try{const u=new URL(t.baseUrl);return u.protocol==='https:'&&['www.youtube.com','youtube.com'].includes(u.hostname)&&u.pathname==='/api/timedtext'&&!u.searchParams.has('tlang')&&!u.username&&!u.password;}catch(_){return false;}});
  let language=base(state.videoDetails.defaultAudioLanguage||state.microformat?.playerMicroformatRenderer?.defaultAudioLanguage);
  if(!language){const spoken=new Set(tracks.filter(t=>t.kind==='asr').map(t=>base(t.languageCode)));if(spoken.size===1)language=[...spoken][0];}
  if(!language)return {...result,warning:'网页字幕列表未能确认原语言，未选择翻译字幕'};
  const choices=tracks.filter(t=>base(t.languageCode)===language).sort((a,b)=>Number(a.kind==='asr')-Number(b.kind==='asr')).slice(0,2);
  for(const track of choices){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const url=new URL(track.baseUrl);url.searchParams.set('fmt','json3');
      const response=await fetch(url.href,{credentials:'same-origin',signal:controller.signal,redirect:'error'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const reader=response.body.getReader(),chunks=[];let size=0;
      while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024){await reader.cancel();throw Error('字幕过大');}chunks.push(value);}
      const data=JSON.parse(await new Blob(chunks).text());
      const cues=(data.events||[]).slice(0,100000).map(e=>({start:Number(e.tStartMs)/1000,end:(Number(e.tStartMs)+Number(e.dDurationMs))/1000,text:(e.segs||[]).map(s=>s.utf8||'').join('').trim()})).filter(c=>c.text&&Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=0&&c.end>c.start);
      if(cues.length)return {...result,cues,automatic:track.kind==='asr',source:`YouTube ${track.languageCode} · ${track.kind==='asr'?'自动字幕':'作者字幕'}`};
      result.warning='网页字幕响应为空，继续尝试本地识别';
    }catch(e){result.warning='网页字幕读取失败（'+(e.name==='AbortError'?'超时':/^HTTP \d+$/.test(e.message)?e.message:'响应不可用')+'），继续尝试本地识别';}
    finally{clearTimeout(timer);}
  }
  return result;
})();
