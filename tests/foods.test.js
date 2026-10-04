const test = require('node:test');
const assert = require('node:assert');
const { install, read } = require('./env');
install();

test('every built-in food has the full 29-nutrient profile and a unique id', () => {
  const foods = FoodDB.all();
  assert.ok(foods.length >= 380, 'expected 380+ foods, got ' + foods.length);
  const ids = new Set();
  for (const f of foods) {
    assert.ok(!ids.has(f.id), 'duplicate id ' + f.id);
    ids.add(f.id);
    for (const k of FoodDB.KEYS) assert.ok(Number.isFinite(f.n[k]), `${f.name}.${k} is not a number`);
    assert.ok(f.n.kcal >= 0 && f.n.kcal <= 900, `${f.name} has implausible energy ${f.n.kcal}`);
    assert.ok(f.servings.length >= 2, f.name + ' has no servings');
  }
});

test('every German search alias points at a real food', () => {
  const src = read('js/foods-de.js');
  const block = src.slice(src.indexOf('const ALIASES = {'), src.indexOf('};', src.indexOf('const ALIASES = {')));
  const ids = [...block.matchAll(/'(f-[a-z0-9-]+)':/g)].map(m => m[1]);
  assert.ok(ids.length > 100);
  const missing = ids.filter(id => !FoodDB.byId(id));
  assert.deepStrictEqual(missing, [], 'aliases for foods that do not exist');
});

test('German words find the right foods offline', () => {
  const top = q => (FoodDB.search(q, [], 1)[0] || {}).name || '';
  assert.match(top('hähnchenbrust'), /Chicken breast/);
  assert.match(top('haehnchenbrust'), /Chicken breast/);
  assert.match(top('magerquark'), /Magerquark/);
  assert.match(top('zwiebel'), /Onion/);
  assert.match(top('brötchen'), /brötchen/i);
});

test('built-in foods count as having micronutrient data; label-only products do not', () => {
  assert.strictEqual(App.foodHasMicros(FoodDB.byId('f-banana')), true);
  assert.strictEqual(App.foodHasMicros({ declared: ['kcal', 'protein', 'fat'] }), false);
  assert.strictEqual(App.foodHasMicros({ declared: ['kcal', 'ca'] }), true);
});
