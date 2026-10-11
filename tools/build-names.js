/* Builds data/de/names.json — the quick search index.

   Searching the whole 546k-product pack by name needs every shard on the
   device. This file holds the most-scanned products in Germany (full pack
   records, ranked by Open Food Facts' unique scan counts), so typing "Milka"
   or "Skyr" finds the right product with no download and no signal.

   Popularity comes from the search API, walked by barcode prefix so the
   10,000-results cap never hides a popular product.

   Run after the pack is built:   node tools/build-names.js   (about 10 minutes)
   Data: Open Food Facts contributors, ODbL v1.0                               */
'use strict';
const fs = require('fs');
const path = require('path');
const OffMap = require('../js/offmap.js');

const DIR = path.join(__dirname, '..', 'data', 'de');
const BASE = 'https://search.openfoodfacts.org/search';
const UA = { headers: { Accept: 'application/json', 'User-Agent': 'Eaty/2.3 (personal nutrition PWA name index)' } };
const KEEP = Number(process.env.NAMES || 30000);
const MARKETS = ['countries_tags:"en:germany"', 'countries_tags:"en:austria" AND -countries_tags:"en:germany"'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(url, UA);
      if (res.status === 429 || res.status >= 500) { await sleep(5000 * (i + 1)); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) { if (i === 5) throw e; await sleep(2000 * (i + 1)); }
  }
}

const scans = new Map();
let requests = 0;

/** Top products of every barcode-prefix range small enough to sort reliably. */
async function walk(base, prefix) {
  prefix = prefix || '';
  const q = prefix ? `${base} AND code:${prefix}*` : base;
  const c = await get(`${BASE}?q=${encodeURIComponent(q)}&page_size=1&fields=code`); requests++;
  if (!c || !c.count) return;
  if (c.is_count_exact || prefix.length >= 8) {
    const j = await get(`${BASE}?q=${encodeURIComponent(q)}&page_size=1000&page=1&sort_by=-unique_scans_n&fields=code,unique_scans_n`); requests++;
    for (const h of (j && j.hits) || []) {
      const n = Number(h.unique_scans_n) || 0;
      if (n > 0 && n > (scans.get(h.code) || 0)) scans.set(String(h.code), n);
    }
    process.stdout.write(`\r  ${scans.size} ranked · ${requests} requests   `);
    await sleep(150);
    return;
  }
  for (let d = 0; d <= 9; d++) await walk(base, prefix + d);
}

(async () => {
  console.log('Ranking products by scans…');
  for (const m of MARKETS) await walk(m);
  console.log('');

  const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  const rows = [];
  for (let i = 0; i < idx.shards; i++) {
    for (const r of JSON.parse(fs.readFileSync(path.join(DIR, String(i).padStart(idx.pad, '0') + '.json'), 'utf8'))) {
      if (r[7] === null || !r[1]) continue;                       // only products you can log
      const n = scans.get(r[0]);
      if (n) rows.push([n, r]);
    }
  }
  rows.sort((a, b) => b[0] - a[0]);
  const top = rows.slice(0, KEEP).map(x => x[1]);
  const json = JSON.stringify({
    version: 1, built: new Date().toISOString().slice(0, 10), pack: idx.built,
    count: top.length, fields: idx.fields, source: 'Open Food Facts', license: 'ODbL-1.0', rows: top
  });
  fs.writeFileSync(path.join(DIR, 'names.json'), json);
  const gz = require('zlib').gzipSync(json).length;
  console.log(`Wrote ${top.length} products (of ${rows.length} ranked in the pack), ${(json.length / 1048576).toFixed(1)} MB raw, ${(gz / 1048576).toFixed(2)} MB gzipped`);
})().catch(e => { console.error(e); process.exit(1); });
