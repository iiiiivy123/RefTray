/* Load only in the local mock-services fixture, then click Run layout checks. */
(() => {
 if(document.documentElement.dataset.reftrayFixture!=='true')throw Error('Refusing to run against real settings');
 const q=s=>document.querySelector(s),assert=(ok,why)=>{if(!ok)throw Error(why);};
 const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI state did not settle');};
 const set=(name,value)=>{const el=q(`[name="${name}"]`);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
 const button=document.createElement('button');button.textContent='运行布局回归';button.id='run-layout-checks';button.style.position='fixed';button.style.bottom='75px';button.style.right='15px';button.style.zIndex='1000';
 const output=document.createElement('pre');output.id='layout-check-results';document.body.append(button,output);
 button.onclick=async()=>{
  button.disabled=true;const checks=[];
  try{
   await until(()=>!q('[name="limit"]').matches(':disabled'));
   for(const id of ['defaults-form','directory-layout','save-layout','save-path-button','cancel-path','query','history-category','history-platform','history-list','import-directory','import-preview','import-confirm','task-state','refresh-tasks','task-list','approve','reject','local-video','resolver-diagnostics'])assert(q('#'+id),'Missing original control '+id);
   const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);assert(new Set(ids).size===ids.length,'Duplicate IDs');checks.push('original controls retained');
   q('[data-view="defaults"]').click();await until(()=>!q('#defaults').hidden);q('.subnav button').click();
   const videoLimit=q('[name="max_video_mb"]').value;
   set('limit','37');q('.subnav button:last-child').click();set('interval','3.5');q('#defaults-form').requestSubmit();
   await until(()=>q('#defaults-form [type="submit"]').disabled&&q('#defaults-state').textContent.includes('默认设置已保存'));
   const write=JSON.parse(document.documentElement.dataset.lastWrite);
   assert(write.path==='/settings/defaults'&&write.body.limit===37&&write.body.interval===3.5,'Cross-tab draft was lost');
   assert(String(write.body.max_video_mb)===videoLimit&&write.body.layout&&Object.keys(write.body).length>12,'Unrepresented defaults were dropped');checks.push('complete defaults submitted across tabs');
   q('.subnav button').click();const checkbox=q('[name="skip_gifs"]'),old=checkbox.checked;checkbox.click();q('#defaults-actions button:not([type="submit"])').click();assert(checkbox.checked===old&&q('[name="limit"]').value==='37','Revert did not restore saved defaults');checks.push('revert restores saved state');
   q('.subnav button:nth-child(2)').click();const library=q('#save-path').textContent;q('#change-path').click();await until(()=>q('#path-editor').closest('dialog').open);q('#cancel-path').click();await until(()=>!q('#path-editor').closest('dialog').open);
   assert(q('#save-path').textContent===library&&JSON.parse(document.documentElement.dataset.lastWrite).path==='/settings/defaults','Cancelled library change wrote settings');checks.push('library confirmation/cancel remains independent');
   q('[data-view="history"]').click();await until(()=>!q('#history').hidden&&!q('#history-content').hidden);assert(q('#history-list article .record-actions'),'Record actions missing');checks.push('record workspace and actions retained');
   q('[data-view="tasks"]').click();await until(()=>!q('#tasks').hidden);assert(q('#task-list article details'),'Lazy task details missing');q('#task-list article details').open=true;await until(()=>q('#task-list article details').textContent.includes('示例连接失败'));checks.push('task workspace and remote details retained');
   q('[data-view="tools"]').click();await until(()=>!q('#tools').hidden);assert(q('#local-video')&&q('#resolver-diagnostics'),'Tools missing');checks.push('real tool entry points retained');
   const lang=q('#ui-language');lang.value='en';lang.dispatchEvent(new Event('change',{bubbles:true}));await until(()=>q('.nav').textContent.includes('Tools & help'));lang.value='zh';lang.dispatchEvent(new Event('change',{bubbles:true}));checks.push('language switching retained');
   document.documentElement.dataset.layoutCheck=JSON.stringify({passed:true,checks});output.textContent=checks.join('\n');
  }catch(e){document.documentElement.dataset.layoutCheck=JSON.stringify({passed:false,checks,error:e.message});output.textContent=e.stack;}
  finally{button.disabled=false;}
 };
})();
