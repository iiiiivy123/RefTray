// Bounded semantic snapshot of an adapter-confirmed body. No HTML or media bytes.
(() => {
  function extract(root, {url, rootLabel = 'body', method = 'dom', imageUrl} = {}) {
    const blocks = [], warnings = [];
    const warn = message => { if (!warnings.includes(message)) warnings.push(message); };
    let chars = 0, visits = 0, stopped = false;
    const omitted = node => node.nodeType === 1 && (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','IFRAME','OBJECT','EMBED','NAV','FOOTER','ASIDE','BUTTON','INPUT'].includes(node.tagName) ||
      node.hasAttribute?.('hidden') || node.getAttribute?.('aria-hidden') === 'true' ||
      node.matches?.('[data-ad],[data-ad-slot],.advertisement,.ad-container,.ad-slot,.adsbygoogle,.mw-editsection,.navbox,.video-card,.opus-module-video,.ad-report'));
    const take = value => {
      const text = String(value || '').replace(/\r/g, '');
      const result = text.slice(0, Math.max(0, 100000 - chars)); chars += result.length;
      if (result.length < text.length) { stopped = true; warn('正文结构达到文字上限，已保留原纯文字作为回退。'); }
      return result;
    };
    function add(block) {
      if (blocks.length >= 400) { stopped = true; warn('正文结构达到段落上限，已保留原纯文字作为回退。'); return; }
      blocks.push(block);
    }
    function textOf(node, depth = 0) {
      if (++visits > 10000 || depth > 30) { stopped = true; warn('正文结构达到遍历上限，已保留原纯文字作为回退。'); return ''; }
      if (node.nodeType === 3) return node.textContent || '';
      if (omitted(node)) return '';
      if (node.tagName === 'BR') return '\n';
      let value = '';
      for (const child of node.childNodes || []) { if (stopped) break; value += textOf(child, depth + 1); }
      return value;
    }
    function walk(node, depth = 0, listDepth = 0) {
      if (stopped) return;
      if (++visits > 10000 || depth > 30) { stopped = true; warn('正文结构达到遍历上限，已保留原纯文字作为回退。'); return; }
      if (omitted(node)) return;
      const tag = node.tagName;
      if (tag === 'IMG') {
        try {
          const value = imageUrl ? imageUrl(node) : node.getAttribute?.('data-src') || node.currentSrc || node.src;
          const source = new URL(value, url);
          if (!/^https?:$/.test(source.protocol) || source.username || source.password || source.href.length > 4096) return;
          add({kind: 'image', url: source.href, text: take((node.alt || '').slice(0, 2000))});
        } catch (_) {}
        return;
      }
      if (tag === 'TABLE') {
        const rows = [];
        for (const row of Array.from(node.rows || []).slice(0, 100)) {
          const cells = Array.from(row.cells || []);
          if (cells.some(cell => Number(cell.colSpan || 1) > 1 || Number(cell.rowSpan || 1) > 1)) warn('表格合并单元格已转为普通单元格，原布局未完整保留。');
          rows.push(cells.slice(0, 20).map(cell => take(textOf(cell).trim())));
          if (cells.length > 20) warn('表格超过 20 列，超出部分请查看原纯文字。');
          if (stopped) break;
        }
        if ((node.rows || []).length > 100) warn('表格超过 100 行，超出部分请查看原纯文字。');
        if (rows.length) add({kind: 'table', rows});
        // Keep references to table illustrations without copying their media.
        for (const img of Array.from(node.querySelectorAll?.('img') || []).slice(0, 400)) walk(img, depth + 1, listDepth);
        return;
      }
      if (tag === 'UL' || tag === 'OL') {
        let index = Number(node.getAttribute?.('start')) || 1;
        for (const child of node.childNodes || []) {
          if (stopped) break;
          if (child.tagName !== 'LI') continue;
          const own = Array.from(child.childNodes || []).filter(n => !['UL','OL'].includes(n.tagName));
          const value = take(own.map(n => textOf(n)).join('').trim());
          if (value) add({kind: 'list_item', text: value, depth: Math.min(listDepth, 8), ordered: tag === 'OL', number: Math.max(1, Math.min(index++, 100000))});
          for (const child of own) for (const img of Array.from(child.querySelectorAll?.('img') || []).slice(0, 400)) walk(img, depth + 1, listDepth);
          for (const nested of child.childNodes || []) if (['UL','OL','IMG'].includes(nested.tagName)) walk(nested, depth + 1, listDepth + 1);
        }
        return;
      }
      if (/^H[1-6]$/.test(tag || '') || tag === 'BLOCKQUOTE') {
        const value = take(textOf(node).trim());
        if (value) add({kind: tag === 'BLOCKQUOTE' ? 'quote' : 'heading', text: value, level: tag === 'BLOCKQUOTE' ? 1 : Number(tag[1])});
        for (const img of Array.from(node.querySelectorAll?.('img') || []).slice(0, 400)) walk(img, depth + 1, listDepth);
        return;
      }
      let buffer = '';
      const flush = () => { const value = take(buffer.trim()); if (value) add({kind: 'paragraph', text: value}); buffer = ''; };
      for (const child of node.childNodes || []) {
        if (stopped) break;
        if (omitted(child)) continue;
        if (child.nodeType === 3) buffer += child.textContent || '';
        else if (child.tagName === 'BR') buffer += '\n';
        else if (['P','DIV','SECTION','ARTICLE','MAIN','FIGURE','FIGCAPTION','UL','OL','TABLE','BLOCKQUOTE','IMG'].includes(child.tagName) || /^H[1-6]$/.test(child.tagName || '')) { flush(); walk(child, depth + 1, listDepth); }
        else if (child.querySelector?.('img,p,div,ul,ol,table')) { flush(); walk(child, depth + 1, listDepth); }
        else buffer += textOf(child);
      }
      flush();
    }
    if (root) walk(root);
    else warn('未确认正文区域，保留纯文字；未保存页面 HTML。');
    return {schema_version: 1, source_url: url, captured_at: new Date().toISOString(), method: root ? method : 'plain_text', root: rootLabel.slice(0, 200), blocks, warnings};
  }
  globalThis.CollectorDocumentSource = {extract};
  if (typeof module !== 'undefined') module.exports = {extract};
})();
