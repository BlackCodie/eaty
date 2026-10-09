/* Build data/de/supplements.json — scannable supplements with per-dose amounts.

   The bulk search API only returns a product's core label (energy and macros),
   so vitamins and minerals per tablet need the full product record. This
   lists every dietary supplement sold in Germany, Austria or Switzerland plus
   the products of the big supplement brands on German shelves, then fetches
   each one and stores what one dose (tablet, capsule, scoop …) contains.

   Scanning such a product opens the supplement editor already filled in.

   Run:   node tools/fetch-supplements.js        (a few minutes: 100 products per request)
   Data:  Open Food Facts contributors, Open Database License (ODbL) v1.0     */
'use strict';
const fs = require('fs');
const path = require('path');
const OffMap = require('../js/offmap.js');

const OUT = path.join(__dirname, '..', 'data', 'de', 'supplements.json');
const SEARCH = 'https://search.openfoodfacts.org/search';
const BATCH = 'https://world.openfoodfacts.org/api/v2/search';   // full records, up to 100 barcodes per call
const UA = { headers: { Accept: 'application/json', 'User-Agent': 'Eaty/2.1 (personal nutrition PWA supplement builder)' } };
const FIELDS = 'code,product_name,product_name_de,brands,serving_size,serving_quantity,quantity,nutriments,categories_tags';
const GAP = 7000;                   // ms between batch calls (search endpoints allow ~10/min)

const LISTS = [
  ['supplements DE/AT/CH', 'categories_tags:"en:dietary-supplements" AND (countries_tags:"en:germany" OR countries_tags:"en:austria" OR countries_tags:"en:switzerland")'],
  ...['mivolis', 'altapharma', 'doppelherz', 'abtei', 'das-gesunde-plus', 'tetesept', 'sunday-natural', 'centrum',
    'orthomol', 'kruger', 'queisser', 'nature-love', 'gloryfeel', 'naturtreu', 'vitabay', 'pure-encapsulations',
    'nutri-plus', 'feelgood-shop', 'bjokovit', 'vitamaze', 'mykind-organics', 'lavita', 'avitale', 'zirkulin']
    .map(b => ['brand ' + b, `brands_tags:"${b}"`])
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, UA);
      if (res.status === 429 || res.status >= 500) { await sleep(30000 * (i + 1)); continue; }
      if (res.status === 404) return null;
      const text = await res.text();
      if (text.charAt(0) !== '{') { await sleep(30000 * (i + 1)); continue; }  // HTML rate-limit page
      return JSON.parse(text);
    } catch (_) { await sleep(3000 * (i + 1)); }
  }
  return null;
}

/* Dose form and per-dose amounts come from js/offmap.js, shared with the live scanner. */

(async () => {
  const codes = new Map();
  for (const [label, q] of LISTS) {
    let added = 0;
    for (let page = 1; page <= 10; page++) {
      const j = await get(`${SEARCH}?q=${encodeURIComponent(q)}&page_size=1000&page=${page}&sort_by=code&fields=code,product_name,brands`);
      const hits = (j && j.hits) || [];
      hits.forEach(h => { if (h.code && !codes.has(h.code)) { codes.set(h.code, h); added++; } });
      if (hits.length < 1000) break;
    }
    console.log(`${label.padEnd(34)} +${added}  total ${codes.size}`);
  }

  const rows = [];
  let withMicros = 0, failed = 0;
  const list = Array.from(codes.keys());
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const j = await get(`${BATCH}?code=${chunk.join(',')}&page_size=100&fields=${FIELDS}`);
    if (!j || !Array.isArray(j.products)) { failed += chunk.length; await sleep(GAP); continue; }
    for (const p of j.products) {
      const name = String(p.product_name_de || p.product_name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      const brand = String(p.brands || '').split(',')[0].trim().slice(0, 32);
      if (!p.code || (!name && !brand)) continue;
      const sd = OffMap.supplementDose(p);
      const dose = sd.per;
      if (OffMap.MICRO_KEYS.some(k => dose[k] > 0) || dose.epadha > 0) withMicros++;
      rows.push([String(p.code), name || brand, brand === name ? '' : brand, sd.unitKey,
        sd.doseLabel, Object.keys(dose).length ? dose : 0]);
    }
    console.log(`  ${Math.min(i + 100, list.length)}/${list.length} fetched · ${withMicros} with per-dose vitamins/minerals`);
    await sleep(GAP);
  }

  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  fs.writeFileSync(OUT, JSON.stringify({
    version: 1,
    built: new Date().toISOString().slice(0, 10),
    count: rows.length,
    withMicros,
    fields: ['code', 'name', 'brand', 'unitKey', 'doseLabel', 'perDose'],
    source: 'Open Food Facts',
    license: 'ODbL-1.0',
    rows
  }));
  console.log(`\nWrote ${rows.length} supplements (${withMicros} with per-dose vitamins/minerals, ${failed} not returned)`);
})().catch(e => { console.error(e); process.exit(1); });
