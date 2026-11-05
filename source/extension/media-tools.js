(() => {
 const q=s=>document.querySelector(s);let job;
 if(location.hash==='#audio')q('#format').value='audio';
 q('#open').onclick=async()=>{try{await Hub.api('/tools/media/'+job+'/open',{});}catch(e){q('#status').textContent=e.message;}};
 q('#start').onclick=async()=>{
  const file=q('#file').files[0];if(!file){q('#status').textContent='请先选择视频';return;}
  if(file.size>512*1024*1024){q('#status').textContent='文件上限为512 MB';return;}
  q('#start').disabled=q('#file').disabled=q('#format').disabled=true;q('#open').hidden=true;q('#progress').hidden=false;
  try{
   await Hub.api('/health');q('#status').textContent='正在传给本机后台…';
   const health=await fetch('http://127.0.0.1:8766/health').then(r=>r.json());
   const response=await fetch('http://127.0.0.1:8766/tools/media?format='+q('#format').value+'&name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Collector-Token':health.settings_token},body:file});
   const result=await response.json();if(!response.ok)throw Error(result.detail||'本地加工提交失败');job=result.job_id;
   for(;;){const state=await Hub.api('/tools/media/'+job);q('#status').textContent=state.message+(state.path?'\n'+state.path:'');if(state.status==='failed')throw Error(state.message);if(state.status==='completed'){q('#open').hidden=false;break;}await new Promise(r=>setTimeout(r,1000));}
  }catch(e){q('#status').textContent=e.message;}
  finally{q('#start').disabled=q('#file').disabled=q('#format').disabled=false;q('#progress').hidden=true;}
 };
})();
