const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, read } = require('./env');

const html = read('index.html');
const sw = read('service-worker.js');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const precache = [...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);

test('every script the page loads exists on disk', () => {
  for (const s of scripts) assert.ok(fs.existsSync(path.join(ROOT, s)), s + ' is referenced but missing');
});

test('every script the page loads is precached for offline use', () => {
  const missing = scripts.filter(s => !precache.includes(s));
  assert.deepStrictEqual(missing, [], 'add these to PRECACHE in service-worker.js');
});

test('every precached file exists', () => {
  for (const p of precache.filter(p => p && !p.endsWith('/'))) {
    assert.ok(fs.existsSync(path.join(ROOT, p)), 'PRECACHE lists missing file ' + p);
  }
});

test('shared modules load before the modules that use them', () => {
  const at = f => scripts.indexOf('js/' + f);
  assert.ok(at('offmap.js') < at('offapi.js') && at('offmap.js') < at('localpack.js'));
  assert.ok(at('quality.js') < at('ui.js'));
  assert.ok(at('nutrition.js') < at('quality.js'));
});

test('manifest icons and shortcuts point at real files', () => {
  const m = JSON.parse(read('manifest.json'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src);
  assert.ok(m.shortcuts.some(s => s.url.includes('action=scan')));
});

test('package.json version tracks the service worker version', () => {
  const pkg = JSON.parse(read('package.json'));
  const v = (sw.match(/eaty-v([\d.]+)/) || [])[1];
  assert.strictEqual(pkg.version, v, 'bump both together so deploys invalidate the cache');
});
