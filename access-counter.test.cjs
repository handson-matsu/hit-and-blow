const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const source = readFileSync(join(__dirname, 'access-counter.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function run(fetch) {
  const context = vm.createContext({ window: {}, fetch });
  vm.runInContext(source, context);
  return context;
}
test('既存教材と同一のURL・パラメータ形式・GETオプション', () => {
  // Fixed reference verified against paper-copter-lab and chopsticks-game.
  const endpoint = 'https://script.google.com/macros/s/AKfycbxssCIHsD-N97SHxNC_GN0ihYeC0qy-lb-EY0KmSs6Gnztaph1sITMerLVEnNWOGkYc/exec';
  const calls = [];
  run((...args) => { calls.push(args); return Promise.resolve({}); });
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, endpoint);
  assert.deepEqual([...parsed.searchParams], [['app', 'hit-and-blow']]);
  assert.deepEqual(JSON.parse(JSON.stringify(options)), { method: 'GET', mode: 'no-cors', cache: 'no-store', credentials: 'omit', keepalive: true });
});
test('同じページで重複実行しても1回、別ページでは新たに1回', () => {
  let count = 0;
  const fetch = () => { count++; return Promise.resolve({}); };
  const context = run(fetch);
  vm.runInContext(source, context);
  assert.equal(count, 1);
  run(fetch);
  assert.equal(count, 2);
});
for (const mode of ['reject', 'throw', 'missing', 'pending']) test(`${mode}でも起動を阻害せず再送しない`, async () => {
  let count = 0;
  const fetch = mode === 'missing' ? undefined : () => {
    count++;
    if (mode === 'throw') throw Error('blocked');
    if (mode === 'reject') return Promise.reject(Error('offline'));
    return new Promise(() => {});
  };
  const context = run(fetch);
  vm.runInContext('window.gameReady = true', context);
  vm.runInContext(source, context);
  await tick();
  assert.equal(context.window.gameReady, true);
  assert.equal(count, mode === 'missing' ? 0 : 1);
});
test('応答の読み取りやゲーム操作への接続を行わない', async () => {
  run(() => Promise.resolve({ get text() { assert.fail('must not read text'); }, get json() { assert.fail('must not read json'); } }));
  await tick();
  assert.doesNotMatch(source, /addEventListener|setTimeout|setInterval/);
  assert.doesNotMatch(readFileSync(join(__dirname, 'script.js'), 'utf8'), /hitAndBlowAccessRecorded|script\.google\.com|\bfetch\s*\(/);
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  assert.equal((html.match(/src="access-counter.js"/g) || []).length, 1);
});
