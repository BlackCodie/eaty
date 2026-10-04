const test = require('node:test');
const assert = require('node:assert');
require('./env').install();

const rate = id => Quality.rate(FoodDB.byId(id));

test('calibration: whole foods outrank processed ones', () => {
  const order = ['f-broccoli-raw', 'f-lentils-cooked', 'f-oats-rolled-dry',
                 'f-bread-white', 'f-potato-crisps-chips', 'f-milk-chocolate'];
  const scores = order.map(id => rate(id).score);
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i - 1] > scores[i], `${order[i - 1]} (${scores[i - 1]}) should beat ${order[i]} (${scores[i]})`);
  }
  assert.strictEqual(rate('f-broccoli-raw').grade, 'A');
  assert.ok(['D', 'E'].includes(rate('f-milk-chocolate').grade), 'milk chocolate graded ' + rate('f-milk-chocolate').grade);
});

test('zero-calorie drinks are not punished for having no nutrients (regression)', () => {
  assert.strictEqual(rate('f-water').grade, 'A');
  assert.ok(!rate('f-water').parts.some(p => p.key === 'density' || p.key === 'protein'));
});

test('drinks are judged on beverage sugar thresholds (regression)', () => {
  const cola = rate('f-cola'), diet = rate('f-diet-cola');
  assert.ok(cola.score < diet.score, 'sugary cola must rate below diet cola');
  assert.ok(['D', 'E'].includes(cola.grade), 'cola graded ' + cola.grade);
  assert.strictEqual(cola.parts.find(p => p.key === 'sugar').note, 'per 100 ml');
});

test('missing label data is dropped and reweighted, never scored as zero', () => {
  const labelOnly = {
    n: Object.assign(Nutrition.empty(), { kcal: 68, protein: 12, carbs: 4, fat: 0.2, sugar: 4, satfat: 0.1, na: 40 }),
    declared: ['kcal', 'protein', 'carbs', 'fat', 'sugar', 'satfat', 'na'],
    nova: 1, additives: 0
  };
  const r = Quality.rate(labelOnly);
  assert.ok(!r.parts.some(p => p.key === 'density'), 'no density criterion without micro data');
  assert.ok(!r.parts.some(p => p.key === 'fiber'), 'no fibre criterion when fibre is undeclared');
  assert.ok(r.confidence < 100);
  assert.ok(r.score >= 80, 'plain quark should not be dragged down by absent data, got ' + r.score);
});

test('supplements are not given a food grade', () => {
  assert.strictEqual(Quality.rate({ kind: 'supplement', n: Nutrition.empty() }), null);
});

test('real NOVA data wins over the name-based estimate', () => {
  const f = Object.assign({}, FoodDB.byId('f-broccoli-raw'), { nova: 4 });
  const r = Quality.rate(f);
  assert.strictEqual(r.nova, 4);
  assert.strictEqual(r.estimatedNova, false);
});

test('a day is rated by calories, not by item count', () => {
  const day = Quality.rateDay(
    [{ name: 'broccoli', refId: 'b', n: { kcal: 50 } }, { name: 'chocolate', refId: 'c', n: { kcal: 500 } }],
    e => FoodDB.byId(e.refId === 'b' ? 'f-broccoli-raw' : 'f-milk-chocolate'));
  assert.ok(day.score < 50, 'mostly chocolate should rate poorly, got ' + day.score);
  assert.strictEqual(day.best.name, 'broccoli');
  assert.strictEqual(day.worst.name, 'chocolate');
});

test('quality.js also loads as a CommonJS module for the pack builder', () => {
  const Q = require('../js/quality.js');
  assert.strictEqual(typeof Q.rate, 'function');
});

test('a high-risk additive caps the score at 49', () => {
  const f = { n: Object.assign(Nutrition.empty(), { kcal: 60, protein: 10, carbs: 3, fat: 0.5, sugar: 3, satfat: 0.2, na: 40 }),
    declared: ['kcal', 'protein', 'carbs', 'fat', 'sugar', 'satfat', 'na'], nova: 3, additiveCodes: ['171'] };
  const r = Quality.rate(f);
  assert.ok(r.score <= 49, 'capped, got ' + r.score);
  assert.match(r.cap, /Titanium dioxide/);
  assert.ok(r.bad.some(b => /171/.test(b.text)));
});

test('olive oil is judged on its fat quality, not punished like butter', () => {
  assert.ok(rate('f-olive-oil').score > rate('f-butter').score + 20);
});

test('sweetened zero-sugar drinks do not score like water', () => {
  assert.ok(rate('f-diet-cola').score < rate('f-water').score - 25);
});
