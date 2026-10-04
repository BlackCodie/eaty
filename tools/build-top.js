/* Builds data/de/top.json — the "better alternatives" and ranking index.

   For each Open Food Facts category in the pack it keeps the best-graded
   products, so alternatives are always the same kind of thing. As a fallback
   for products without a category, it also indexes common product-type words
   from the names (derived from frequency, so no hand-kept list goes stale).
   It also stores each category's score distribution (21 points, every 5th
   percentile), so the app can say where a product ranks among its own kind:
   "better than 82% of hazelnut spreads".
   Grades come from js/quality.js running exactly as it does in the app.

   Run after tools/fetch-de.js:   node tools/build-top.js                    */
'use strict';
const fs = require('fs');
const path = require('path');
require('./browser-env').install();

const DIR = path.join(__dirname, '..', 'data', 'de');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));

const KEYWORDS = 240;      // product-type words to index
const PER_WORD = 12;       // alternatives kept per word
const PER_TYPE = 10;       // alternatives kept per product category (type)
const MIN_SCORE = 55;      // nothing below a mid C is offered as "better"
const MIN_CONF = 55;       // needs enough label data to be judged fairly
const MIN_CONF_RANK = 40;  // ranking against peers tolerates a thinner label

// Words that describe marketing, packaging or grammar rather than what a product is.
const STOP = new Set(('mit und oder für fuer von vom der die das den dem des ein eine einer aus auf nach ' +
  'the and with for bio natur natural classic original mini light extra fein feine zart frisch sorte style ' +
  'family packung stück stueck gramm liter sorten premium deluxe select edition leicht beste wahl neu ' +
  'art typ gut vegan vegetarisch fettarm laktosefrei glutenfrei ohne zucker zuckerfrei protein high ' +
  'klassik klassisch lecker little big pack gesalzen ungesalzen natürlich mild pikant scharf').split(' '));

const tokenize = s => String(s || '').toLowerCase().split(/[^a-zäöüß]+/).filter(t => t.length >= 4 && !STOP.has(t));

/* ---- read and grade the whole pack ---- */
const graded = [];
const brandCount = new Map();
for (let i = 0; i < idx.shards; i++) {
  const rows = JSON.parse(fs.readFileSync(path.join(DIR, String(i).padStart(idx.pad, '0') + '.json'), 'utf8'));
  for (const row of rows) {
    tokenize(row[2]).forEach(t => brandCount.set(t, (brandCount.get(t) || 0) + 1));
    const food = LocalPack.toFood(row);
    const r = Quality.rate(food);
    if (!r || r.confidence < MIN_CONF_RANK || food.needsNutrition) continue;
    graded.push({ row, score: r.score, conf: r.confidence, name: row[1].toLowerCase(), type: row[19] === undefined ? -1 : row[19] });
  }
}
console.log(`graded ${graded.length} of ${idx.count} products (${graded.filter(g => g.conf >= MIN_CONF).length} fully enough to recommend)`);

/* ---- product-type words: frequent in names, not brand names ---- */
const brands = new Set([...brandCount].filter(([, n]) => n >= 20).map(([t]) => t));
const freq = new Map();
for (const g of graded) new Set(tokenize(g.name)).forEach(t => {
  if (!brands.has(t)) freq.set(t, (freq.get(t) || 0) + 1);
});
const words = [...freq].filter(([, n]) => n >= 40).sort((a, b) => b[1] - a[1]).slice(0, KEYWORDS).map(([t]) => t);

/* ---- pick the best per word and per category ---- */
const rows = [];
const rowIndex = new Map();
const ref = g => {
  if (!rowIndex.has(g.row[0])) { rowIndex.set(g.row[0], rows.length); rows.push(g.row); }
  return rowIndex.get(g.row[0]);
};
const best = (list, n) => {
  const seenName = new Set(), out = [];
  for (const g of list.sort((a, b) => (b.score - a.score) || (b.conf - a.conf))) {
    if (g.score < MIN_SCORE) break;
    if (g.conf < MIN_CONF) continue;          // only fully judged products are offered as better
    const key = g.name.replace(/\s+/g, ' ').trim();
    if (seenName.has(key)) continue;          // the same product under several barcodes
    seenName.add(key);
    out.push(ref(g));
    if (out.length >= n) break;
  }
  return out;
};

const kw = {};
for (const w of words) {
  const picks = best(graded.filter(g => g.name.includes(w)), PER_WORD);
  if (picks.length >= 2) kw[w] = picks;
}
// Primary: within the product's own Open Food Facts category.
const byType = new Map();
for (const g of graded) if (g.type >= 0) {
  if (!byType.has(g.type)) byType.set(g.type, []);
  byType.get(g.type).push(g);
}
const type = {};
for (const [t, list] of byType) {
  const picks = best(list, PER_TYPE);
  if (picks.length) type[t] = picks;
}

/* Ranking: score at every 5th percentile per category, plus how many were rated. */
const MIN_RANKED = 12;
const dist = {};
for (const [t, list] of byType) {
  if (list.length < MIN_RANKED) continue;
  const sc = list.map(g => g.score).sort((a, b) => a - b);
  const q = [];
  for (let i = 0; i <= 20; i++) q.push(sc[Math.round(i / 20 * (sc.length - 1))]);
  dist[t] = [list.length].concat(q);
}

const out = { version: 3, built: new Date().toISOString().slice(0, 10), pack: idx.built, rows, type, kw, dist };
const json = JSON.stringify(out);
fs.writeFileSync(path.join(DIR, 'top.json'), json);
console.log(`${Object.keys(type).length} categories (${Object.keys(dist).length} ranked), ${Object.keys(kw).length} name keywords, ${rows.length} products, ${(json.length / 1024).toFixed(0)} KB`);
console.log('sample types:', Object.keys(kw).slice(0, 25).join(', '));
