/* ==========================================================================
   fdcapi.js — USDA FoodData Central client

   Complements Open Food Facts. OFF is the better source for European packaged
   goods; FDC is the better source for *generic* foods — its Foundation and
   SR Legacy datasets carry 100+ analysed nutrients per item, which maps onto
   this app's full 29-nutrient model instead of just the label macros.

   The public DEMO_KEY works out of the box but is throttled hard. A personal
   key is free and instant from https://fdc.nal.usda.gov/api-key-signup.html
   and can be pasted into Settings → Food databases.
   ========================================================================== */
(function () {
  'use strict';

  const HOST = 'https://api.nal.usda.gov/fdc/v1';
  const DEMO = 'DEMO_KEY';
  const TIMEOUT = 12000;

  /* FDC nutrientNumber -> [ourKey, targetUnit] */
  const NUT = {
    '208': ['kcal', 'KCAL'],
    '203': ['protein', 'G'], '204': ['fat', 'G'], '205': ['carbs', 'G'],
    '291': ['fiber', 'G'], '269': ['sugar', 'G'], '606': ['satfat', 'G'],
    '601': ['chol', 'MG'], '255': ['water', 'G'],
    '320': ['vitA', 'UG'], '404': ['b1', 'MG'], '405': ['b2', 'MG'],
    '406': ['b3', 'MG'], '410': ['b5', 'MG'], '415': ['b6', 'MG'],
    '435': ['b9', 'UG'], '418': ['b12', 'UG'], '401': ['vitC', 'MG'],
    '328': ['vitD', 'UG'], '323': ['vitE', 'MG'], '430': ['vitK', 'UG'],
    '301': ['ca', 'MG'], '303': ['fe', 'MG'], '304': ['mg', 'MG'],
    '305': ['p', 'MG'], '306': ['k', 'MG'], '307': ['na', 'MG'],
    '309': ['zn', 'MG'], '317': ['se', 'UG']
  };

  const TO_G = { G: 1, MG: 1e-3, UG: 1e-6, IU: 0, KCAL: 0, KJ: 0, MG_ATE: 1e-3, MG_GAE: 1e-3 };

  /** Convert an FDC value into the unit this app stores that nutrient in. */
  function convert(value, from, to) {
    const v = Number(value);
    if (!isFinite(v)) return null;
    if (to === 'KCAL') return from === 'KJ' ? v / 4.184 : v;
    const gf = TO_G[String(from || '').toUpperCase()];
    if (!gf) return null;                       // IU and friends are not convertible
    const grams = v * gf;
    if (to === 'G') return grams;
    if (to === 'MG') return grams * 1e3;
    if (to === 'UG') return grams * 1e6;
    return null;
  }

  function apiKey() {
    const s = App.state.settings || {};
    return (s.fdcKey && String(s.fdcKey).trim()) || DEMO;
  }

  async function get(path, params) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw Object.assign(new Error('offline'), { code: 'offline' });
    }
    const qs = new URLSearchParams(Object.assign({ api_key: apiKey() }, params));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    let res;
    try {
      res = await fetch(HOST + path + '?' + qs.toString(), {
        signal: ctl.signal, headers: { Accept: 'application/json' }
      });
    } catch (err) {
      throw Object.assign(new Error(err.name === 'AbortError' ? 'timeout' : 'offline'),
        { code: err.name === 'AbortError' ? 'timeout' : 'offline' });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 403) throw Object.assign(new Error('bad-key'), { code: 'bad-key' });
    if (res.status === 429) throw Object.assign(new Error('rate-limit'), { code: 'rate-limit' });
    if (!res.ok) throw Object.assign(new Error('server ' + res.status), { code: 'server' });
    return res.json();
  }

  /* ---------------------------------------------------------- mapping */
  function toFood(item) {
    const n = Nutrition.empty();
    const declared = [];

    (item.foodNutrients || []).forEach(fn => {
      // /foods/search uses nutrientNumber; /food/{id} nests it under `nutrient`.
      const num = String(fn.nutrientNumber || (fn.nutrient && fn.nutrient.number) || '');
      const map = NUT[num];
      if (!map) return;
      const [key, target] = map;
      const unit = fn.unitName || (fn.nutrient && fn.nutrient.unitName);
      const value = fn.value !== undefined ? fn.value : fn.amount;
      const v = convert(value, unit, target);
      if (v === null) return;
      if (key === 'kcal' && n.kcal) return;                 // keep the first kcal figure
      n[key] = v;
      if (declared.indexOf(key) === -1) declared.push(key);
    });

    if (!n.kcal && !n.protein && !n.carbs && !n.fat) return null;
    if (!n.kcal) n.kcal = Nutrition.kcalFromMacros(n);

    const brand = (item.brandName || item.brandOwner || '').trim();
    let name = String(item.description || '').trim();
    if (!name) return null;
    // FDC descriptions are SHOUTED for branded items.
    if (name === name.toUpperCase() && name.length > 3) {
      name = name.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (m, a, b) => a + b.toUpperCase());
    }

    const unit = String(item.servingSizeUnit || 'g').toLowerCase() === 'ml' ? 'ml' : 'g';
    const servings = [];
    const ss = Number(item.servingSize);
    if (ss > 0 && ss < 5000) {
      const label = (item.householdServingFullText || '').trim() || ('1 serving (' + Math.round(ss) + ' ' + unit + ')');
      servings.push({ label, g: ss });
    }
    servings.push({ label: '100 ' + unit, g: 100 });
    servings.push({ label: '1 ' + unit, g: 1 });

    const micros = Nutrition.MICROS.filter(m => declared.indexOf(m.k) !== -1).length;
    const showBrand = brand && !name.toLowerCase().includes(brand.toLowerCase().split(/\s+/)[0]);

    return {
      id: 'fdc-' + item.fdcId,
      fdcId: item.fdcId,
      barcode: item.gtinUpc ? String(item.gtinUpc) : null,
      name: showBrand ? name + ' (' + brand + ')' : name,
      brand,
      cat: pickCategory(item),
      unit,
      n,
      servings,
      image: '',
      declared,
      microCount: micros,
      partialMicros: micros < 5,
      needsNutrition: false,
      source: 'fdc',
      dataType: item.dataType || '',
      search: (name + ' ' + brand).toLowerCase(),
      builtin: false,
      fetchedAt: Date.now()
    };
  }

  const CATS = [
    [/beverage|drink|juice|soda|coffee|tea|water/i, 'Drinks'],
    [/dairy|cheese|milk|yogurt|egg|cream|butter/i, 'Dairy & Eggs'],
    [/poultry|beef|pork|lamb|sausage|meat|ham|bacon/i, 'Meat & Poultry'],
    [/fish|seafood|shrimp|salmon|tuna|crab/i, 'Fish & Seafood'],
    [/bread|cereal|pasta|rice|grain|flour|bakery|noodle/i, 'Grains & Bread'],
    [/legume|bean|lentil|soy|tofu|pea/i, 'Legumes & Soy'],
    [/nut|seed/i, 'Nuts & Seeds'],
    [/fat|oil|mayonnaise/i, 'Fats & Oils'],
    [/vegetable/i, 'Vegetables'],
    [/fruit/i, 'Fruit'],
    [/spice|sauce|condiment|dressing/i, 'Condiments'],
    [/snack|sweet|candy|chocolate|bakery|dessert/i, 'Snacks & Sweets']
  ];

  function pickCategory(item) {
    const hay = [item.foodCategory, item.foodCategoryLabel, item.brandedFoodCategory, item.description]
      .filter(Boolean).join(' ');
    for (const [re, cat] of CATS) if (re.test(hay)) return cat;
    return 'Vegetables';
  }

  /* ----------------------------------------------------------- public */

  /**
   * Search FDC. Defaults to the analysed generic datasets, which is where FDC
   * genuinely beats everything else — full micronutrient profiles.
   */
  async function search(query, opts) {
    const o = opts || {};
    // Parentheses in a dataType value (e.g. "Survey (FNDDS)") make the API's
    // front-end proxy reject the whole request, so stick to the analysed sets.
    const data = await get('/foods/search', {
      query,
      pageSize: String(o.limit || 20),
      dataType: o.dataType || 'Foundation,SR Legacy',
      requireAllWords: 'true'
    });
    const out = [];
    for (const item of (data.foods || [])) {
      const f = toFood(item);
      if (f) out.push(f);
    }
    return out;
  }

  /** Barcode fallback — FDC's branded set is mostly US products. */
  async function barcode(gtin) {
    const data = await get('/foods/search', {
      query: gtin, dataType: 'Branded', pageSize: '5'
    });
    const hit = (data.foods || []).find(f => String(f.gtinUpc || '').replace(/^0+/, '') === String(gtin).replace(/^0+/, ''));
    return hit ? toFood(hit) : null;
  }

  function message(err) {
    switch (err && err.code) {
      case 'offline':    return 'No connection.';
      case 'timeout':    return 'FoodData Central did not respond in time.';
      case 'bad-key':    return 'That FoodData Central API key was rejected. Check it in Settings → Food databases.';
      case 'rate-limit': return 'FoodData Central rate limit reached. Add your own free API key in Settings to lift it.';
      default:           return 'FoodData Central lookup failed.';
    }
  }

  window.FDC = { search, barcode, toFood, message, DEMO, apiKey };
})();
