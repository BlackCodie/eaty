/* ==========================================================================
   offapi.js — Open Food Facts client

   Open Food Facts is a free, open product database with very strong German
   coverage (Rewe, Aldi, Lidl, Edeka, dm …). No API key, no account, no cost.

   Only the barcode or the search term is sent — never your diary, profile or
   any other stored data. Every product that comes back is written into the
   local food store, so once scanned it works offline forever after.

   Nutriment values in the `*_100g` fields are always expressed in GRAMS
   (sodium_100g: 0.0428 means 42.8 mg), so everything is scaled from there.
   ========================================================================== */
(function () {
  'use strict';

  const HOST = 'https://world.openfoodfacts.org';
  const TIMEOUT = 12000;

  const FIELDS = [
    'code', 'product_name', 'product_name_de', 'product_name_en',
    'generic_name', 'generic_name_de', 'abbreviated_product_name',
    'brands', 'quantity', 'serving_size', 'serving_quantity',
    'categories_tags', 'image_front_small_url', 'nutriments', 'nutrition_data_per',
    // quality inputs
    'nova_group', 'additives_n', 'nutriscore_grade', 'ingredients_analysis_tags'
  ].join(',');

  /* our key : [ candidate OFF keys, multiplier from grams ] */
  const MAP = {
    protein: [['proteins'], 1],
    carbs:   [['carbohydrates'], 1],
    fat:     [['fat'], 1],
    fiber:   [['fiber'], 1],
    sugar:   [['sugars'], 1],
    satfat:  [['saturated-fat'], 1],
    water:   [['water'], 1],
    chol:    [['cholesterol'], 1000],
    na:      [['sodium'], 1000],
    ca:      [['calcium'], 1000],
    fe:      [['iron'], 1000],
    mg:      [['magnesium'], 1000],
    k:       [['potassium'], 1000],
    zn:      [['zinc'], 1000],
    p:       [['phosphorus'], 1000],
    se:      [['selenium'], 1e6],
    vitA:    [['vitamin-a'], 1e6],
    b1:      [['vitamin-b1', 'thiamin'], 1000],
    b2:      [['vitamin-b2', 'riboflavin'], 1000],
    b3:      [['vitamin-pp', 'niacin'], 1000],
    b5:      [['pantothenic-acid'], 1000],
    b6:      [['vitamin-b6'], 1000],
    b9:      [['vitamin-b9', 'folates'], 1e6],
    b12:     [['vitamin-b12'], 1e6],
    vitC:    [['vitamin-c'], 1000],
    vitD:    [['vitamin-d'], 1e6],
    vitE:    [['vitamin-e'], 1000],
    vitK:    [['vitamin-k'], 1e6]
  };

  /* OFF category tag fragment -> our shopping/browse category */
  const CATS = [
    [/beverage|drink|water|juice|soda|coffee|tea|beer|wine|smoothie/, 'Drinks'],
    [/yogurt|yoghurt|cheese|milk|dairy|cream|butter|quark|skyr|egg/, 'Dairy & Eggs'],
    [/meat|poultry|chicken|beef|pork|sausage|ham|salami|charcuterie|wurst/, 'Meat & Poultry'],
    [/seafood|fish|salmon|tuna|shrimp|prawn/, 'Fish & Seafood'],
    [/bread|cereal|pasta|rice|flour|grain|noodle|baker|muesli|granola|oat/, 'Grains & Bread'],
    [/legume|bean|lentil|chickpea|tofu|soy|tempeh|hummus/, 'Legumes & Soy'],
    [/nut|seed|almond|peanut|cashew|walnut/, 'Nuts & Seeds'],
    [/oil|fat|mayonnaise|margarine/, 'Fats & Oils'],
    [/vegetable|salad|potato|tomato|carrot/, 'Vegetables'],
    [/fruit|berr|apple|banana|orange/, 'Fruit'],
    [/sauce|condiment|spice|vinegar|mustard|ketchup|dressing/, 'Condiments'],
    [/supplement|protein-powder|sports-nutrition/, 'Supplements'],
    [/snack|sweet|chocolate|candy|biscuit|cake|dessert|ice-cream|chips|crisps/, 'Snacks & Sweets']
  ];

  function pickCategory(tags) {
    const joined = (tags || []).join(' ').toLowerCase();
    for (const [re, cat] of CATS) if (re.test(joined)) return cat;
    return 'Snacks & Sweets';
  }

  /* ------------------------------------------------------------- fetch */
  async function once(url) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const e = new Error('offline'); e.code = 'offline'; throw e;
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    let res;
    try {
      res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    } catch (err) {
      // A failed fetch is not proof of being offline — Open Food Facts throttles
      // bursts by dropping the connection, which looks identical here.
      let code;
      if (err.name === 'AbortError') code = 'timeout';
      else if (typeof navigator !== 'undefined' && navigator.onLine === false) code = 'offline';
      else code = 'unreachable';
      throw Object.assign(new Error(code), { code });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) { const e = new Error('not-found'); e.code = 'not-found'; throw e; }
    if (!res.ok) {
      const e = new Error('server ' + res.status);
      e.code = 'server'; e.status = res.status;
      throw e;
    }
    return res.json();
  }

  /** Open Food Facts throttles hard and answers 503 under load — back off once. */
  async function get(url, retries) {
    const max = retries === undefined ? 2 : retries;
    let lastErr;
    for (let i = 0; i <= max; i++) {
      try {
        return await once(url);
      } catch (err) {
        lastErr = err;
        const retryable = err.code === 'server' || err.code === 'timeout' || err.code === 'unreachable';
        if (!retryable || i === max) throw err;
        await new Promise(r => setTimeout(r, 700 * (i + 1)));
      }
    }
    throw lastErr;
  }

  /* ---------------------------------------------------------- mapping */
  function nutrientsFrom(nutriments) {
    const n = Nutrition.empty();
    const declared = [];
    const raw = nutriments || {};

    // Energy: prefer the declared kcal, otherwise convert from kJ.
    let kcal = num(raw['energy-kcal_100g']);
    if (kcal === null) {
      const kj = num(raw['energy-kj_100g']) ?? num(raw['energy_100g']);
      if (kj !== null) kcal = kj / 4.184;
    }
    if (kcal !== null) { n.kcal = kcal; declared.push('kcal'); }

    Object.keys(MAP).forEach(key => {
      const [candidates, factor] = MAP[key];
      for (const c of candidates) {
        const v = num(raw[c + '_100g']);
        if (v !== null) { n[key] = v * factor; declared.push(key); return; }
      }
    });

    // Sodium is often only given as salt on European labels.
    if (!declared.includes('na')) {
      const salt = num(raw['salt_100g']);
      if (salt !== null) { n.na = salt / 2.5 * 1000; declared.push('na'); }
    }
    // Fall back to macro-derived energy if the label omitted it.
    if (!n.kcal) n.kcal = Nutrition.kcalFromMacros(n);

    return { n, declared };
  }

  function num(v) {
    if (v === undefined || v === null || v === '') return null;
    const x = Number(v);
    return isFinite(x) ? x : null;
  }

  /** Pull a gram weight out of strings like "1 piece (29 g)" or "30g". */
  function parseServingGrams(p) {
    const q = num(p.serving_quantity);
    if (q && q > 0 && q < 5000) return q;
    const s = String(p.serving_size || '');
    const m = s.match(/([\d.,]+)\s*(g|ml)\b/i);
    if (m) {
      const v = Number(m[1].replace(',', '.'));
      if (v > 0 && v < 5000) return v;
    }
    return null;
  }

  function parsePackageGrams(p) {
    const q = String(p.quantity || '');
    // Multi-packs: "2 x 28,5 g", "4 × 125 ml"
    let count = 1;
    const multi = q.match(/(\d+)\s*[x×]\s*([\d.,]+)\s*(g|ml|kg|l)\b/i);
    const single = q.match(/([\d.,]+)\s*(g|ml|kg|l)\b/i);
    const m = multi || single;
    if (!m) return null;
    if (multi) count = Number(multi[1]) || 1;

    let v = Number((multi ? multi[2] : single[1]).replace(',', '.'));
    const unit = (multi ? multi[3] : single[2]).toLowerCase();
    if (unit === 'kg' || unit === 'l') v *= 1000;
    v *= count;
    return v > 0 && v <= 10000 ? v : null;
  }

  function isLiquid(p) {
    return /\b(ml|l)\b/i.test(String(p.quantity || '') + ' ' + String(p.serving_size || '')) ||
      (p.categories_tags || []).join(' ').includes('beverage');
  }

  /**
   * Turn an Open Food Facts product into one of our food records.
   *
   * A product is never rejected for being incomplete. Entries with a blank name
   * or a missing nutrition table still exist on the shelf, so we return what we
   * do know and flag it — the caller then offers to fill in the rest, instead of
   * telling the user the barcode "does not exist".
   */
  function toFood(p) {
    const brand = String(p.brands || '').split(',')[0].trim();

    let name = (p.product_name_de || p.product_name || p.product_name_en ||
                p.generic_name_de || p.generic_name || p.abbreviated_product_name || '').trim();
    let namedByFallback = false;
    if (!name) {
      namedByFallback = true;
      name = brand
        ? (brand + (p.quantity ? ' ' + String(p.quantity).trim() : '')).trim()
        : 'Produkt ' + p.code;
    }

    const { n, declared } = nutrientsFrom(p.nutriments);
    const needsNutrition = !(n.kcal || n.protein || n.carbs || n.fat);

    const unit = isLiquid(p) ? 'ml' : 'g';
    const servings = [];
    const sv = parseServingGrams(p);
    if (sv) servings.push({ label: (String(p.serving_size || '').trim() || ('1 Portion (' + sv + ' ' + unit + ')')), g: sv });
    const pkg = parsePackageGrams(p);
    if (pkg && pkg !== sv) servings.push({ label: 'Ganze Packung (' + p.quantity + ')', g: pkg });
    servings.push({ label: '100 ' + unit, g: 100 });
    servings.push({ label: '1 ' + unit, g: 1 });

    // Only tack the brand on when it is not already part of the product name.
    const brandToken = brand.toLowerCase().split(/\s+/)[0] || '';
    const showBrand = brand && brandToken && !name.toLowerCase().includes(brandToken);

    const micros = Nutrition.MICROS.filter(m => declared.includes(m.k)).length;

    return {
      id: 'off-' + p.code,
      barcode: String(p.code),
      name: showBrand ? name + ' (' + brand + ')' : name,
      brand,
      cat: pickCategory(p.categories_tags),
      unit,
      n,
      servings,
      image: p.image_front_small_url || '',
      declared,
      microCount: micros,
      partialMicros: micros < 5,
      needsNutrition,
      namedByFallback,
      // Quality inputs — processing group, additive count, official Nutri-Score.
      nova: Number(p.nova_group) || 0,
      additives: (function () {
        const a = Number(p.additives_n);
        return isFinite(a) && a >= 0 ? a : -1;
      })(),
      nutriscore: String(p.nutriscore_grade || '').toUpperCase(),
      palmOilFree: (p.ingredients_analysis_tags || []).indexOf('en:palm-oil-free') !== -1,
      vegan: (p.ingredients_analysis_tags || []).indexOf('en:vegan') !== -1,
      vegetarian: (p.ingredients_analysis_tags || []).indexOf('en:vegetarian') !== -1,
      source: 'off',
      search: (name + ' ' + brand + ' ' + p.code).toLowerCase(),
      builtin: false,
      fetchedAt: Date.now()
    };
  }

  /* ------------------------------------------------------------ public */

  /** Look in the local store first — scanned products keep working offline. */
  async function localByBarcode(code) {
    const foods = await Data.customFoods();
    return foods.find(f => f.barcode && String(f.barcode) === String(code)) || null;
  }

  /**
   * Resolve a barcode to a food. Checks the device first, then Open Food Facts.
   * Returns { food, from: 'local'|'network' } or throws { code }.
   */
  async function lookup(code, opts) {
    const o = opts || {};
    const local = await localByBarcode(code);
    if (local && !o.forceRefresh) return { food: local, from: 'local' };

    // v2 is lean and fast; v0 returns the full document and occasionally has a
    // product that v2's field projection comes back empty for.
    const endpoints = [
      HOST + '/api/v2/product/' + encodeURIComponent(code) + '.json?fields=' + FIELDS,
      HOST + '/api/v0/product/' + encodeURIComponent(code) + '.json'
    ];

    let data = null, lastErr = null;
    for (const url of endpoints) {
      try {
        const d = await get(url);
        if (d && d.status !== 0 && d.product) { data = d; break; }
        lastErr = Object.assign(new Error('not-found'), { code: 'not-found' });
      } catch (err) {
        lastErr = err;
        if (err.code === 'offline') break;         // no point trying the next host
      }
    }

    if (!data) {
      if (local) return { food: local, from: 'local' };
      throw lastErr || Object.assign(new Error('not-found'), { code: 'not-found' });
    }

    const food = toFood(Object.assign({ code }, data.product));
    // Incomplete entries are still returned — the caller offers to complete them.
    if (!food.needsNutrition) await save(food);
    return { food, from: 'network' };
  }

  /** Text search against Open Food Facts, biased to German products. */
  async function search(query, opts) {
    const o = opts || {};
    const params = new URLSearchParams({
      search_terms: query,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: String(o.limit || 25),
      fields: FIELDS
    });
    if (o.country !== null) params.set('countries', o.country || 'Germany');

    const data = await get(HOST + '/cgi/search.pl?' + params.toString());
    const products = (data && data.products) || [];
    const out = [];
    for (const p of products) {
      const f = toFood(p);
      // A search list should only show things you can actually log.
      if (f && !f.needsNutrition && !f.namedByFallback) out.push(f);
    }
    return out;
  }

  /** Persist a fetched product into the local food store. */
  async function save(food) {
    await Data.saveFood(food);
    App.state.customFoods = await Data.customFoods();
    return food;
  }

  function message(err) {
    switch (err && err.code) {
      case 'offline':    return 'No connection — only foods already saved on this device are available.';
      case 'unreachable': return 'Could not reach Open Food Facts just now — it rate-limits bursts of lookups. Wait a few seconds and try again.';
      case 'timeout':    return 'Open Food Facts did not respond in time. Try again.';
      case 'not-found':  return 'That barcode is not in Open Food Facts yet.';
      case 'no-nutrition': return 'That product exists but has no nutrition label recorded.';
      case 'server':     return 'Open Food Facts is having trouble right now. Try again shortly.';
      default:           return 'Lookup failed. Check your connection and try again.';
    }
  }

  window.OFF = { lookup, search, save, toFood, localByBarcode, message, HOST };
})();
