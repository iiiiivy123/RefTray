/* Batch counters and current-media percentages are separate contracts. */
(() => {
 function counters(job){const rows=Object.values(job.records||{}).filter(r=>!['pending','planned'].includes(r.status));return {processed:rows.length,saved:rows.filter(r=>['saved','partial'].includes(r.status)).length,failed:rows.filter(r=>['failed','partial'].includes(r.status)).length,skipped:rows.filter(r=>r.status==='skipped').length,limit:job.limit,total:job.queue_complete?job.queue.length:null};}
 function reduce(previous={},value={},job){const batch=job?counters(job):previous.batch;const percent=typeof value.percent==='number'&&Number.isFinite(value.percent)?value.percent:null;return {...previous,...value,batch,current:{message:value.message||previous.current?.message||'',percent},percent:batch?(batch.total?Math.min(100,batch.processed/batch.total*100):null):percent};}
 globalThis.TaskProgress={counters,reduce};
})();
