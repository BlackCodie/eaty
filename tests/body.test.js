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
const ids = list => list.map(e => e.id);

/* ------------------------------------------------------------ compounds */
test('every id the compound tables name exists in the built-in database', () => {
  const missing = [...new Set(FoodDB.COMPOUND_IDS)].filter(id => !food(id));
  assert.deepStrictEqual(missing, []);
});

test('glycemic load follows GI x available carbohydrate', () => {
  const rice = food('rice-white-cooked');
  const avail = rice.n.carbs - rice.n.fiber;
  assert.ok(Math.abs(rice.n.gl - rice.gi * avail / 100) < 0.01);
  assert.strictEqual(food('salmon-atlantic-cooked').n.gl, 0, 'no carbs, no glycemic load');
});

test('free sugar is the WHO definition: juice counts, whole fruit does not', () => {
  assert.strictEqual(food('banana').n.freesugar, 0);
  assert.strictEqual(food('orange-juice').n.freesugar, food('orange-juice').n.sugar);
  assert.ok(food('milk-chocolate').n.freesugar < food('milk-chocolate').n.sugar, 'lactose is not free sugar');
});

test('espresso is its own food and much stronger than filter coffee per ml', () => {
  assert.ok(food('espresso').n.caffeine > food('coffee-black').n.caffeine * 4);
  assert.ok(!food('coffee-black').servings.some(s => /espresso/i.test(s.label)));
});

/* ---------------------------------------------------------- food effects */
test('a double espresso reports caffeine with strong evidence and sources', () => {
  const fx = Body.forFood(food('espresso'), 60).find(e => e.id === 'caffeine');
  assert.ok(fx, 'caffeine effect present');
  assert.strictEqual(fx.evidence, 'strong');
  assert.ok(fx.src.every(k => Body.SOURCES[k]), 'every source key resolves');
});

test('salmon is good for the heart; salami carries the processed-meat warning', () => {
  assert.ok(ids(Body.forFood(food('salmon-atlantic-cooked'), 150)).includes('omega3'));
  const salami = Body.forFood(food('salami'), 50);
  const pm = salami.find(e => e.id === 'processed-meat');
  assert.ok(pm && pm.tone === 'warn', 'processed meat flagged as a warning');
  assert.strictEqual(salami[0].tone, 'warn', 'warnings sort first');
});

test('soy is presented as hormonally neutral, licorice as a blood-pressure risk', () => {
  const soy = Body.forFood(food('tofu-firm'), 150).find(e => e.id === 'isoflavones');
  assert.strictEqual(soy.tone, 'info');
  assert.match(soy.text, /no effect on testosterone/);
  const lic = Body.forFood(food('licorice-lakritz'), 60).find(e => e.id === 'licorice');
  assert.strictEqual(lic.tone, 'warn', '60 g licorice passes the 100 mg glycyrrhizin limit');
});

test('effects scale with the portion', () => {
  const small = Body.forFood(food('rice-white-cooked'), 50).find(e => e.id === 'gl');
  const big = Body.forFood(food('rice-white-cooked'), 300).find(e => e.id === 'gl');
  assert.ok(!small || small.tone !== 'caution');
  assert.strictEqual(big.tone, 'caution');
});

test('additive effects come from the product\'s own E-numbers', () => {
  const diet = Object.assign({}, food('diet-cola'));
  const fx = ids(Body.forFood(diet, 330));
  assert.ok(fx.includes('sweeteners') && fx.includes('phosphates'));
  const plain = { name: 'Test', n: Nutrition.empty(), additiveCodes: ['171'], flags: 0 };
  assert.ok(ids(Body.forFood(plain, 100)).includes('tio2'));
});

/* ------------------------------------------------------------- the day */
test('the day summary totals compounds and flags late caffeine', () => {
  const evening = new Date(); evening.setHours(17, 0, 0, 0);
  const entries = [
    { name: 'Espresso', refId: 'f-espresso', n: Nutrition.scale(food('espresso').n, 60), t: evening.getTime() },
    { name: 'Salmon', refId: 'f-salmon-atlantic-cooked', n: Nutrition.scale(food('salmon-atlantic-cooked').n, 150) }
  ];
  const day = Body.forDay(entries, e => FoodDB.byId(e.refId), { weight: 80 });
  const caf = day.items.find(i => i.id === 'caffeine');
  assert.strictEqual(caf.tone, 'caution', 'caffeine after 3 pm');
  assert.strictEqual(day.items.find(i => i.id === 'omega3').tone, 'good');
  assert.ok(day.items.find(i => i.id === 'protein').value > 0.4);
});

test('an ultra-processed day is called out', () => {
  const entries = [{ name: 'Gummy bears', refId: 'f-gummy-bears', n: Nutrition.scale(food('gummy-bears').n, 200) }];
  const upf = Body.forDay(entries, e => FoodDB.byId(e.refId), {}).items.find(i => i.id === 'upf');
  assert.strictEqual(upf.tone, 'warn');
});

/* ------------------------------------------------------------ estimates */
test('packaged products borrow micronutrients from the closest reference food', async () => {
  const quark = await LocalPack.lookup('4061458012171');
  const est = Estimate.apply(quark);
  assert.ok(est.estimate, 'an estimate was made');
  assert.match(est.estimate.refName, /quark/i);
  assert.ok(est.n.ca > 50, 'calcium filled in');
  assert.ok(est.microsEstimated);
  assert.ok(!est.declared.includes('ca'), 'estimates are never marked as declared');
  assert.strictEqual(Quality.rate(est).score, Quality.rate(quark).score, 'estimates do not move the score');
});

test('estimates never overwrite a declared value and never match on category words alone', () => {
  const f = { name: 'Fruit something', n: Object.assign(Nutrition.empty(), { kcal: 50, carbs: 12, sugar: 10, ca: 999 }),
    declared: ['kcal', 'carbs', 'sugar', 'ca'], cat: 'Fruit' };
  const est = Estimate.apply(f);
  assert.strictEqual(est.n.ca, 999);
  assert.strictEqual(est.estimate, undefined, '"fruit" alone must not match grapefruit or kiwi');
});

test('German compound words find their head noun', () => {
  assert.ok(Estimate.words({ name: 'Erdbeerjoghurt' }).includes('joghurt'));
});

test('zero-calorie drinks match zero-calorie references (caffeine in Coke Zero)', async () => {
  const zero = Estimate.apply(await LocalPack.lookup('5449000131805'));
  assert.ok(zero.n.caffeine > 5);
});

test('estimates can be switched off', () => {
  App.state.settings.estimateMicros = false;
  assert.strictEqual(Estimate.enabled(), false);
  App.state.settings.estimateMicros = true;
  assert.strictEqual(Estimate.enabled(), true);
});

/* ---------------------------------------------------------------- backup */
test('backups never contain API keys', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  assert.match(src, /SECRET_SETTINGS = \['fdcKey', 'claudeKey'\]/);
});
