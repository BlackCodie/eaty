/* Build the offline German product pack from Open Food Facts.

   Walks every product Open Food Facts lists for the German market — sold in
   Germany, sold in Austria, or labelled in German — by splitting the search
   into barcode-prefix ranges small enough to page through completely (the
   search API stops at 10,000 results per query). German retailers' house
   brands are added from neighbouring EU countries, where the same EANs are
   sold. Products without a nutrition table are kept as name-only records, so
   a scan still recognises them. Written as hash-addressed shards in data/de/.

   All interpretation (categories, liquids, nutrient units, ingredient flags,
   allergens, additives) comes from js/offmap.js, the same module the app uses
   for live barcode lookups — so a product reads identically online and off.

   Run:   node tools/fetch-de.js   then   node tools/build-top.js
   Data:  Open Food Facts contributors, Open Database License (ODbL) v1.0     */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const OffMap = require('../js/offmap.js');

const OUT = path.join(__dirname, '..', 'data', 'de');
const BASE = 'https://search.openfoodfacts.org/search';
const FIELDS = [
  'code', 'product_name', 'product_name_de', 'brands', 'quantity', 'serving_size', 'serving_quantity',
  'nutriments', 'categories_tags', 'nova_group', 'additives_n', 'additives_tags', 'nutriscore_grade',
  'ingredients_analysis_tags', 'ingredients_tags', 'ingredients_n', 'allergens_tags'
].join(',');
const PAGE = 1000;
const MAX_PAGES = 10;               // Elasticsearch caps from+size at 10k
const SHARDS = 128;
const PACK_VERSION = 5;
const MIN_PRODUCTS = 150000;        // a run that finds fewer than this is broken

/* German retailers' own brands. Their products share EANs across the EU, so
   ones only tagged in a neighbouring country are still on German shelves.
   (National brands need no list: the market walk below covers them.) */
const BRANDS = [
  // Rewe group
  'ja', 'rewe', 'rewe-bio', 'rewe-beste-wahl', 'rewe-feine-welt', 'rewe-regional', 'rewe-to-go',
  'wilhelm-brandenburg', 'penny', 'penny-ready', 'butchers',
  // Edeka group
  'edeka', 'edeka-bio', 'edeka-herzstucke', 'edeka-zuhause', 'gut-gunstig', 'elkos', 'netto', 'gutes-land',
  // Schwarz group (Lidl, Kaufland)
  'k-classic', 'kaufland', 'k-bio', 'k-take-it-veggie', 'k-purland', 'k-favourites', 'k-to-go', 'k-free',
  'lidl', 'milbona', 'combino', 'crownfield', 'freeway', 'dulano', 'pilos', 'vemondo', 'chef-select',
  'solevita', 'gartenkrone', 'golden-seafood', 'mcennedy', 'sondey', 'snack-day', 'fin-carre', 'kania',
  'freshona', 'baresa', 'harvest-basket', 'tower-gate', 'perlenbacher', 'lord-nelson', 'pikok',
  'gelatelli', 'trattoria-alfredo', 'deluxe', 'vitasia', 'italiamo', 'sol-mar', 'eridanous', 'bellarom',
  // Aldi
  'aldi', 'milsani', 'gut-bio', 'aldi-sud', 'aldi-nord', 'bon-appetit', 'sweet-valley',
  'all-seasons', 'mamia', 'moser-roth', 'choceur', 'rio-d-oro', 'lyttos', 'hofburger', 'milfina',
  'golden-bridge', 'gourmet', 'meine-metzgerei', 'speisezeit', 'knusperone', 'sun-snacks',
  'cucina-nobile', 'wonnemeyer', 'asia-green-garden', 'mucci', 'river',
  // Drugstores, bio, other chains
  'dm', 'dm-bio', 'dmbio', 'alnatura', 'rossmann', 'enerbio', 'rapunzel', 'bio-zentrale', 'norma',
  'globus', 'tegut', 'real', 'denree', 'demeter', 'veganz', 'vegini', 'like-meat', 'garden-gourmet'
];

/* The German market, and neighbouring countries for retailer house brands. */
const MARKETS = [
  ['germany', 'countries_tags:"en:germany"'],
  ['austria', 'countries_tags:"en:austria" AND -countries_tags:"en:germany"'],
  ['german-label', 'lang:de AND -countries_tags:"en:germany" AND -countries_tags:"en:austria"']
];
const NEIGHBOURS = '(' + ['germany', 'austria', 'switzerland', 'netherlands', 'belgium', 'luxembourg', 'france',
  'poland', 'czech-republic', 'denmark', 'italy', 'spain'].map(c => `countries_tags:"en:${c}"`).join(' OR ') + ')';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Eaty/2.0 (personal nutrition PWA pack builder)' } });
      if (res.status === 429 || res.status >= 500) { await sleep(2500 * (i + 1)); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error('gave up after retries');
}

/* --------------------------------------------------------------- mapping */
const num = v => {
  if (v === undefined || v === null || v === '') return null;
  const x = Number(v);
  return isFinite(x) ? x : null;
};
const r2 = v => v === null || v === undefined ? 0 : Math.round(v * 100) / 100;
const GRADE = { a: 1, b: 2, c: 3, d: 4, e: 5 };

function servingGrams(p) {
  const q = num(p.serving_quantity);
  if (q && q > 0 && q < 5000) return Math.round(q * 10) / 10;
  const m = String(p.serving_size || '').match(/([\d.,]+)\s*(g|ml)\b/i);
  if (m) {
    const v = Number(m[1].replace(',', '.'));
    if (v > 0 && v < 5000) return Math.round(v * 10) / 10;
  }
  return 0;
}
function packageGrams(p) {
  const q = String(p.quantity || '');
  const multi = q.match(/(\d+)\s*[x×]\s*([\d.,]+)\s*(g|ml|kg|l)\b/i);
  const single = q.match(/([\d.,]+)\s*(g|ml|kg|l)\b/i);
  if (!multi && !single) return 0;
  let v = Number((multi ? multi[2] : single[1]).replace(',', '.'));
  const unit = (multi ? multi[3] : single[2]).toLowerCase();
  if (unit === 'kg' || unit === 'l') v *= 1000;
  if (multi) v *= Number(multi[1]) || 1;
  return v > 0 && v <= 10000 ? Math.round(v * 10) / 10 : 0;
}

/* Compact record (v4) — see FIELDS_OUT for names. Indices:
    0 code      1 name      2 brand     3 cat       4 liquid    5 servG     6 pkgG
    7 kcal      8 protein   9 carbs    10 fat      11 fiber    12 sugar    13 satfat
   14 na_mg    15 nova     16 additivesN (-1 unknown)          17 nutriscore 1–5 (0 unknown)
   18 flags    (OffMap.FLAG bitmask)   19 type (index into types.json, -1 unknown)
   20 additives  "330.322i.471"        21 allergens (OffMap.ALLERGENS bitmask)
   22 ingredientsN (0 unknown)
   23 extras   0, or { key: value } of anything else the label declares in app units
               (caffeine mg, alcohol g, transfat g, omega3 g, iodine µg, vitamins, minerals) */
const FIELDS_OUT = ['code', 'name', 'brand', 'cat', 'liquid', 'servG', 'pkgG', 'kcal', 'protein', 'carbs',
  'fat', 'fiber', 'sugar', 'satfat', 'na_mg', 'nova', 'additives_n', 'nutriscore', 'flags', 'type',
  'additives', 'allergens', 'ingredients_n', 'extras'];
const CORE = new Set(['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satfat', 'na']);

function pack(p) {
  const code = String(p.code || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return null;

  let name = String(p.product_name_de || p.product_name || '').trim().replace(/\s+/g, ' ');
  const brand = String(p.brands || '').split(',')[0].trim().replace(/\s+/g, ' ').slice(0, 28);
  if (!name && !brand) return null;
  if (!name) name = brand;
  name = name.slice(0, 64);

  const { n, declared } = OffMap.nutrientsFrom(p.nutriments);
  // No nutrition table: keep the product as a name-only record (nutrients null),
  // so scanning it still names it and shows its ingredients and additives.
  const nameOnly = n.kcal === undefined && n.protein === undefined && n.carbs === undefined && n.fat === undefined;
  if (!nameOnly) {
    if (n.kcal === undefined) n.kcal = (n.protein || 0) * 4 + (n.carbs || 0) * 4 + (n.fat || 0) * 9;
    if (!(n.kcal >= 0 && n.kcal <= 950)) return null;          // impossible label
  }
  const nv = v => nameOnly ? null : r2(v);

  const extras = {};
  declared.forEach(k => { if (!CORE.has(k) && k !== 'water' && n[k] > 0) extras[k] = r2(n[k]); });

  const nova = Number(p.nova_group) || 0;
  const addN = Number(p.additives_n);
  return [
    code, name, brand === name ? '' : brand, OffMap.catIndex(p.categories_tags), OffMap.isLiquid(p) ? 1 : 0,
    servingGrams(p), packageGrams(p),
    nv(n.kcal), nv(n.protein), nv(n.carbs), nv(n.fat), nv(n.fiber), nv(n.sugar), nv(n.satfat),
    nameOnly ? null : n.na === undefined ? 0 : Math.round(n.na),
    nova >= 1 && nova <= 4 ? nova : 0,
    isFinite(addN) && addN >= 0 ? Math.min(addN, 40) : -1,
    GRADE[String(p.nutriscore_grade || '').toLowerCase()] || 0,
    OffMap.ingredientFlags(p),
    -1,                                                         // type, filled after the harvest
    OffMap.additiveCodes(p).join('.'),
    OffMap.allergenMask(p),
    Math.min(Number(p.ingredients_n) || 0, 255),
    Object.keys(extras).length ? extras : 0
  ];
}

/** Shard by OffMap.shardOf (the app looks barcodes up with the same function). */
function writeShards(dir, all, meta) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^\d+\.json$/.test(f)) fs.unlinkSync(path.join(dir, f));
  const shards = Array.from({ length: SHARDS }, () => []);
  for (const rec of all) shards[OffMap.shardOf(rec[0], SHARDS)].push(rec);
  let bytes = 0, max = 0, gz = 0;
  shards.forEach((rows, i) => {
    rows.sort((a, b) => a[0] < b[0] ? -1 : 1);
    const json = JSON.stringify(rows);
    fs.writeFileSync(path.join(dir, String(i).padStart(3, '0') + '.json'), json);
    bytes += json.length; max = Math.max(max, json.length);
    gz += zlib.gzipSync(json).length;            // what "save offline" transfers
  });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({
    version: meta.version,
    built: meta.built || new Date().toISOString().slice(0, 10),
    hash: 'fnv1a-fmix32',
    shards: SHARDS,
    pad: 3,
    count: all.length,
    labelled: all.filter(r => r[7] !== null).length,
    gzBytes: gz,
    source: 'Open Food Facts',
    license: 'ODbL-1.0',
    fields: meta.fields
  }, null, 2));
  console.log(`Wrote ${SHARDS} shards, ${(bytes / 1048576).toFixed(2)} MB raw, avg ${(bytes / SHARDS / 1024).toFixed(0)} KB, max ${(max / 1024).toFixed(0)} KB`);
}

/* ------------------------------------------------------------- fetching */
const seen = new Map();
const tagsOf = new Map();            // code -> specific category tags, for the type field
const specificTags = p => (p.categories_tags || []).filter(t => !OffMap.UMBRELLA.test(t));
let requests = 0, failures = 0;

/** Exact result count for a query, or { n: 10000, exact: false } past the cap. */
async function count(q) {
  const j = await get(`${BASE}?q=${encodeURIComponent(q)}&page_size=1&fields=code`);
  requests++;
  return { n: j.count || 0, exact: !!j.is_count_exact };
}

/**
 * Every product matching `base`: split by barcode prefix until each range
 * holds fewer than 10,000 results, then page through each range by barcode.
 */
async function harvestAll(label, base, prefix) {
  prefix = prefix || '';
  const q = prefix ? `${base} AND code:${prefix}*` : base;
  const c = await count(q);
  if (!c.n) return;
  if (c.exact || prefix.length >= 8) {
    await harvest(label + (prefix ? ' ' + prefix + '*' : ''), q, 'code');
    return;
  }
  for (let dgt = 0; dgt <= 9; dgt++) await harvestAll(label, base, prefix + dgt);
}

async function harvest(label, q, sort) {
  let added = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}?q=${encodeURIComponent(q)}&page_size=${PAGE}&page=${page}` +
                `&sort_by=${sort || '-unique_scans_n'}&fields=${FIELDS}`;
    let j;
    try { j = await get(url); requests++; }
    catch (e) { failures++; console.log(`  ! ${label} p${page}: ${e.message}`); break; }
    const hits = (j && j.hits) || [];
    if (!hits.length) break;
    for (const h of hits) {
      const rec = pack(h);
      if (rec && !seen.has(rec[0])) { seen.set(rec[0], rec); tagsOf.set(rec[0], specificTags(h)); added++; }
    }
    if (hits.length < PAGE) break;
    await sleep(250);
  }
  console.log(`${label.padEnd(30)} +${String(added).padStart(5)}   total ${seen.size}`);
}

if (require.main !== module) { module.exports = { writeShards, SHARDS }; return; }
(async () => {
  console.log('Harvesting the German market from Open Food Facts…\n');
  for (const [label, q] of MARKETS) await harvestAll(label, q);
  for (const b of BRANDS) await harvest('brand:' + b, `brands_tags:"${b}" AND ${NEIGHBOURS}`);

  const all = Array.from(seen.values());
  const labelled = all.filter(r => r[7] !== null).length;
  console.log(`\nUnique products: ${all.length} (${labelled} with a nutrition table) from ${requests} requests (${failures} failed)`);

  // A broken run must never replace a good pack.
  if (all.length < MIN_PRODUCTS || failures > 20) {
    console.error(`Only ${all.length} products — refusing to overwrite the existing pack.`);
    process.exit(2);
  }

  /* Product type = the most specific Open Food Facts category that still has
     enough peers to compare against. It is what "better alternatives" compares
     within: Nutella against other hazelnut spreads, not against spinach. */
  const MIN_PEERS = 12;
  const tagFreq = new Map();
  for (const tags of tagsOf.values()) for (const t of tags) tagFreq.set(t, (tagFreq.get(t) || 0) + 1);
  const typeIdx = new Map(), types = [];
  for (const rec of all) {
    let best = null, bestN = Infinity;
    for (const t of tagsOf.get(rec[0]) || []) {
      const n = tagFreq.get(t);
      if (n >= MIN_PEERS && n < bestN) { best = t; bestN = n; }
    }
    if (best) {
      if (!typeIdx.has(best)) { typeIdx.set(best, types.length); types.push(best); }
      rec[19] = typeIdx.get(best);
    }
  }
  const typed = all.filter(r => r[19] >= 0).length;
  console.log(`types: ${types.length} categories, ${typed} of ${all.length} products typed`);

  fs.writeFileSync(path.join(OUT, 'types.json'), JSON.stringify(types.map(t => [t, tagFreq.get(t)])));
  writeShards(OUT, all, { version: PACK_VERSION, fields: FIELDS_OUT });
})().catch(e => { console.error(e); process.exit(1); });
