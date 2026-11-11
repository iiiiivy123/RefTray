/* One checkpoint owner. Local durability precedes bounded server synchronization. */
(() => {
 const latest=(local,remote)=>!local?remote:!remote?local:Number(remote.revision||0)>Number(local.revision||0)?remote:local;
 const api=(path,body)=>typeof service==='function'?service(path,body):Hub.api(path,body);
 function summarize(record){const rows=Object.values(record.records||{}).filter(r=>!['pending','planned'].includes(r.status));return {...record,total:record.queue?.length||record.total||null,done:rows.length,saved:rows.filter(r=>['saved','partial'].includes(r.status)).length,failed:rows.filter(r=>['failed','partial'].includes(r.status)).length,skipped:rows.filter(r=>r.status==='skipped').length};}
 let saveChain=Promise.resolve();
 function save(record,settings={}){const operation=saveChain.then(()=>saveOne(record,settings));saveChain=operation.catch(()=>{});return operation;}
 async function saveOne(record,{checkpoint=true}={}){
  const state=await chrome.storage.local.get(['collectorCheckpoint','collectorTaskOutbox','collectorTaskJournal']);
  const id=record.id||record.task_id||crypto.randomUUID();const prior=state.collectorCheckpoint?.id===id?state.collectorCheckpoint:null;
  const value=summarize({...record,id,task_id:id,schema_version:1,revision:Math.max(Number(record.revision)||0,Number(prior?.revision)||0,Number(state.collectorTaskJournal?.[id]?.revision)||0,Number(state.collectorTaskOutbox?.[id]?.revision)||0)+1,updated:Date.now()});
  const outbox={...state.collectorTaskOutbox,[id]:value};
  await chrome.storage.local.set({...checkpoint?{collectorCheckpoint:value}:{},...state.collectorTaskJournal?.[id]?{collectorTaskJournal:{...state.collectorTaskJournal,[id]:value}}:{},collectorTaskOutbox:outbox});Object.assign(record,value);
  try{await reconcile();}catch(error){await chrome.storage.local.set({collectorSyncWarning:error.message});}
  return value;
 }
 let syncing;
 async function reconcile(){if(syncing)return syncing;syncing=(async()=>{
  const {collectorTaskOutbox:pending={}}=await chrome.storage.local.get(['collectorTaskOutbox']);
  for(const [id,record]of Object.entries(pending)){
   let remote;try{remote=(await api('/tasks/'+encodeURIComponent(id))).item;}catch(error){if(!/404|不存在|not found/i.test(error.message))throw error;}
   let chosen=latest(record,remote);
   // Older journals did not retain server revisions. Resolve only that one field
   // against the server record, preserving its queue and saved-media evidence.
   if(record.resolvedBy&&!remote?.resolvedBy&&Number(remote?.revision||0)>=Number(record.revision||0)){
    chosen={...remote,resolvedBy:record.resolvedBy,revision:Number(remote.revision)+1,updated:Date.now()};
   }
   if(chosen===record||chosen.resolvedBy===record.resolvedBy&&chosen!==remote){await api('/tasks',{id,data:chosen,expected_revision:remote?.revision||0});}
   const state=await chrome.storage.local.get(['collectorTaskOutbox','collectorCheckpoint','collectorTaskJournal']);const outbox={...state.collectorTaskOutbox};
   if(outbox[id]?.revision===record.revision)delete outbox[id];
   const update={collectorTaskOutbox:outbox};if(state.collectorCheckpoint?.id===id)update.collectorCheckpoint=latest(state.collectorCheckpoint,chosen);
   if(state.collectorTaskJournal?.[id]&&Number(state.collectorTaskJournal[id].revision||0)<=Number(chosen.revision||0))update.collectorTaskJournal={...state.collectorTaskJournal,[id]:chosen};
   await chrome.storage.local.set(update);
  }
  await chrome.storage.local.remove('collectorSyncWarning');
 })().finally(()=>syncing=null);return syncing;}
 async function endBatch(){
  const {collectorCheckpoint:record}=await chrome.storage.local.get(['collectorCheckpoint']);
  if(record) return save({...record,completed:true,endedByUser:true});
 }
 globalThis.TaskStore={latest,save,reconcile,summarize,endBatch};
})();
