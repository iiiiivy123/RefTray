/* Sequential collection, shared by capture entry points. */
async function downloadVideoSequence(tab,port,options,health,frames){
  let media=[];const u=new URL(tab.url);
  if(/(^|\.)(x\.com|twitter\.com)$/.test(u.hostname)){
   media=await videoSource(tab,options,true);
  }else if(/(^|\.)artstation\.com$/.test(u.hostname)){
   media=(await readPagePayload(tab.id,{},tab))._media||[];
  }
  if(!media.length)media=[await videoSource(tab,options)];
  if(options.media_index){
   if(options.media_index>media.length)throw new Error('视频序号超出范围，本帖共 '+media.length+' 个');
   media=[media[options.media_index-1]];
  }
  const results=[];let done=0;
  for(const source of media){
   await controlPoint();
   try{
    const result=await downloadVideo(tab,port,{...options,source},health,frames);
    results.push({...result,index:++done});
   }catch(error){
    if(error.message==='USER_STOPPED')throw error;
    results.push({status:'failed',index:++done,message:error.message});
   }
   taskContext.stopResult={results:[...results],directory:results.find(r=>r.directory)?.directory};
   await reportProgress({stage:'saving',percent:done/media.length*100,message:`已处理视频 ${done}/${media.length}`});
  }
  const failed=results.filter(r=>r.status==='failed'||r.partial).length;
  return {status:results.every(r=>r.status==='failed')?'failed':failed?'partial':'completed',
   directory:results.find(r=>r.directory)?.directory,results,
   new_videos:results.reduce((n,r)=>n+(r.new_videos||0),0),new_images:results.reduce((n,r)=>n+(r.new_images||0),0),
   message:`已处理 ${done} 个视频${failed?'，'+failed+' 个未完整保存':''}`};
}
