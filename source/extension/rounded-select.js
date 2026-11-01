// Keep native selects as value/event sources; render the menu inside the extension.
(() => {
  const controls=[];
  for(const select of document.querySelectorAll('select')) {
    if(select.hidden)continue;
    const wrap=document.createElement('span');wrap.className='rounded-select';
    const trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';
    trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    const menu=document.createElement('span');menu.className='select-menu';menu.hidden=true;menu.setAttribute('role','listbox');
    menu.id=(select.id||select.name||'select-'+controls.length)+'-menu';trigger.setAttribute('aria-controls',menu.id);
    select.before(wrap);wrap.append(select,trigger,menu);select.hidden=true;
    const buttons=[...select.options].map(option=>{
      const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.textContent=option.textContent;
      b.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));close();refresh();trigger.focus();});menu.append(b);return b;
    });
    function close(){menu.hidden=true;trigger.setAttribute('aria-expanded','false');}
    function refresh(){
      while(buttons.length<select.options.length){
        const option=select.options[buttons.length],b=document.createElement('button');
        b.type='button';b.setAttribute('role','option');
        b.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));close();refresh();trigger.focus();});
        menu.append(b);buttons.push(b);
      }
      const label=select.selectedOptions[0]?.textContent||'请选择';if(trigger.textContent!==label)trigger.textContent=label;
      const parent=select.closest('label')?.cloneNode(true);parent?.querySelectorAll('select,input,button,.rounded-select').forEach(e=>e.remove());
      const name=select.getAttribute('aria-label')||parent?.textContent.trim()||select.name||select.id;
      trigger.setAttribute('aria-label',name+': '+label);menu.setAttribute('aria-label',name);
      trigger.disabled=select.disabled||Boolean(select.closest('fieldset:disabled'));
      buttons.forEach((b,i)=>{b.disabled=select.options[i].disabled;b.hidden=select.options[i].hidden;if(b.textContent!==select.options[i].textContent)b.textContent=select.options[i].textContent;b.setAttribute('aria-selected',String(select.options[i].selected));});
      if(trigger.disabled)close();
    }
    trigger.addEventListener('click',e=>{
      e.preventDefault();const opening=menu.hidden;controls.forEach(c=>c.close());
      if(!opening)return;
      refresh();if(trigger.disabled)return;
      const rect=trigger.getBoundingClientRect();
      Object.assign(menu.style,{position:'fixed',width:rect.width+'px',minWidth:'0',left:Math.max(5,Math.min(rect.left,innerWidth-rect.width-5))+'px',right:'auto',bottom:'auto',top:'0px',maxHeight:'none'});
      menu.hidden=false;
      const height=menu.getBoundingClientRect().height;
      const below=innerHeight-rect.bottom-10,above=rect.top-10,up=height>below&&above>below;
      menu.style.maxHeight=Math.max(40,up?above:below)+'px';
      menu.style.top=(up?Math.max(5,rect.top-Math.min(height,above)-5):rect.bottom+5)+'px';
      trigger.setAttribute('aria-expanded','true');
      const selected=buttons[select.selectedIndex];
      (selected&&!selected.disabled?selected:buttons.find(b=>!b.disabled))?.focus({preventScroll:true});
    });
    window.addEventListener('resize',close);
    document.addEventListener('scroll',e=>{if(!menu.contains(e.target))close();},true);
    wrap.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();trigger.focus();return;}
      if(menu.hidden&&e.target===trigger&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();trigger.click();return;}
      if(!menu.hidden&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
        e.preventDefault();const enabled=buttons.filter(b=>!b.disabled);if(!enabled.length)return;
        const i=enabled.indexOf(document.activeElement);enabled[e.key==='Home'?0:e.key==='End'?enabled.length-1:(i+(e.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length].focus();
      }
    });
    wrap.addEventListener('focusout',e=>{if(!wrap.contains(e.relatedTarget))close();});
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))close();});
    select.addEventListener('change',refresh);controls.push({close,refresh});refresh();
  }
  globalThis.refreshSelects=()=>controls.forEach(c=>c.refresh());
})();
