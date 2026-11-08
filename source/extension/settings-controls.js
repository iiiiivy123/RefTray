(() => {
 const form=document.querySelector('#defaults-form'),select=form.elements.namedItem('duplicate_policy');
 select.hidden=true;
 const group=document.createElement('div');group.className='duplicate-choice';group.setAttribute('role','group');group.setAttribute('aria-label','已有内容');
 for(const [value,label] of [['fill','自动去重补齐'],['refresh','重新读取原帖']]){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.value=value;
  button.onclick=()=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));paint();};group.append(button);
 }
 const wrapper=select.closest('.rounded-select');if(wrapper){wrapper.hidden=true;wrapper.after(group);}else select.after(group);
 function paint(){for(const b of group.children){const chosen=b.dataset.value===select.value;b.setAttribute('aria-pressed',String(chosen));b.classList.toggle('primary',chosen);}}
 document.addEventListener('defaults-painted',paint);paint();
 document.querySelector('#defaults-form .panel-heading h2').textContent='采集默认值';
 const style=document.createElement('style');style.textContent='#defaults-form .field-hint,#defaults-form .toggle-copy p,#defaults-form .inline-note{display:none}select[name="duplicate_policy"]{display:none!important}';document.head.append(style);
})();
