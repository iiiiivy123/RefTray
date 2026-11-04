const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('../../source/extension/pinterest-identity.js');
const {pinterestImages, extract} = require('../../source/extension/platforms.js');
const {context} = require('../../source/extension/site-panel.js');
const pin = 'https://www.pinterest.com/pin/123/';
const visual = pin + 'visual-search/';
const hash = 'abcdef0123456789abcdef0123456789';
const image = (size, extension = 'jpg', key = hash) => `https://i.pinimg.com/${size}/${key.slice(0,2)}/${key.slice(2,4)}/${key.slice(4,6)}/${key}.${extension}`;

// Small DOM boundary fixture: selectors still choose separate main, related and
// other-Pin nodes; no extractor return values are mocked.
function img(src, options = {}) {
  return {tagName: 'IMG', src, currentSrc: src, srcset: options.srcset || '', alt: 'main', naturalWidth: 736,
    getAttribute(name) { return options[name] || ''; },
    closest(selector) {
      if (selector === 'a[href]') return options.link ? {href: options.link} : null;
      return options.related && selector.includes('related-pins') ? {} : null;
    }};
}
function doc(nodes = [], metadata = [], state = null) {
  return {title: 'Fixture Pin', querySelector() { return null; }, querySelectorAll(selector) {
    if (selector.includes('link[rel="canonical"]')) return metadata;
    if (selector.includes('pin-closeup-image')) return nodes;
    if (selector === 'script[type="application/json"]') return state ? [{textContent: JSON.stringify(state)}] : [];
    return [];
  }};
}

test('same source JPG/WebP and sizes merge, retaining best advertised URL', () => {
  const largest = image('1200x', 'webp') + '?signed=keep';
  const nodes = [img(image('236x')), img(image('736x', 'webp'), {srcset: `${image('736x')} 736w, ${largest} 1200w`})];
  assert.deepEqual(pinterestImages(doc(nodes), pin).images, [{url: largest, alt: 'main'}]);
});
test('original advertised candidate wins without inventing a URL', () => {
  const original = image('originals');
  assert.deepEqual(pinterestImages(doc([img(image('736x'), {'data-original': original})]), pin).images.map(x => x.url), [original]);
});
test('different immutable hashes remain separate; other Pins and recommendations excluded', () => {
  const different = image('736x', 'jpg', 'abcdef1123456789abcdef0123456789');
  const nodes = [img(image('736x')), img(different), img(image('originals'), {related: true}), img(image('1200x'), {link: 'https://www.pinterest.com/pin/456/visual-search/'})];
  assert.deepEqual(pinterestImages(doc(nodes), visual).images.map(x => x.url), [image('736x'), different]);
});
test('ordinary and nested visual-search Pin share canonical identity and extractor payload', () => {
  assert.equal(identity.canonicalUrl(visual + '?crop=1'), pin);
  assert.equal(context(visual).single, true);
  assert.equal(context(pin + 'unrelated/').single, false);
  for (const url of [pin, visual]) {
    global.location = new URL(url); global.document = doc([img(image('736x'))]);
    assert.equal(extract().canonical_url, pin);
  }
});
test('top visual search requires authoritative original Pin, never query or result links', () => {
  const top = 'https://www.pinterest.com/visual-search/?pin=123';
  assert.equal(identity.resolvePage(doc([img(image('736x'), {link: pin})]), top), null);
  assert.match(pinterestImages(doc(), top).guidance, /原 Pin/);
  assert.equal(identity.resolvePage(doc([], [{href: pin}, {content: pin}]), top).id, '123');
  assert.equal(identity.resolvePage(doc([], [{href: pin}, {content: 'https://www.pinterest.com/pin/456/'}]), top), null);
  assert.match(context(top).reason, /原 Pin/);
});
test('visual search uses exact Pin state and never a dominant recommendation fallback', () => {
  const state = {results: [{id: '456', images: {orig: {url: image('originals'), width: 2000, height: 3000}}}]};
  assert.deepEqual(pinterestImages(doc([], [], state), visual).images, []);
  state.results.push({id: '123', images: {large: {url: image('736x'), width: 736, height: 1104}}});
  assert.deepEqual(pinterestImages(doc([], [], state), visual).images.map(x => x.url), [image('736x')]);
});
test('state video cover stays blocked and unrecognized URLs never collapse', () => {
  assert.equal(pinterestImages(doc([], [], {id: '123', is_video: true, images: {orig: {url: image('originals'), width: 2000, height: 3000}}}), pin).blockedStateMedia, true);
  assert.equal(identity.mergeImages([{url: 'https://elsewhere.test/a.jpg'}, {url: 'https://elsewhere.test/a.webp'}]).length, 2);
  assert.equal(identity.pinId('https://pinterest.com.evil.test/pin/123/'), '');
});
