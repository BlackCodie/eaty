const test = require('node:test');
const assert = require('node:assert');
require('./env').install();

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ±${tol}, got ${a}`);

test('Mifflin-St Jeor BMR matches the published equation', () => {
  // 10*82 + 6.25*181 - 5*29 + 5 = 1811.25
  near(Nutrition.bmr({ sex: 'male', weight: 82, height: 181, age: 29 }), 1811.25, 0.01);
  // 10*64 + 6.25*168 - 5*29 - 161 = 1384
  near(Nutrition.bmr({ sex: 'female', weight: 64, height: 168, age: 29 }), 1384, 0.01);
});

test('targets apply goal, activity and macro split', () => {
  const t = Nutrition.targets({ sex: 'male', age: 29, height: 181, weight: 82, activity: 'moderate', goal: 'lose' });
  assert.strictEqual(t.kcal, 2250);                  // 1811.25 * 1.55 * 0.8, rounded to 10
  assert.strictEqual(t.protein, 164);                // 2.0 g/kg
  near(t.protein * 4 + t.carbs * 4 + t.fat * 9, t.kcal, 12, 'macros sum to target');
  assert.strictEqual(t.micros.fe, 8);                // adult male iron
});

test('a deficit never drops below the safety floor', () => {
  const t = Nutrition.targets({ sex: 'female', age: 60, height: 150, weight: 45, activity: 'sedentary', goal: 'lose' });
  assert.ok(t.kcal >= 1200, 'female floor is 1200 kcal, got ' + t.kcal);
});

test('women under 51 get the higher iron reference', () => {
  assert.strictEqual(Nutrition.targets({ sex: 'female', age: 30, height: 165, weight: 60 }).micros.fe, 18);
  assert.strictEqual(Nutrition.targets({ sex: 'female', age: 55, height: 165, weight: 60 }).micros.fe, 8);
});

test('scale and sum are linear', () => {
  const n = Nutrition.scale({ kcal: 200, protein: 10 }, 150);
  assert.strictEqual(n.kcal, 300);
  assert.strictEqual(n.protein, 15);
  assert.strictEqual(Nutrition.sum([n, n]).kcal, 600);
});

test('undeclared micronutrients are not counted as zero (regression)', () => {
  const t = Nutrition.targets({ sex: 'male', age: 29, height: 181, weight: 82, activity: 'moderate', goal: 'lose' });
  const brocc = { n: Nutrition.scale(FoodDB.byId('f-broccoli-raw').n, 200), hasMicros: true };
  const nutella = { n: Object.assign(Nutrition.empty(), { kcal: 539, carbs: 57.5, fat: 30.9, protein: 6.3 }), hasMicros: false };
  const entries = [brocc, nutella];

  const cov = Nutrition.microCoverage(entries);
  near(cov.fraction, 68 / 607, 0.01, 'coverage');

  const score = Nutrition.score(Nutrition.sum(entries.map(e => e.n)), t, entries);
  const micro = score.parts.find(p => p.label === 'Micronutrients');
  assert.ok(micro.pts >= 15, 'broccoli should carry the micro score, got ' + micro.pts);
  assert.match(micro.note, /from 11% of intake/);
});

test('entries logged before the hasMicros flag existed are treated as complete', () => {
  assert.strictEqual(Nutrition.microCoverage([{ n: { kcal: 100 } }]).fraction, 1);
});

test('exercise burn uses MET x weight x time', () => {
  // 9.8 MET * 3.5 * 81.9 / 200 * 40 = 561.9
  assert.strictEqual(Nutrition.burn('running', 40, 81.9), 562);
});
