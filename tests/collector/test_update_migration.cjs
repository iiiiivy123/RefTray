const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../source/extension/release-check.js'), 'utf8');
const current = 'https://api.github.com/repos/iiiiivy123/RefTray/releases/latest';
const legacy = 'https://api.github.com/repos/iiiiivy123/inspiration-collector/releases/latest';

function harness(responses) {
  const store = {}, calls = [];
  const context = vm.createContext({AbortSignal,
    chrome: {storage: {local: {get: async () => store, set: async values => Object.assign(store, values)}}},
    fetch: async (url, options) => {
      calls.push({url, options});
      assert.ok(responses.length, 'unexpected additional request');
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    }
  });
  return {store, calls, updates: vm.runInContext(source + ';RefTrayUpdates', context)};
}
const success = (release = {tag_name: 'v1.0.1', body: 'Bridge release'}) =>
  ({ok: true, status: 200, json: async () => release});
const failure = (status, headers) => ({ok: false, status, headers: {get: key => headers?.[key]}});

test('release notice uses RefTray first and caches its result', async () => {
  const {updates, calls, store} = harness([success()]);
  assert.equal((await updates.check('1.0.0')).version, 'v1.0.1');
  await updates.check('1.0.0');
  assert.deepEqual(calls.map(call => call.url), [current]);
  assert.equal(store.releaseCheck.latest.version, 'v1.0.1');
});

test('before rename a 404 uses old repo with the same privacy and timeout options', async () => {
  const {updates, calls} = harness([failure(404), success()]);
  assert.equal((await updates.check('1.0.0')).version, 'v1.0.1');
  assert.deepEqual(calls.map(call => call.url), [current, legacy]);
  for (const {options} of calls) {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.equal(calls[0].options.signal, calls[1].options.signal);
});

test('rate limits, offline and server errors never trigger legacy requests', async () => {
  for (const response of [failure(401), failure(403), failure(429), failure(500), new Error('offline')]) {
    const {updates, calls, store} = harness([response]);
    assert.equal(await updates.check('1.0.0'), null);
    assert.equal(calls.length, 1);
    assert.ok(store.releaseCheck.error);
  }
});

test('canonical metadata errors and current releases do not consult legacy', async () => {
  for (const response of [success({tag_name: 'v1.0.1', prerelease: true}),
      success({tag_name: 'v1.0.1', draft: true}), success({tag_name: 'invalid'}),
      success({tag_name: 'v1.0.0'}), {ok: true, status: 200, json: async () => {throw Error('bad JSON');}}]) {
    const {updates, calls} = harness([response]);
    assert.equal(await updates.check('1.0.0'), null);
    assert.equal(calls.length, 1);
  }
});

test('failure on both repositories stays an error with no request loop', async () => {
  const {updates, calls, store} = harness([failure(404), failure(404)]);
  assert.equal(await updates.check('1.0.0'), null);
  assert.equal(calls.length, 2);
  assert.equal(store.releaseCheck.error, 'HTTP 404');
});

test('legacy fallback rate limit preserves Retry-After backoff', async () => {
  const start = Date.now();
  const {updates, store, calls} = harness([failure(404), failure(429, {'retry-after': '7200'})]);
  assert.equal(await updates.check('1.0.0'), null);
  assert.equal(calls.length, 2);
  assert.ok(store.releaseCheck.nextCheck >= start + 7200000);
  assert.equal(store.releaseCheck.error, 'HTTP 429');
});
