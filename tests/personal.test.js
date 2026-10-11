const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, ROOT } = require('./env');
install();

global.fetch = async url => {
  const file = path.join(ROOT, String(url).split('?')[0]);
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
};

const food = id => FoodDB.byId('f-' + id);
const H = extra => Object.assign({ allergens: [], diet: 'any', avoidAlcohol: false, avoidCaffeine: false,
  pregnant: false, breastfeeding: false, meds: [] }, extra);
const titles = (f, g, h) => Personal.check(f, g, h).map(w => w.level + ':' + w.title);

/* ---------------------------------------------------------- personal */
test('no profile, no warnings', () => {
  assert.deepStrictEqual(Personal.check(food('salami'), 50, H({})), []);
});

test('allergens: declared on packaged products, likely for whole foods', async () => {
  assert.ok(titles(food('magerquark'), 250, H({ allergens: ['milk'] })).includes('stop:Likely contains milk'));
  const nutella = await LocalPack.lookup('3017620422003');
  const w = Personal.check(nutella, 30, H({ allergens: ['milk', 'nuts'] }));
  assert.ok(w.some(x => /contains milk/i.test(x.title) && x.level === 'stop'));
  assert.deepStrictEqual(Personal.check(food('apple-with-skin'), 150, H({ allergens: ['milk', 'gluten'] })), []);
});

test('diets: vegan and vegetarian conflicts, whole plant foods pass silently', () => {
  assert.ok(titles(food('salmon-atlantic-cooked'), 150, H({ diet: 'vegan' })).includes('stop:Not vegan'));
  assert.ok(titles(food('chicken-breast-cooked'), 150, H({ diet: 'vegetarian' })).includes('stop:Not vegetarian'));
  assert.deepStrictEqual(Personal.check(food('salmon-atlantic-cooked'), 150, H({ diet: 'pescatarian' })), []);
  assert.deepStrictEqual(Personal.check(food('lentils-cooked'), 200, H({ diet: 'vegan' })), []);
  const gelatine = { name: 'Fruchtgummi', n: Object.assign(Nutrition.empty(), { kcal: 340, carbs: 77 }), additiveCodes: ['428'] };
  assert.ok(titles(gelatine, 30, H({ diet: 'vegetarian' })).some(t => /Not vegetarian/.test(t)));
});

test('pregnancy: alcohol, caffeine, vitamin A, listeria', () => {
  const h = H({ pregnant: true });
  assert.ok(titles(food('beer-regular'), 330, h).includes('stop:Alcohol in pregnancy'));
  assert.ok(titles(food('espresso'), 120, h).some(t => /caution:\d+ mg caffeine/.test(t)));
  assert.ok(titles(food('beef-liver-cooked'), 100, h).includes('stop:Very high vitamin A'));
  assert.ok(titles(food('smoked-salmon'), 80, h).includes('caution:Raw or cold-smoked food'));
});

test('medicines: grapefruit, tyramine, vitamin K, thyroid timing', () => {
  assert.ok(titles(food('grapefruit'), 150, H({ meds: ['statin'] })).includes('stop:Grapefruit and your statin'));
  assert.ok(titles(food('salami'), 50, H({ meds: ['maoi'] })).includes('stop:Tyramine and your MAO inhibitor'));
  assert.ok(titles(food('spinach-raw'), 100, H({ meds: ['vka'] })).some(t => /vitamin K/.test(t)));
  assert.ok(titles(food('tofu-firm'), 150, H({ meds: ['thyroid'] })).includes('caution:Timing with your thyroid tablet'));
});

test('every warning cites sources that exist', () => {
  const h = H({ allergens: ['milk'], diet: 'vegan', avoidAlcohol: true, pregnant: true, meds: Personal.MEDICINES.map(m => m.k) });
  const missing = [];
  ['beer-regular', 'grapefruit', 'salami', 'spinach-raw', 'espresso', 'beef-liver-cooked', 'magerquark']
    .forEach(id => Personal.check(food(id), 200, h).forEach(w => w.src.forEach(s => { if (!Body.SOURCES[s]) missing.push(id + ':' + s); })));
  assert.deepStrictEqual(missing, []);
});

/* ------------------------------------------------------- quick search */
test('the quick index finds popular products by name with no pack download', async () => {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/de/names.json'), 'utf8'));
  assert.ok(idx.count >= 10000, 'thousands of products indexed');
  assert.ok(idx.rows.every(r => r[7] !== null), 'only products with a nutrition label');
  const hits = await LocalPack.quickSearch('nutella', 10);
  assert.ok(hits.length > 0 && hits.every(f => /nutella/i.test(f.name)));
  assert.ok((await LocalPack.quickSearch('Müsli', 5)).length > 0, 'umlauts are folded');
});

/* ------------------------------------------------------- weekly report */
test('the weekly report sums up logged days, gaps and hormones', async () => {
  App.state.profile = { sex: 'male', weight: 80 };
  App.state.targets = Nutrition.targets({ sex: 'male', age: 30, height: 180, weight: 80, activity: 'moderate', goal: 'maintain' });
  const start = App.date.weekStart(App.date.today());
  const entry = (id, g, d) => Object.assign(App.entryFromFood(food(id), 1, { label: g + ' g', g }), { date: d, meal: 'lunch' });
  const entries = [entry('cola', 330, start), entry('salmon-atlantic-cooked', 150, start), entry('beer-regular', 500, App.date.add(start, 1))];
  const real = Data.entriesBetween;
  Data.entriesBetween = async (from, to) => entries.filter(e => e.date >= from && e.date <= to);
  try {
    const w = await Report.summarise(start);
    assert.strictEqual(w.n, 2, 'two days logged');
    assert.strictEqual(w.alcoholDays, 1);
    assert.ok(w.hormones.some(h => h.h.k === 'insulin'));
    assert.ok(Array.isArray(w.gaps));
    assert.ok(w.top.length >= 3);
  } finally { Data.entriesBetween = real; }
});

/* ---------------------------------------------------------- 2.4 */
test('health summary names what is set, and is empty when nothing is', () => {
  assert.strictEqual(Personal.summary(H({})), '');
  const s = Personal.summary(H({ allergens: ['gluten', 'milk'], diet: 'vegetarian', meds: ['statin', 'iron'], avoidCaffeine: true }));
  assert.strictEqual(s, 'Gluten, Milk · Vegetarian · No caffeine · 2 medicines');
  assert.strictEqual(Personal.summary(H({ pregnant: true, breastfeeding: true })), 'Pregnant');
});
