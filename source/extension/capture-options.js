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
  function normalize(d){return {...d,...(d.md_only?{collection_mode:'text',include_images:false,ocr_enabled:false,video_action:'skip'}:{}),layout:d.layout==='organized_flat'?'organized_flat':'organized',include_videos:!d.md_only&&d.video_action!=='skip',extract_frames:!d.md_only&&d.video_action==='frames',directory_schema:'function-platform-v3'};}
  function browser(request){
    const video=request.mode==='video',plain=request.mode==='plain',text=plain||request.mode==='text',batch=request.scope!=='single';
    const d={...request.options,collection_mode:text?'text':'images',md_only:plain,
      capture_kind:video?'video':text?'text':'images',capture_scope:batch?'batch':'single'};
    if(video){d.video_action=d.video_action==='frames'?'frames':'save';d.include_images=false;d.include_comments=false;d.ocr_enabled=false;d.video_only=batch;}
    else if(!text)d.ocr_enabled=false;
    if(plain)d.include_images=false;
    if(d.output_format==='audio'){d.video_action='save';d.subtitle_mode='none';}
    return snapshot(normalize(d));
  }
  const videoOutputs={original:'仅视频（含原声音）',subtitles:'视频 + 字幕 + 文字稿',text:'仅文字稿（MD）',audio:'仅提取音频',frames:'视频抽帧'};
  function videoOutput(floating){
    const output=floating?.video_output;
    if(!Object.hasOwn(videoOutputs,output))throw new Error('悬浮保存默认设置无效，请在设置页重新保存');
    return output;
  }
  // A URL hint is not a scan result. Hover never substitutes defaults for detected media.
  function floatingHint(defaults,site,floating){
    const output=videoOutput(floating);
    if(!site.single)return site.reason||'请打开一篇作品详情';
    if(defaults.md_only)return '保存方式 · 仅正文';
    if(site.mode==='video')return '视频页 · '+videoOutputs[output];
    if(site.mode==='text')return '图文页 · 图文笔记';
    return '点击保存时识别内容';
  }
  function quick(defaults,site,preview,choice='auto',floating={video_output:'original'}){
    if(!['auto','images','text','plain','video'].includes(choice))throw new Error('无效的本次保存选项');
    if(preview?.state!=='ready'||preview.warning)throw new Error(preview?.reason||preview?.warning||'正文仍在加载，请稍后保存');
    const pictures=preview.images>0||preview.gifs>0;
    const video=preview.videos>0||preview.has_video&&!preview.gifs;
    let kind=choice;
    if(kind==='auto')kind=defaults.md_only?'plain':site.mode==='text'?'text':site.mode==='video'||preview.kind==='video'?'video':pictures?(defaults.collection_mode==='text'?'text':'images'):preview.has_text?'plain':null;
    if(!kind||kind==='plain'&&!preview.has_text||kind==='images'&&!pictures||kind==='video'&&!video||kind==='text'&&!pictures&&!preview.has_text)throw new Error('尚未确认所选内容，请等正文加载后重试');
    const output=videoOutput(floating);
    const d={...defaults,destination:null,capture_scope:'single',md_only:kind==='plain',subtitle_mode:'none',output_format:'original'};
    if(kind==='video')Object.assign(d,{video_action:output==='frames'?'frames':'save',subtitle_mode:output==='subtitles'?'with_video':output==='text'?'only':'none',output_format:output==='audio'?'audio':'original'});
    if(choice==='images')Object.assign(d,{include_images:true,include_comments:false,video_action:'skip'});
    if(choice==='text')d.include_images=true;
    const options=browser({mode:kind,scope:'single',options:d});
    return {mode:kind==='video'?(options.extract_frames?'download-frames':'download'):'current',options};
  }
  const snapshot=value=>freeze(clone(value));
  return {resolve,merge:resolve,signature,stamp,normalize,browser,quick,floatingHint,snapshot};
})();
if(typeof module!=='undefined')module.exports=CaptureOptions;
