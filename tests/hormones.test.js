const test = require('node:test');
const assert = require('node:assert');
require('./env').install();

const food = id => FoodDB.byId('f-' + id);
const hm = (f, g) => Object.fromEntries(Hormones.forFood(f, g).map(h => [h.k, h]));

test('whey raises insulin and IGF-1 despite having almost no sugar', () => {
  const h = hm(food('whey-protein-powder'), 30);
  assert.strictEqual(h.insulin.dir, 'up');
  assert.ok(h.insulin.items.some(i => /insulin index/.test(i.text)));
  assert.strictEqual(h.igf1.dir, 'up');
  assert.strictEqual(h.ghrelin.dir, 'down', 'protein suppresses the hunger hormone');
});

test('soy is reported as hormonally neutral, not as lowering testosterone', () => {
  const h = hm(food('tofu-firm'), 150);
  assert.strictEqual(h.testosterone.dir, 'neutral');
  assert.strictEqual(h.testosterone.items[0].evidence, 'strong');
});

test('licorice drives aldosterone and cortisol; beer moves estrogen, testosterone and sleep', () => {
  const lic = hm(food('licorice-lakritz'), 50);
  assert.strictEqual(lic.aldosterone.dir, 'up');
  assert.strictEqual(lic.aldosterone.tone, 'warn');
  assert.strictEqual(lic.cortisol.dir, 'up');
  const beer = hm(food('beer-regular'), 500);
  assert.strictEqual(beer.estrogen.dir, 'up');
  assert.ok(beer.estrogen.items.some(i => /hops/i.test(i.text)), 'hops detected from the name');
  assert.strictEqual(beer.testosterone.dir, 'down');
  assert.strictEqual(beer.melatonin.dir, 'down');
});

test('sugary drinks lower fullness signalling; fibre raises it', () => {
  assert.strictEqual(hm(food('cola'), 330).satiety.dir, 'down');
  assert.strictEqual(hm(food('lentils-cooked'), 200).satiety.dir, 'up');
});

test('effects come from the ingredient list of packaged products too', () => {
  const F = OffMap.FLAG;
  const bar = { name: 'Protein Riegel', n: Object.assign(Nutrition.empty(), { kcal: 360, protein: 30, carbs: 30, fat: 12, fiber: 3 }),
    flags: F.MILK_PROTEIN | F.FLAX };
  const h = hm(bar, 60);
  assert.ok(h.insulin.items.some(i => /Milk proteins/.test(i.text)), 'whey in the ingredients');
  assert.ok(h.testosterone.items.some(i => /Flaxseed/.test(i.text)), 'linseed in the ingredients');
  const tags = OffMap.ingredientFlags({ ingredients_tags: ['en:hops', 'de:pfefferminze', 'en:ashwagandha-extract'] });
  assert.ok(tags & F.HOPS && tags & F.MINT && tags & F.ADAPTOGEN);
});

test('the day picture merges hormones across foods and names them', () => {
  const entry = (id, g) => ({ name: food(id).name, refId: 'f-' + id, grams: g, n: Nutrition.scale(food(id).n, g) });
  const day = Hormones.forDay([entry('cola', 330), entry('beer-regular', 500), entry('espresso', 60)], e => FoodDB.byId(e.refId));
  const by = Object.fromEntries(day.map(h => [h.k, h]));
  assert.ok(by.insulin.foods.length >= 2, 'insulin moved by several foods');
  assert.strictEqual(by.cortisol.dir, 'up');
  assert.ok(by.melatonin.foods.includes('Espresso'));
});

test('every hormone reason cites sources that exist', () => {
  const missing = [];
  ['whey-protein-powder', 'beer-regular', 'licorice-lakritz', 'tofu-firm', 'salmon-atlantic-cooked', 'espresso', 'broccoli-raw']
    .forEach(id => Hormones.forFood(food(id), 200).forEach(h => h.items.forEach(i => i.src.forEach(s => {
      if (!Body.SOURCES[s]) missing.push(id + ':' + s);
    }))));
  assert.deepStrictEqual(missing, []);
});

test('ingredient-driven body effects: cocoa, garlic, cabbage family, adaptogens', () => {
  const F = OffMap.FLAG;
  const p = (flags, extra) => Object.assign({ name: 'X', n: Object.assign(Nutrition.empty(), { kcal: 200, carbs: 20, fat: 10, protein: 5 }), flags }, extra || {});
  const ids = f => Body.forFood(f, 100).map(e => e.id);
  assert.ok(ids(p(F.COCOA)).includes('cocoa'));
  assert.ok(ids(p(F.GARLIC)).includes('garlic'));
  assert.ok(ids(p(F.CRUCIFEROUS)).includes('cruciferous'));
  assert.ok(ids(p(F.ADAPTOGEN)).includes('adaptogen'));
});

/* ------------------------------------------------------------ supplements */
test('supplement doses are read per tablet from the label', () => {
  const d = OffMap.supplementDose({ serving_size: '1 Tablette (5.6 g)', serving_quantity: 5.6, product_name: 'Magnesium Brausetabletten',
    nutriments: { magnesium_serving: 0.24, 'vitamin-c_serving': 0.08, 'vitamin-d_100g': 0.0000446 } });
  assert.strictEqual(d.unitKey, 'tablet');
  assert.strictEqual(d.per.mg, 240);
  assert.ok(Math.abs(d.per.vitC - 80) < 0.01);
  assert.ok(Math.abs(d.per.vitD - 2.5) < 0.01, 'per-100 g value scaled by the serving');
  assert.strictEqual(OffMap.supplementUnit({ product_name: 'Omega 3 Kapseln' }), 'capsule');
});

test('supplement templates only use nutrients the app tracks', () => {
  const keys = new Set(Nutrition.KEYS);
  for (const t of Supplements.TEMPLATES) for (const k of Object.keys(t.per)) assert.ok(keys.has(k), t.name + ': ' + k);
  assert.ok(Supplements.TEMPLATES.length >= 20);
});

/* --------------------------------------------------------------- portions */
test('pack products without a serving size get a typical portion', () => {
  const tp = (n, liquid, pkg, cat) => LocalPack.typicalPortion(n, liquid, pkg, cat);
  assert.strictEqual(tp('Joghurt mild 3,5%', 0, 500).g, 150);
  assert.strictEqual(tp('Vollmilch Schokolade', 0, 100).g, 25);
  assert.strictEqual(tp('Coca-Cola', 1, 1500).g, 250);
  assert.strictEqual(tp('Weißwein trocken', 1, 750).g, 150);
  assert.strictEqual(tp('Paprikagulasch in Sahnesosse', 0, 870), null, 'ready meals are eaten as the pack');
  assert.strictEqual(tp('Mini Riegel', 0, 18).g, 18, 'never more than the pack');
});
