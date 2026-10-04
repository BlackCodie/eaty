const test = require('node:test');
const assert = require('node:assert');
require('./env').install();

test('App.esc neutralises every HTML metacharacter', () => {
  assert.strictEqual(App.esc('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.strictEqual(App.esc(null), '');
  assert.strictEqual(App.esc(0), '0');
});

test('App.safeImg only passes base64 image data URLs', () => {
  assert.strictEqual(App.safeImg('javascript:alert(1)'), '');
  assert.strictEqual(App.safeImg('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.strictEqual(App.safeImg('x" onerror="a()'), '');
  assert.strictEqual(App.safeImg('data:image/jpeg;base64,/9j/4AAQ=='), 'data:image/jpeg;base64,/9j/4AAQ==');
});

test('date keys cross month and year boundaries', () => {
  assert.strictEqual(App.date.add('2026-01-31', 1), '2026-02-01');
  assert.strictEqual(App.date.add('2026-03-01', -1), '2026-02-28');
  assert.strictEqual(App.date.add('2028-03-01', -1), '2028-02-29');          // leap year
  assert.strictEqual(App.date.add('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(App.date.diff('2026-03-10', '2026-03-01'), 9);
  assert.deepStrictEqual(App.date.range('2026-08-03', 3), ['2026-08-01', '2026-08-02', '2026-08-03']);
});

test('week start honours the Monday/Sunday preference', () => {
  App.state.settings = { firstDay: 'mon' };
  assert.strictEqual(App.date.weekStart('2026-08-14'), '2026-08-10');       // Fri -> Mon
  assert.strictEqual(App.date.weekStart('2026-08-16'), '2026-08-10');       // Sun belongs to the week before
  App.state.settings = { firstDay: 'sun' };
  assert.strictEqual(App.date.weekStart('2026-08-14'), '2026-08-09');
  assert.strictEqual(App.date.weekStart('2026-08-16'), '2026-08-16');
  App.state.settings = { firstDay: 'mon' };
});
