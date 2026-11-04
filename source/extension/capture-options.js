/* One deterministic merge contract for new tasks and immutable recovery snapshots. */
const CaptureOptions=(()=>{
  const clone=value=>structuredClone(value);
  function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
  function stable(value){
    if(Array.isArray(value))return value.map(stable);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>!key.startsWith('_')).map(key=>[key,stable(value[key])]));
    return value;
  }
  const signature=defaults=>JSON.stringify(stable(defaults||{}));
  function stamp(options,{defaults={},generation=0,...metadata}={}){
    return {...metadata,options:clone(options),generation,defaultsSignature:signature(defaults)};
  }
  function resolve({defaults={},modePreferences={},last=null,draft=null,resume=null,mode=null,generation=0,defaultsSignature=signature(defaults),tabId,source,now=Date.now()}={}){
    if(resume){
      const value=clone(resume.options||resume);
      if(!value.destination&&resume.root)value.destination=resume.root;
      return freeze(value);
    }
    const valid=layer=>{
      if(!layer)return false;
      if(layer.generation!==undefined&&layer.generation!==generation)return false;
      if(layer.defaultsSignature!==undefined&&layer.defaultsSignature!==defaultsSignature)return false;
      // Unstamped legacy preferences are accepted only before defaults change.
      if(generation!==0&&layer.generation===undefined&&layer.defaultsSignature===undefined)return false;
      return true;
    };
    const preferences=modePreferences[mode]||{};
    const preferenceLayer=preferences.options||preferences;
    const value={...clone(defaults),...(valid(preferences)?clone(preferenceLayer):{})};
    if(valid(last)&&(!mode||!last.kind||last.kind===mode))Object.assign(value,clone(last.options||last));
    // A remembered destination belongs to its task; only the current draft may retain it.
    value.destination=null;
    if(valid(draft)&&(!draft.expires||draft.expires>now)&&(tabId===undefined||draft.tabId===tabId)&&(!source||!draft.source||draft.source===source))Object.assign(value,clone(draft.options||draft));
    return freeze(value);
  }
  return {resolve,merge:resolve,signature,stamp,snapshot:value=>freeze(clone(value))};
})();
if(typeof module!=='undefined')module.exports=CaptureOptions;
