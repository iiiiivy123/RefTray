/* One checkpoint owner. Local durability precedes bounded server synchronization. */
(() => {
 const latest=(local,remote)=>!local?remote:!remote?local:Number(remote.revision||0)>Number(local.revision||0)?remote:local;
 const api=(path,body)=>typeof service==='function'?service(path,body):Hub.api(path,body);
 function summarize(record){const rows=Object.values(record.records||{}).filter(r=>!['pending','planned'].includes(r.status));return {...record,total:record.queue?.length||record.total||null,done:rows.length,saved:rows.filter(r=>['saved','partial'].includes(r.status)).length,failed:rows.filter(r=>['failed','partial'].includes(r.status)).length,skipped:rows.filter(r=>r.status==='skipped').length};}
 let saveChain=Promise.resolve();
 function save(record,settings={}){const operation=saveChain.then(()=>saveOne(record,settings));saveChain=operation.catch(()=>{});return operation;}
 async function saveOne(record,{checkpoint=true}={}){
  const state=await chrome.storage.local.get(['collectorCheckpoint','collectorTaskOutbox']);
  const id=record.id||record.task_id||crypto.randomUUID();const prior=state.collectorCheckpoint?.id===id?state.collectorCheckpoint:null;
  const value=summarize({...record,id,task_id:id,schema_version:1,revision:Math.max(Number(record.revision)||0,Number(prior?.revision)||0)+1,updated:Date.now()});
  const outbox={...state.collectorTaskOutbox,[id]:value};
  await chrome.storage.local.set({...checkpoint?{collectorCheckpoint:value}:{},collectorTaskOutbox:outbox});Object.assign(record,value);
  try{await reconcile();}catch(error){await chrome.storage.local.set({collectorSyncWarning:error.message});}
  return value;
 }
 let syncing;
 async function reconcile(){if(syncing)return syncing;syncing=(async()=>{
  const {collectorTaskOutbox:pending={}}=await chrome.storage.local.get(['collectorTaskOutbox']);
  for(const [id,record]of Object.entries(pending)){
   let remote;try{remote=(await api('/tasks/'+encodeURIComponent(id))).item;}catch(error){if(!/404|不存在|not found/i.test(error.message))throw error;}
   const chosen=latest(record,remote);
   if(chosen===record){await api('/tasks',{id,data:record,expected_revision:remote?.revision||0});}
   const state=await chrome.storage.local.get(['collectorTaskOutbox','collectorCheckpoint']);const outbox={...state.collectorTaskOutbox};
   if(outbox[id]?.revision===record.revision)delete outbox[id];
   const update={collectorTaskOutbox:outbox};if(state.collectorCheckpoint?.id===id)update.collectorCheckpoint=latest(state.collectorCheckpoint,chosen);
   await chrome.storage.local.set(update);
  }
  await chrome.storage.local.remove('collectorSyncWarning');
 })().finally(()=>syncing=null);return syncing;}
 globalThis.TaskStore={latest,save,reconcile,summarize};
})();
