/* Approved capture controls; underlying IDs retain existing task semantics. */
(() => {
 const q=s=>document.querySelector(s);
 const row=document.createElement('div');row.id='video-output-options';row.className='field';row.hidden=true;
 row.innerHTML='<span>视频处理</span><div class="checks"><label id="auto-frames-option"><input id="auto-frames" type="checkbox">自动抽帧</label></div>';
 q('#video-tools').before(q('#subtitle-row'),row,q('#quality-row'),q('#trim-options'));
 q('#include-comments').parentElement.lastChild.textContent='附带评论';
 q('#plain-comments').parentElement.lastChild.textContent='附带评论';
 q('#comment-limit').previousElementSibling.textContent='最多一级评论数';
 const style=document.createElement('style');style.textContent='#advanced-options .hint,#mode-help,#quota-help,#quality-help,#duplicate-help,#options-summary,#summary{display:none!important}#include-images-option,#attachment-row,#video-tools,#subtitle-help,#more-options,#collect-video,#restore-defaults{display:none!important}';document.head.append(style);
 const replies=document.createElement('label');replies.id='include-replies-option';replies.innerHTML='<input id="include-replies" type="checkbox">包含楼中楼';q('#comment-limit').closest('label').before(replies);
 q('#duplicate-policy').closest('label').hidden=true;
 q('#text-attachments-row').hidden=true;q('#advanced-options').hidden=true;
 globalThis.CaptureLayout={paint({video,plain,text,bulk,audio,frames,site}){
  q('#collection-mode').querySelector('[value="video"]').textContent='视频';
  q('#subtitle-row').hidden=!video;
  row.hidden=!video||audio||q('#subtitle-mode').value==='only';
  q('#auto-frames').checked=frames&&!audio;
  q('#filters-row').hidden=video||plain;q('#skip-video-option').hidden=false;
  q('#text-attachments-row').hidden=!text;
  q('#ocr-enabled').parentElement.hidden=!text||plain;
  const comments=text&&(plain?q('#plain-comments').checked:q('#include-comments').checked);
  q('#comment-limit').closest('label').hidden=!comments;q('#include-replies-option').hidden=!comments||!['小红书','Instagram'].includes(site);
  q('#download-limit-row').hidden=true;
  q('#frame-options').hidden=true;
  q('#advanced-options').hidden=video||(!bulk&&!text);
  q('#duplicate-policy').closest('label').hidden=true;
 }};
})();
