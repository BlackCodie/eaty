const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, ROOT, read } = require('./env');
install();

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ±${tol}, got ${a}`);

/* ------------------------------------------------ Open Food Facts mapping */
test('OFF *_100g values are grams and are scaled to the app units', () => {
  const f = OFF.toFood({
    code: '4000000000001', product_name: 'Test', brands: 'B',
    nutriments: {
      'energy-kcal_100g': 250, proteins_100g: 10, carbohydrates_100g: 30, fat_100g: 9,
      sodium_100g: 0.0428,          // g  -> 42.8 mg
      calcium_100g: 0.12,           // g  -> 120 mg
      'vitamin-a_100g': 0.0003,     // g  -> 300 µg
      'vitamin-d_100g': 0.0000025,  // g  -> 2.5 µg
      'vitamin-c_100g': 0.06        // g  -> 60 mg
    }
  });
  near(f.n.na, 42.8, 0.01, 'sodium mg');
  near(f.n.ca, 120, 0.01, 'calcium mg');
  near(f.n.vitA, 300, 0.01, 'vitamin A µg');
  near(f.n.vitD, 2.5, 0.001, 'vitamin D µg');
  near(f.n.vitC, 60, 0.01, 'vitamin C mg');
});

test('OFF falls back to kJ and to salt when kcal or sodium are missing', () => {
  const f = OFF.toFood({ code: '4000000000002', product_name: 'T',
    nutriments: { 'energy-kj_100g': 418.4, salt_100g: 1.0 } });
  near(f.n.kcal, 100, 0.01, 'kcal from kJ');
  near(f.n.na, 400, 0.01, 'sodium from salt / 2.5');
});

test('incomplete OFF products are returned, not reported as missing (regression)', () => {
  const noName = OFF.toFood({ code: '4000000000003', product_name: '', brands: 'Alnatura', quantity: '500 g',
    nutriments: { 'energy-kcal_100g': 120 } });
  assert.strictEqual(noName.name, 'Alnatura 500 g');
  assert.strictEqual(noName.needsNutrition, false);

  const noLabel = OFF.toFood({ code: '4000000000004', product_name: 'Dinkelbrot', nutriments: {} });
  assert.strictEqual(noLabel.needsNutrition, true);
});

test('multipack quantities are multiplied out (regression)', () => {
  const f = OFF.toFood({ code: '40111216', product_name: 'Bounty', quantity: '2 x 28,5 g',
    serving_size: '1 piece (29 g)', nutriments: { 'energy-kcal_100g': 483 } });
  const pkg = f.servings.find(s => /Whole pack/.test(s.label));
  assert.strictEqual(pkg.g, 57);
});

test('chocolate spread is not classified as a drink (regression)', () => {
  const f = OFF.toFood({ code: '3017620422003', product_name: 'Nutella', quantity: '400 g',
    categories_tags: ['en:plant-based-foods-and-beverages', 'en:spreads', 'en:sweet-spreads'],
    nutriments: { 'energy-kcal_100g': 539 } });
  assert.strictEqual(f.unit, 'g');
});

/* ------------------------------------------------ FoodData Central mapping */
test('FDC nutrients are converted from their declared unit', () => {
  const f = FDC.toFood({
    fdcId: 1, description: 'BROCCOLI, RAW', dataType: 'Foundation',
    foodNutrients: [
      { nutrientNumber: '208', unitName: 'KCAL', value: 34 },
      { nutrientNumber: '203', unitName: 'G', value: 2.8 },
      { nutrientNumber: '401', unitName: 'MG', value: 89.2 },
      { nutrientNumber: '430', unitName: 'UG', value: 101.6 },
      { nutrientNumber: '301', unitName: 'G', value: 0.047 }     // unusual unit: 47 mg
    ]
  });
  assert.strictEqual(f.name, 'Broccoli, Raw');                   // de-shouted
  near(f.n.vitC, 89.2, 0.001);
  near(f.n.vitK, 101.6, 0.001);
  near(f.n.ca, 47, 0.001, 'calcium converted G -> MG');
});

/* ---------------------------------------------------------------- the pack */
test('the app and the pack builder shard barcodes with the same function', () => {
  const tool = read('tools/fetch-de.js');
  assert.ok(tool.includes('OffMap.shardOf(rec[0], SHARDS)'), 'pack builder must shard with OffMap.shardOf');
  const idx = JSON.parse(read('data/de/index.json'));
  assert.strictEqual(idx.hash, 'fnv1a-fmix32');
  return LocalPack.info().catch(() => null).then(() => {
    for (const code of ['4061458012171', '20816575', '3017620422003', '0012345678905']) {
      assert.strictEqual(LocalPack.shardOf(code), OffMap.shardOf(code, idx.shards));
    }
  });
});

test('shards are balanced (regression: half of them were nearly empty)', () => {
  const idx = JSON.parse(read('data/de/index.json'));
  const sizes = [];
  for (let i = 0; i < idx.shards; i++) sizes.push(fs.statSync(path.join(ROOT, 'data/de', String(i).padStart(idx.pad, '0') + '.json')).size);
  assert.ok(Math.max(...sizes) < Math.min(...sizes) * 1.5, 'shard sizes ' + Math.min(...sizes) + '..' + Math.max(...sizes));
});

test('known German products are present in the shipped pack', () => {
  const idx = JSON.parse(read('data/de/index.json'));
  assert.strictEqual(idx.version, 5);
  assert.ok(idx.count > 100000, 'pack should hold 100k+ products, has ' + idx.count);
  const lookup = code => {
    const file = path.join(ROOT, 'data/de', String(OffMap.shardOf(code, idx.shards)).padStart(idx.pad, '0') + '.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).find(r => r[0] === code);
  };
  for (const [code, needle] of [['4061458012171', 'Speisequark'], ['4337185455810', 'Speisequark'], ['3017620422003', 'Nutella']]) {
    const row = lookup(code);
    assert.ok(row, code + ' missing from pack');
    assert.match(row[1], new RegExp(needle));
    assert.strictEqual(row.length, idx.fields.length, 'row width matches the declared fields');
  }
});

test('pack rows expand into foods carrying quality inputs', () => {
  const row = ['3017620422003', 'Nutella', 'Ferrero', 11, 0, 15, 400, 539, 6.3, 57.5, 30.9, 0, 56.3, 10.6, 43, 4, 2, 5, 0];
  const f = LocalPack.toFood(row);
  assert.strictEqual(f.nova, 4);
  assert.strictEqual(f.additives, 2);
  assert.strictEqual(f.nutriscore, 'E');
  assert.strictEqual(f.cat, 'Snacks & Sweets');
  assert.strictEqual(Quality.rate(f).grade, 'E');
});

/* ------------------------------------------------------------ supplements */
test('supplement IU conversion uses the standard factors', () => {
  near(2000 * Supplements.IU.vitD.factor, 50, 1e-9, 'vitamin D: 2000 IU = 50 µg');
  near(1000 * Supplements.IU.vitA.factor, 300, 1e-9, 'vitamin A: 1000 IU = 300 µg RAE');
});

test('supplements store per-dose amounts so one "gram" is one dose', () => {
  const s = Supplements.build({ name: 'D3', unitKey: 'softgel', daily: true,
    per: Object.assign(Nutrition.empty(), { vitD: 50 }) });
  assert.strictEqual(Supplements.perDose(s, 'vitD'), 50);
  assert.strictEqual(Nutrition.scale(s.n, 2).vitD, 100, 'two softgels');
  assert.deepStrictEqual(s.servings.slice(0, 2).map(x => x.label), ['1 softgel', '2 softgels']);
});

test('name-only pack records open as "needs nutrition" and are never scored', () => {
  const f = LocalPack.toFood(['4000000000097', 'Mystery Riegel', 'X', 4, 0, 0, 50,
    null, null, null, null, null, null, null, null, 4, 2, 0, 0, -1, '322.471', 0, 9, 0]);
  assert.strictEqual(f.needsNutrition, true);
  assert.deepStrictEqual(f.declared, []);
  assert.strictEqual(f.n.kcal, 0);
  assert.deepStrictEqual(f.additiveCodes, ['322', '471']);
  assert.strictEqual(Quality.rate(f), null);
});
