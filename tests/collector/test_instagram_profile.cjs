const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('source/extension/instagram-profile.js', 'utf8');

function read(links) {
  const main = {
    querySelector: () => ({}),
    querySelectorAll: () => links.map(href => ({href, closest: () => null}))
  };
  return vm.runInNewContext(source, {
    URL,
    location: {href:'https://www.instagram.com/instagram/'},
    document: {querySelector: selector => selector === 'main' ? main : null}
  });
}

test('an empty or still-loading Instagram grid cannot become a successful empty batch', () => {
  const result = read([]);
  assert.match(result.error, /未识别到作品链接/);
  assert.equal(result.urls, undefined);
});

test('Instagram grid excludes other owners and deduplicates its own detail links', () => {
  const result = read([
    'https://www.instagram.com/p/Abc123/',
    'https://www.instagram.com/p/Abc123/',
    'https://www.instagram.com/other/reel/Other1/',
    'https://www.instagram.com/instagram/reel/Own123/'
  ]);
  assert.equal(result.handle, 'instagram');
  assert.deepEqual(Array.from(result.urls), [
    'https://www.instagram.com/p/Abc123/',
    'https://www.instagram.com/reel/Own123/'
  ]);
});
