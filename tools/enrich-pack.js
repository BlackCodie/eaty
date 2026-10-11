/* Adds real serving sizes and declared vitamins/minerals to the most-scanned
   products in the pack.

   The bulk search API the harvester uses returns only the core label, so pack
   products have no serving size ("1 bar (45 g)") and no declared vitamins.
   This fetches the full record for the most-scanned products and writes the
   serving size and every extra declared nutrient back into the pack shards and
   the quick search index.

   It uses the batch endpoint (100 barcodes per request) when Open Food Facts
   serves it, and otherwise the product API, paced under its 100 requests per
   minute limit. Progress is cached in data/.enrich-cache.json, so an
   interrupted run picks up where it stopped.

   Run after build-names.js:   node tools/enrich-pack.js      (TOP=5000 by default)
   Data: Open Food Facts contributors, ODbL v1.0                               */
'use strict';
const fs = require('fs');
const path = require('path');
const OffMap = require('../js/offmap.js');
const { writeShards } = require('./fetch-de.js');

const DIR = path.join(__dirname, '..', 'data', 'de');
const CACHE = path.join(__dirname, '..', 'data', '.enrich-cache.json');
const HOST = 'https://world.openfoodfacts.org';
const UA = { headers: { Accept: 'application/json', 'User-Agent': 'Eaty/2.4 (personal nutrition PWA serving enrichment)' } };
const TOP = Number(process.env.TOP || 5000);
const BATCH_GAP = 7000;
const PRODUCT_GAP = 680;                     // ~88 requests a minute
const FIELDS = 'code,serving_size,serving_quantity,nutriments';
const CORE = new Set(['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satfat', 'na', 'water']);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r2 = v => Math.round(v * 100) / 100;

/** JSON from `url`, or null. `tries` bounds the backoff on 429 and 5xx. */
async function get(url, tries) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, UA);
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) { await sleep(20000 * (i + 1)); continue; }
      const text = await res.text();
      if (text.charAt(0) !== '{') { await sleep(20000 * (i + 1)); continue; }
      return JSON.parse(text);
    } catch (_) { await sleep(4000 * (i + 1)); }
  }
  return null;
}

/** { servG, extras } from a full product record. */
function facts(p) {
  const sq = Number(p.serving_quantity);
  const servG = sq > 0 && sq < 1500 ? Math.round(sq * 10) / 10 : 0;
  const { n, declared } = OffMap.nutrientsFrom(p.nutriments || {});
  const extras = {};
  declared.forEach(k => { if (!CORE.has(k) && n[k] > 0 && isFinite(n[k])) extras[k] = r2(n[k]); });
  return { servG, extras };
}

(async () => {
  const names = JSON.parse(fs.readFileSync(path.join(DIR, 'names.json'), 'utf8'));
  const codes = names.rows.slice(0, TOP).map(r => r[0]);
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (_) { /* first run */ }
  const save = () => fs.writeFileSync(CACHE, JSON.stringify(cache));
  const todo = codes.filter(c => !(c in cache));
  console.log(`${codes.length - todo.length}/${codes.length} already cached, ${todo.length} to fetch`);

  // Batch endpoint first: one probe tells whether it is being served today.
  let batch = todo.length > 0;
  for (let i = 0; batch && i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    const j = await get(`${HOST}/api/v2/search?code=${chunk.join(',')}&page_size=100&fields=${FIELDS}`, i === 0 ? 2 : 5);
    if (!j || !Array.isArray(j.products)) {
      if (i === 0) { console.log('Batch endpoint unavailable — using the product API'); batch = false; break; }
      continue;
    }
    chunk.forEach(c => { cache[c] = 0; });
    j.products.forEach(p => { cache[String(p.code)] = facts(p); });
    save();
    console.log(`  ${Math.min(i + 100, todo.length)}/${todo.length} fetched (batch)`);
    await sleep(BATCH_GAP);
  }

  if (!batch) {
    const left = todo.filter(c => !(c in cache));
    let misses = 0;
    for (let i = 0; i < left.length; i++) {
      const j = await get(`${HOST}/api/v2/product/${left[i]}?fields=${FIELDS}`, 4);
      if (j && j.product) { cache[left[i]] = facts(j.product); misses = 0; }
      else if (j) cache[left[i]] = 0;                       // answered, but no product
      else if (++misses >= 25) { console.log('Open Food Facts is not answering — stopping, run again later'); break; }
      if (i % 100 === 99 || i === left.length - 1) { save(); console.log(`  ${i + 1}/${left.length} fetched (product API)`); }
      await sleep(PRODUCT_GAP);
    }
    save();
  }

  const apply = row => {
    const e = cache[row[0]];
    if (!e || row[7] === null) return false;
    let hit = false;
    if (e.servG && !(row[5] > 0)) { row[5] = e.servG; hit = true; }
    const extra = Object.keys(e.extras || {}).filter(k => !row[23] || row[23][k] !== e.extras[k]);
    if (extra.length) { row[23] = Object.assign({}, row[23] || {}, e.extras); hit = true; }
    return hit;
  };

  // Pack shards
  const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  const all = [];
  let changed = 0;
  for (let i = 0; i < idx.shards; i++) {
    for (const row of JSON.parse(fs.readFileSync(path.join(DIR, String(i).padStart(idx.pad, '0') + '.json'), 'utf8'))) {
      if (apply(row)) changed++;
      all.push(row);
    }
  }
  if (all.length !== idx.count) { console.error('shard count mismatch — not writing'); process.exit(2); }
  // A new build date makes saved packs download the updated shards.
  if (changed) writeShards(DIR, all, { version: idx.version, fields: idx.fields });

  // Quick search index
  names.rows.forEach(apply);
  fs.writeFileSync(path.join(DIR, 'names.json'), JSON.stringify(names));
  const top = names.rows.slice(0, TOP);
  const withServ = top.filter(r => r[5] > 0).length;
  const withMicro = top.filter(r => r[23] && Object.keys(r[23]).length).length;
  console.log(`\nEnriched ${changed} pack products · top ${TOP}: ${withServ} with a serving size, ${withMicro} with declared extras`);
})().catch(e => { console.error(e); process.exit(1); });
