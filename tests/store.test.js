const test = require('node:test');
const assert = require('node:assert');
require('./env').install();

test('import rejects IDs that could break out of an HTML attribute', () => {
  assert.strictEqual(Data.sanitizeRow('entries', { id: 'x" onclick="a()', date: '2026-08-14', n: {} }), null);
  assert.strictEqual(Data.sanitizeRow('entries', { id: '<svg>', date: '2026-08-14', n: {} }), null);
  assert.ok(Data.sanitizeRow('entries', { id: 'e_lx9abc', date: '2026-08-14', n: {} }));
  assert.ok(Data.sanitizeRow('foods', { id: 'off-4061458012171', n: {} }));
});

test('import rejects malformed dates and coerces numbers', () => {
  assert.strictEqual(Data.sanitizeRow('entries', { id: 'a', date: '2026-8-1', n: {} }), null);
  assert.strictEqual(Data.sanitizeRow('weights', { date: 'yesterday', kg: 80 }), null);
  assert.strictEqual(Data.sanitizeRow('weights', { date: '2026-08-14', kg: 'heavy' }), null);
  const e = Data.sanitizeRow('entries', { id: 'a', date: '2026-08-14', qty: '2', n: { kcal: '100', protein: 'x' } });
  assert.strictEqual(e.qty, 2);
  assert.strictEqual(e.n.kcal, 100);
  assert.strictEqual(e.n.protein, 0);
});

test('import strips non-image data from recipe photos', () => {
  const r = Data.sanitizeRow('recipes', { id: 'r1', name: 'R', servings: '<b>', image: 'javascript:alert(1)', ingredients: [] });
  assert.strictEqual(r.image, '');
  assert.strictEqual(r.servings, 1);
});

test('a bad backup in replace mode leaves existing data untouched', async () => {
  await Data.saveEntry({ id: 'keep_me', date: '2026-08-14', meal: 'lunch', name: 'keep', n: { kcal: 1 } });
  await assert.rejects(
    Data.importAll({ app: 'eaty', data: { entries: [{ nonsense: true }] } }, 'replace'),
    /no usable records/);
  assert.ok(await Data.DB.get('entries', 'keep_me'), 'entry must survive a failed replace');
});

test('range and distinct-date reads return only what was asked for', async () => {
  const rows = [];
  for (const d of ['2026-08-01', '2026-08-02', '2026-08-02', '2026-08-10']) {
    rows.push({ id: 'r' + rows.length, date: d, meal: 'lunch', name: 'x', n: { kcal: 1 } });
  }
  await Data.bulkEntries(rows);
  const inRange = await Data.entriesBetween('2026-08-01', '2026-08-02');
  assert.strictEqual(inRange.filter(e => e.id.startsWith('r')).length, 3);
  const dates = await Data.loggedDates();
  assert.ok(dates.includes('2026-08-10'));
  assert.strictEqual(dates.filter(d => d === '2026-08-02').length, 1, 'dates are distinct');
});
