const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { install, ROOT } = require('./env');
install();

// LocalPack fetches relative URLs; serve them from disk.
global.fetch = async url => {
  const file = path.join(ROOT, String(url).split('?')[0]);
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
           arrayBuffer: async () => fs.readFileSync(file) };
};

test('the alternatives index exists and references real rows', () => {
  const top = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/de/top.json'), 'utf8'));
  assert.ok(Object.keys(top.type).length > 500, 'categories indexed');
  for (const list of Object.values(top.type)) for (const i of list) assert.ok(top.rows[i], 'dangling row ' + i);
  for (const list of Object.values(top.kw)) for (const i of list) assert.ok(top.rows[i], 'dangling row ' + i);
  const common = ['joghurt', 'müsli', 'salami', 'spaghetti', 'schoko', 'pizza', 'chips', 'butter'].filter(w => top.kw[w]);
  assert.ok(common.length >= 4, 'common German product types present: ' + common.join(', '));
});

test('alternatives are the same kind of product and meaningfully better', async () => {
  // A mediocre fruit yoghurt: sugary, processed.
  const yog = LocalPack.toFood(['4000000000099', 'Fruchtjoghurt Erdbeere', 'X', 4, 0, 150, 150,
    105, 3.2, 15.5, 3, 0.2, 14.8, 2, 50, 4, 3, 4, 0]);
  const mine = Quality.rate(yog).score;
  const alts = await LocalPack.alternatives(yog, 4);
  assert.ok(alts.length > 0, 'a better yoghurt should exist');
  for (const a of alts) {
    assert.ok(a.rating.score >= mine + 8, `${a.food.name} (${a.rating.score}) is not clearly better than ${mine}`);
    assert.match(a.food.name.toLowerCase(), /joghurt/, 'matched by product type: ' + a.food.name);
    assert.strictEqual(a.basis, 'same kind');
  }
  assert.ok(alts.every((a, i) => i === 0 || alts[i - 1].rating.score >= a.rating.score), 'best first');
});

test('an excellent product gets no "better" suggestions', async () => {
  const skyr = LocalPack.toFood(['4000000000098', 'Skyr Natur', 'X', 4, 0, 150, 450,
    63, 11, 4, 0.2, 0, 4, 0.1, 40, 1, 0, 1, 0]);
  const alts = await LocalPack.alternatives(skyr, 4);
  assert.ok(alts.every(a => a.rating.score >= Quality.rate(skyr).score + 8));
});

test('recipes are graded by calorie-weighted ingredients', () => {
  const ing = (id, grams) => ({ refId: id, name: id, grams, n100: FoodDB.byId(id).n });
  const salad = { servings: 1, ingredients: [ing('f-spinach-raw', 150), ing('f-tomato-raw', 150), ing('f-olive-oil', 10)] };
  const drowned = { servings: 1, ingredients: [ing('f-spinach-raw', 150), ing('f-mayonnaise', 60)] };
  assert.ok(App.recipeQuality(salad).score > App.recipeQuality(drowned).score,
    'a salad drowned in mayonnaise should grade below a lightly dressed one');
});

test('synthetic vitamin E converts at 0.45 mg per IU', () => {
  assert.strictEqual(Supplements.IU_E_SYNTHETIC, 0.45);
  assert.ok(Math.abs(400 * Supplements.IU.vitE.factor - 268) < 0.01, 'natural: 400 IU = 268 mg');
  assert.ok(Math.abs(400 * Supplements.IU_E_SYNTHETIC - 180) < 0.01, 'synthetic: 400 IU = 180 mg');
});

test('pack URLs carry the build date so a refreshed pack is never shadowed by cache', async () => {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/de/index.json'), 'utf8'));
  const seen = [];
  const real = global.fetch;
  global.fetch = async url => { seen.push(String(url)); return real(url); };
  await LocalPack.lookup('4061458012171');
  global.fetch = real;
  const shardReq = seen.find(u => /data\/de\/\d+\.json/.test(u));
  assert.ok(shardReq, 'a shard was requested');
  assert.ok(shardReq.endsWith('?v=' + idx.built), 'shard URL is versioned: ' + shardReq);
  assert.ok(!seen.some(u => /index\.json\?/.test(u)), 'the index itself is never versioned');
});

test('alternatives stay within the product\'s own category (regression: Nutella -> spinach)', async () => {
  const nutella = await LocalPack.lookup('3017620422003');
  assert.ok(nutella, 'Nutella is in the pack');
  assert.ok(nutella.type >= 0, 'Nutella has a category type');
  const alts = await LocalPack.alternatives(nutella, 4);
  const types = await LocalPack.loadTypes();
  const label = LocalPack.typeLabel(types.list[nutella.type][0]);
  assert.match(label, /spread/, 'Nutella is compared with spreads, not "' + label + '"');
  for (const a of alts) {
    assert.strictEqual(a.food.type, nutella.type, `${a.food.name} is a different kind of product`);
    assert.notStrictEqual(a.food.cat, 'Vegetables');
  }
});

test('live-scanned products are classified from their category tags', async () => {
  const types = await LocalPack.loadTypes();
  const [tag] = types.list.find(([t]) => /hazelnut/.test(t)) || [];
  assert.ok(tag, 'a hazelnut spread category exists');
  const live = { name: 'Some spread', tags: ['en:spreads', tag] };
  assert.strictEqual(await LocalPack.typeOf(live), types.byTag.get(tag).i);
  assert.strictEqual(await LocalPack.typeOf({ name: 'x', tags: [] }), -1);
});

test('with no category and no matching word, nothing is suggested', async () => {
  const odd = LocalPack.toFood(['4000000000097', 'Zzzqx', 'X', 11, 0, 0, 0, 400, 1, 80, 5, 0, 60, 3, 100, 4, 5, 5, 0, -1]);
  assert.deepStrictEqual(await LocalPack.alternatives(odd, 4), []);
});

test('products are ranked within their own category, Oasis-style', async () => {
  const nutella = await LocalPack.lookup('3017620422003');
  const rk = await LocalPack.rank(nutella);
  assert.ok(rk, 'Nutella has a category ranking');
  assert.match(rk.basis, /spread/);
  assert.ok(rk.n >= 12, 'enough peers to rank against');
  assert.ok(rk.better < 50, 'Nutella should rank in the lower half of its category, got ' + rk.better);

  const top = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/de/top.json'), 'utf8'));
  const t = String(nutella.type);
  const best = LocalPack.toFood(top.rows[top.type[t][0]]);
  const brk = await LocalPack.rank(best);
  assert.ok(brk.better > rk.better, 'the category\'s best product outranks Nutella');
});

test('ranking distributions are well formed', () => {
  const top = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/de/top.json'), 'utf8'));
  assert.strictEqual(top.version, 3);
  const dists = Object.values(top.dist);
  assert.ok(dists.length > 500, 'hundreds of categories ranked');
  for (const d of dists) {
    assert.strictEqual(d.length, 22);
    assert.ok(d[0] >= 12);
    for (let i = 2; i < d.length; i++) assert.ok(d[i] >= d[i - 1], 'percentiles ascend');
  }
});
