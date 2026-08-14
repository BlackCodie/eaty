/* Build the offline German product pack from Open Food Facts.
   Data: Open Food Facts, Open Database License (ODbL) v1.0 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data', 'de');
const BASE = 'https://search.openfoodfacts.org/search';
const FIELDS = 'code,product_name,brands,quantity,serving_size,serving_quantity,nutriments,' +
  'categories_tags,nova_group,additives_n,nutriscore_grade,ingredients_analysis_tags';
const PAGE = 1000;
const MAX_PAGES = 10;               // Elasticsearch caps from+size at 10k
const SHARDS = 96;

// German retailer own-brands + the national brands that fill German trolleys
const BRANDS = [
  // Rewe group
  'ja', 'rewe', 'rewe-bio', 'rewe-beste-wahl', 'penny', 'penny-ready',
  // Edeka group
  'edeka', 'edeka-bio', 'gut-gunstig', 'elkos', 'netto',
  // Schwarz group
  'k-classic', 'kaufland', 'k-bio', 'k-take-it-veggie', 'lidl', 'milbona',
  'combino', 'crownfield', 'freeway', 'dulano', 'pilos', 'vemondo', 'chef-select',
  // Aldi
  'aldi', 'milsani', 'gut-bio', 'aldi-sud', 'aldi-nord', 'bon-appetit', 'sweet-valley',
  'trader-joe-s', 'all-seasons', 'mamia',
  // Drugstores / bio
  'dm', 'dm-bio', 'alnatura', 'rossmann', 'enerbio', 'rapunzel', 'bio-zentrale',
  'norma', 'globus', 'tegut', 'real',
  // National food brands
  'dr-oetker', 'ritter-sport', 'haribo', 'milka', 'ferrero', 'bahlsen', 'knorr',
  'maggi', 'iglo', 'frosta', 'muller', 'ehrmann', 'zott', 'danone', 'hochland',
  'kerrygold', 'landliebe', 'weihenstephan', 'rugenwalder-muhle', 'wiesenhof',
  'kolln', 'seitenbacher', 'schar', 'barilla', 'alpro', 'oatly', 'nestle',
  'kellogg-s', 'lorenz', 'funny-frisch', 'chio', 'wasa', 'harry', 'golden-toast',
  'meica', 'homann', 'thomy', 'hengstenberg', 'kuhne', 'develey', 'bautz-ner',
  'gerolsteiner', 'volvic', 'adelholzener', 'apollinaris', 'fritz-kola',
  'paulaner', 'krombacher', 'beck-s', 'warsteiner', 'jever', 'veltins',
  'nutella', 'lindt', 'storck', 'katjes', 'trolli', 'bifi', 'exquisa', 'almighurt'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 429 || res.status === 503) { await sleep(2000 * (i + 1)); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1200 * (i + 1));
    }
  }
}

/* --------------------------------------------------------------- mapping */
const CATS = ['Vegetables','Fruit','Meat & Poultry','Fish & Seafood','Dairy & Eggs',
  'Grains & Bread','Legumes & Soy','Nuts & Seeds','Fats & Oils','Condiments',
  'Drinks','Snacks & Sweets','Supplements'];
/* Open Food Facts has broad umbrella tags — notably
   "en:plant-based-foods-and-beverages" — that sit on almost everything edible.
   Matching them turns chocolate spread into a drink, so they are dropped before
   any rule runs, and specific categories are tested before generic ones. */
const UMBRELLA = /^en:(plant-based-foods-and-beverages|plant-based-foods|foods|groceries|farming-products)$/;

const CAT_RULES = [
  [/yogurt|yoghurt|cheese|milk|dairy|cream|butter|quark|skyr|egg|joghurt|kase/, 4],
  [/meat|poultry|chicken|beef|pork|sausage|ham|salami|charcuterie|wurst|fleisch/, 2],
  [/seafood|fish|salmon|tuna|shrimp|prawn|fisch/, 3],
  [/snack|sweet|chocolate|candy|biscuit|cake|dessert|ice-cream|chips|crisps|confectioner|schokolade|spread/, 11],
  [/bread|cereal|pasta|rice|flour|grain|noodle|baker|muesli|granola|oat|brot/, 5],
  [/legume|bean|lentil|chickpea|tofu|soy|tempeh|hummus/, 6],
  [/\bnut|seed|almond|peanut|cashew|walnut/, 7],
  [/\boils?\b|fats\b|mayonnaise|margarine/, 8],
  [/sauce|condiment|spice|vinegar|mustard|ketchup|dressing/, 9],
  [/vegetable|salad|potato|tomato|carrot|gemuse/, 0],
  [/fruit|berr|apple|banana|orange|obst/, 1],
  [/supplement|protein-powder|sports-nutrition/, 12],
  // Drinks last, and only on tags that really mean a drink.
  [/beverages|waters\b|juices|sodas|coffee|teas\b|beers\b|wines\b|smoothie|cola|drinks\b/, 10]
];

function cleanTags(tags) {
  return (tags || []).filter(t => !UMBRELLA.test(t)).join(' ').toLowerCase();
}
function catIndex(tags) {
  const s = cleanTags(tags);
  for (const [re, i] of CAT_RULES) if (re.test(s)) return i;
  return 11;
}

const num = v => {
  if (v === undefined || v === null || v === '') return null;
  const x = Number(v);
  return isFinite(x) ? x : null;
};
const r2 = v => v === null ? 0 : Math.round(v * 100) / 100;

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
  const m = multi || single;
  if (!m) return 0;
  let v = Number((multi ? multi[2] : single[1]).replace(',', '.'));
  const unit = (multi ? multi[3] : single[2]).toLowerCase();
  if (unit === 'kg' || unit === 'l') v *= 1000;
  if (multi) v *= Number(multi[1]) || 1;
  return v > 0 && v <= 10000 ? Math.round(v * 10) / 10 : 0;
}

const GRADE = { a: 1, b: 2, c: 3, d: 4, e: 5 };

/* Compact record (v2):
   [code, name, brand, cat, unitFlag, servG, pkgG, kcal, prot, carb, fat, fib, sug, sat, na_mg,
    nova, additivesN, nutriscore, flags]
   nova       1–4 NOVA processing group, 0 unknown
   nutriscore 1–5 for A–E, 0 unknown
   flags      bit 1 = palm oil free, bit 2 = vegan, bit 4 = vegetarian          */
function pack(p) {
  const code = String(p.code || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return null;

  let name = String(p.product_name || '').trim().replace(/\s+/g, ' ');
  const brand = String(p.brands || '').split(',')[0].trim().replace(/\s+/g, ' ').slice(0, 28);
  if (!name && !brand) return null;
  if (!name) name = brand;
  name = name.slice(0, 58);

  const nu = p.nutriments || {};
  let kcal = num(nu['energy-kcal_100g']);
  if (kcal === null) {
    const kj = num(nu['energy-kj_100g']);
    if (kj !== null) kcal = kj / 4.184;
  }
  const prot = num(nu.proteins_100g), carb = num(nu.carbohydrates_100g), fat = num(nu.fat_100g);
  if (kcal === null && prot === null && carb === null && fat === null) return null;   // unusable
  if (kcal === null) kcal = (prot || 0) * 4 + (carb || 0) * 4 + (fat || 0) * 9;
  if (kcal > 950) return null;                                                        // bad data

  let na = num(nu.sodium_100g);
  if (na === null) { const salt = num(nu.salt_100g); if (salt !== null) na = salt / 2.5; }

  // A product is liquid if its own pack size is in ml/l, or it is tagged as a
  // genuine drink — not merely as "plant-based-foods-and-beverages".
  const sizes = String(p.quantity || '') + ' ' + String(p.serving_size || '');
  const isLiquid = /\b\d+([.,]\d+)?\s*(ml|cl|l|liter|litre)\b/i.test(sizes) ||
    /beverages|waters\b|juices|sodas|drinks\b/.test(cleanTags(p.categories_tags));

  const ia = (p.ingredients_analysis_tags || []).join(' ');
  let flags = 0;
  if (ia.includes('en:palm-oil-free')) flags |= 1;
  if (ia.includes('en:vegan') && !ia.includes('en:non-vegan')) flags |= 2;
  if (ia.includes('en:vegetarian') && !ia.includes('en:non-vegetarian')) flags |= 4;

  const nova = Number(p.nova_group) || 0;
  const addN = Number(p.additives_n);

  return [
    code, name, brand === name ? '' : brand, catIndex(p.categories_tags), isLiquid ? 1 : 0,
    servingGrams(p), packageGrams(p),
    r2(kcal), r2(prot), r2(carb), r2(fat),
    r2(num(nu.fiber_100g)), r2(num(nu.sugars_100g)), r2(num(nu['saturated-fat_100g'])),
    na === null ? 0 : Math.round(na * 1000),
    nova >= 1 && nova <= 4 ? nova : 0,
    isFinite(addN) && addN >= 0 ? Math.min(addN, 40) : -1,
    GRADE[String(p.nutriscore_grade || '').toLowerCase()] || 0,
    flags
  ];
}

/* ------------------------------------------------------------- fetching */
const seen = new Map();
let requests = 0;

async function harvest(label, q) {
  let added = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}?q=${encodeURIComponent(q)}&page_size=${PAGE}&page=${page}` +
                `&sort_by=-unique_scans_n&fields=${FIELDS}`;
    let j;
    try { j = await get(url); requests++; }
    catch (e) { console.log(`  ! ${label} p${page}: ${e.message}`); break; }
    const hits = (j && j.hits) || [];
    if (!hits.length) break;
    for (const h of hits) {
      const rec = pack(h);
      if (rec && !seen.has(rec[0])) { seen.set(rec[0], rec); added++; }
    }
    if (hits.length < PAGE) break;
    await sleep(220);
  }
  console.log(`${label.padEnd(24)} +${String(added).padStart(5)}   total ${seen.size}`);
}

(async () => {
  console.log('Harvesting German products from Open Food Facts…\n');

  // 1. the most-scanned German products overall
  await harvest('popular:germany', 'countries_tags:"en:germany"');
  // 2. broad German-language sweep catches products not country-tagged
  await harvest('lang:de', 'lang:de');
  // 3. retailer own-brands and national brands
  for (const b of BRANDS) {
    await harvest('brand:' + b, `brands_tags:"${b}"`);
  }

  const all = Array.from(seen.values());
  console.log(`\nUnique products: ${all.length} (from ${requests} requests)`);

  // shard by a stable hash of the barcode
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

  const shards = Array.from({ length: SHARDS }, () => []);
  for (const rec of all) {
    let h = 0;
    for (let i = 0; i < rec[0].length; i++) h = (h * 31 + rec[0].charCodeAt(i)) >>> 0;
    shards[h % SHARDS].push(rec);
  }

  let bytes = 0;
  shards.forEach((rows, i) => {
    rows.sort((a, b) => a[0] < b[0] ? -1 : 1);
    const file = path.join(OUT, String(i).padStart(3, '0') + '.json');
    const json = JSON.stringify(rows);
    fs.writeFileSync(file, json);
    bytes += json.length;
  });

  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
    version: 2,
    built: new Date().toISOString().slice(0, 10),
    shards: SHARDS,
    pad: 3,
    count: all.length,
    source: 'Open Food Facts',
    license: 'ODbL-1.0',
    fields: ['code','name','brand','cat','liquid','servG','pkgG','kcal','protein','carbs','fat','fiber','sugar','satfat','na_mg','nova','additives','nutriscore','flags']
  }, null, 2));

  console.log(`Wrote ${SHARDS} shards, ${(bytes / 1024 / 1024).toFixed(2)} MB raw`);
  console.log(`Average shard: ${(bytes / SHARDS / 1024).toFixed(0)} KB`);
})();
