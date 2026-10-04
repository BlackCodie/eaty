/* ==========================================================================
   offmap.js — Open Food Facts interpretation rules, shared by the app and the
   pack builder.

   Everything that turns a raw Open Food Facts record into something Eaty can
   reason about lives here: category and liquid detection, unit conversion of
   nutrients, ingredient analysis, allergens, additives and physiologically
   active compounds. The live barcode lookup and the offline pack both call
   these exact functions, so a product reads the same online and offline.
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  // Browsers (and the Node test loader, which defines window) get a global.
  if (typeof window !== 'undefined') root.OffMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------ categories */
  /** Category names; the index is what the pack stores per product. */
  const CATS = ['Vegetables', 'Fruit', 'Meat & Poultry', 'Fish & Seafood', 'Dairy & Eggs',
    'Grains & Bread', 'Legumes & Soy', 'Nuts & Seeds', 'Fats & Oils', 'Condiments',
    'Drinks', 'Snacks & Sweets', 'Supplements'];

  /* Open Food Facts puts broad umbrella tags — notably
     "en:plant-based-foods-and-beverages" — on almost everything edible.
     Matching them turns chocolate spread into a drink, so they are dropped
     before any rule runs, and specific categories are tested before generic. */
  const UMBRELLA = /^en:(plant-based-foods-and-beverages|plant-based-foods|foods|groceries|farming-products)$/;

  const RULES = [
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
  const DRINK_TAGS = /beverages|waters\b|juices|sodas|drinks\b/;

  function cleanTags(tags) {
    return (tags || []).filter(t => !UMBRELLA.test(t)).join(' ').toLowerCase();
  }
  function catIndex(tags) {
    const s = cleanTags(tags);
    for (const [re, i] of RULES) if (re.test(s)) return i;
    return 11;
  }
  /**
   * Liquid if the product's own pack or serving size is in ml/l, or it is
   * tagged as a genuine drink — not merely "plant-based-foods-and-beverages".
   */
  function isLiquid(p) {
    const sizes = String((p && p.quantity) || '') + ' ' + String((p && p.serving_size) || '');
    return /\b\d+([.,]\d+)?\s*(ml|cl|l|liter|litre)\b/i.test(sizes) ||
      DRINK_TAGS.test(cleanTags(p && p.categories_tags));
  }

  /* ------------------------------------------------------------- nutrients */
  /* Open Food Facts stores every *_100g value in its base unit — grams — so
     sodium_100g: 0.0428 means 42.8 mg. Map: app key -> [OFF keys, multiplier]. */
  const NUTRIENT_MAP = {
    protein: [['proteins'], 1], carbs: [['carbohydrates'], 1], fat: [['fat'], 1],
    fiber: [['fiber'], 1], sugar: [['sugars'], 1], satfat: [['saturated-fat'], 1],
    water: [['water'], 1], chol: [['cholesterol'], 1000], na: [['sodium'], 1000],
    ca: [['calcium'], 1000], fe: [['iron'], 1000], mg: [['magnesium'], 1000],
    k: [['potassium'], 1000], zn: [['zinc'], 1000], p: [['phosphorus'], 1000],
    se: [['selenium'], 1e6], vitA: [['vitamin-a'], 1e6],
    b1: [['vitamin-b1', 'thiamin'], 1000], b2: [['vitamin-b2', 'riboflavin'], 1000],
    b3: [['vitamin-pp', 'niacin'], 1000], b5: [['pantothenic-acid'], 1000],
    b6: [['vitamin-b6'], 1000], b9: [['vitamin-b9', 'folates'], 1e6],
    b12: [['vitamin-b12'], 1e6], vitC: [['vitamin-c'], 1000], vitD: [['vitamin-d'], 1e6],
    vitE: [['vitamin-e'], 1000], vitK: [['vitamin-k'], 1e6],
    // physiologically active compounds
    iodine: [['iodine'], 1e6], omega3: [['omega-3-fat'], 1], transfat: [['trans-fat'], 1],
    caffeine: [['caffeine'], 1000]
  };
  /** Micronutrients a label may declare (used to decide if a product "has micros"). */
  const MICRO_KEYS = ['vitA', 'b1', 'b2', 'b3', 'b5', 'b6', 'b9', 'b12', 'vitC', 'vitD',
    'vitE', 'vitK', 'ca', 'fe', 'mg', 'k', 'zn', 'se', 'p', 'iodine'];

  const num = v => {
    if (v === undefined || v === null || v === '') return null;
    const x = Number(v);
    return isFinite(x) ? x : null;
  };

  /**
   * Nutriments -> { n, declared } in app units. `n` holds only declared keys
   * (callers merge it onto an empty nutrient object); `declared` lists them.
   */
  function nutrientsFrom(raw) {
    raw = raw || {};
    const n = {}, declared = [];
    let kcal = num(raw['energy-kcal_100g']);
    if (kcal === null) {
      const kj = num(raw['energy-kj_100g']) !== null ? num(raw['energy-kj_100g']) : num(raw['energy_100g']);
      if (kj !== null) kcal = kj / 4.184;
    }
    if (kcal !== null) { n.kcal = kcal; declared.push('kcal'); }
    Object.keys(NUTRIENT_MAP).forEach(key => {
      const [cands, f] = NUTRIENT_MAP[key];
      for (const c of cands) {
        const v = num(raw[c + '_100g']);
        if (v !== null && v >= 0) { n[key] = v * f; declared.push(key); return; }
      }
    });
    if (declared.indexOf('na') === -1) {
      const salt = num(raw['salt_100g']);
      if (salt !== null) { n.na = salt / 2.5 * 1000; declared.push('na'); }
    }
    // Open Food Facts reports alcohol as % vol; ethanol weighs 0.789 g per ml.
    const abv = num(raw['alcohol_100g']);
    if (abv !== null && abv > 0) { n.alcohol = abv * 0.789; declared.push('alcohol'); }
    return { n, declared };
  }

  /* ------------------------------------------------------------ ingredients */
  const FLAG = {
    PALM_FREE: 1, VEGAN: 2, VEGETARIAN: 4, PALM: 8, ADDED_SUGAR: 16, SWEETENER: 32,
    FLAVOURING: 64, HYDROGENATED: 128, WHOLEGRAIN: 256, CAFFEINE: 512, SOY: 1024,
    LICORICE: 2048, LIVE_CULTURES: 4096, SEED_OIL: 8192, ALCOHOL: 16384, FRUIT_JUICE: 32768
  };

  const RX = {
    addedSugar: /^en:(sugar|cane-sugar|brown-sugar|raw-cane-sugar|beet-sugar|glucose|glucose-syrup|glucose-fructose-syrup|fructose-glucose-syrup|fructose|fructose-syrup|dextrose|invert-sugar|invert-sugar-syrup|honey|maple-syrup|agave-syrup|corn-syrup|high-fructose-corn-syrup|rice-syrup|caramelised-sugar|sugar-syrup|golden-syrup|molasses|coconut-sugar|maltose|malt-syrup|barley-malt-syrup|date-syrup)$/,
    sweetener: /^en:(e95[0-9]|e96[0-9]|sweetener|sweeteners|aspartame|sucralose|acesulfame-k|saccharin|cyclamate|steviol-glycosides|stevia|neotame|xylitol|erythritol|sorbitol|maltitol)$/,
    palm: /^en:(palm-oil|palm-fat|palm-kernel-oil|palm-kernel-fat|palm-stearin|palm-olein|fractionated-palm-kernel-fat)$/,
    flavour: /^en:(flavouring|flavourings|natural-flavouring|artificial-flavouring|smoke-flavouring|natural-flavourings|flavour)$/,
    hydrogenated: /hydrogenated/,
    wholegrain: /whole-?grain|wholemeal|whole-wheat|whole-rye|whole-oat|wholewheat|vollkorn/,
    caffeine: /^en:(caffeine|coffee|instant-coffee|coffee-extract|guarana|guarana-extract|green-tea-extract|mate|black-tea|cola-nut)$/,
    soy: /^en:(soya|soy|soya-beans|soybean|soya-protein|soy-protein|soya-protein-isolate|tofu|soya-flour|soy-flour|textured-soya-protein|soya-drink|soy-milk|edamame|tempeh|miso)$/,
    licorice: /^en:(liquorice|licorice|liquorice-extract|liquorice-root|glycyrrhiza|glycyrrhizin|liquorice-root-extract)$/,
    cultures: /ferment|culture|lactobacillus|bifidobacter|probiotic/,
    seedOil: /^en:(sunflower-oil|rapeseed-oil|canola-oil|soya-oil|soybean-oil|corn-oil|cottonseed-oil|safflower-oil|grapeseed-oil|vegetable-oil|vegetable-oils)$/,
    alcohol: /^en:(alcohol|ethanol|wine|beer|rum|brandy|whisky|vodka|liqueur|spirit)$/,
    juice: /fruit-juice|juice-concentrate|concentrated-.*-juice|-juice$/
  };

  /** Bitmask of ingredient facts (see FLAG) from the OFF ingredient analysis. */
  function ingredientFlags(p) {
    p = p || {};
    let f = 0;
    const ia = (p.ingredients_analysis_tags || []).join(' ');
    if (ia.indexOf('en:palm-oil-free') !== -1) f |= FLAG.PALM_FREE;
    if (/en:palm-oil(?!-free|-content)/.test(ia)) f |= FLAG.PALM;
    if (ia.indexOf('en:vegan') !== -1 && ia.indexOf('en:non-vegan') === -1) f |= FLAG.VEGAN;
    if (ia.indexOf('en:vegetarian') !== -1 && ia.indexOf('en:non-vegetarian') === -1) f |= FLAG.VEGETARIAN;

    for (const t of p.ingredients_tags || []) {
      if (RX.addedSugar.test(t)) f |= FLAG.ADDED_SUGAR;
      if (RX.sweetener.test(t)) f |= FLAG.SWEETENER;
      if (RX.palm.test(t)) f |= FLAG.PALM;
      if (RX.flavour.test(t)) f |= FLAG.FLAVOURING;
      if (RX.hydrogenated.test(t)) f |= FLAG.HYDROGENATED;
      if (RX.wholegrain.test(t)) f |= FLAG.WHOLEGRAIN;
      if (RX.caffeine.test(t)) f |= FLAG.CAFFEINE;
      if (RX.soy.test(t)) f |= FLAG.SOY;
      if (RX.licorice.test(t)) f |= FLAG.LICORICE;
      if (RX.cultures.test(t)) f |= FLAG.LIVE_CULTURES;
      if (RX.seedOil.test(t)) f |= FLAG.SEED_OIL;
      if (RX.alcohol.test(t)) f |= FLAG.ALCOHOL;
      if (RX.juice.test(t)) f |= FLAG.FRUIT_JUICE;
    }
    for (const a of p.additives_tags || []) {
      if (/^en:e9(5|6)\d/.test(a)) f |= FLAG.SWEETENER;
    }
    if (f & FLAG.PALM) f &= ~FLAG.PALM_FREE;
    return f;
  }

  /* -------------------------------------------------------------- allergens */
  /** The 14 allergens EU law requires labels to emphasise. Bit i = ALLERGENS[i]. */
  const ALLERGENS = [
    ['gluten', 'Gluten'], ['crustaceans', 'Crustaceans'], ['eggs', 'Eggs'], ['fish', 'Fish'],
    ['peanuts', 'Peanuts'], ['soybeans', 'Soy'], ['milk', 'Milk'], ['nuts', 'Tree nuts'],
    ['celery', 'Celery'], ['mustard', 'Mustard'], ['sesame-seeds', 'Sesame'],
    ['sulphur-dioxide-and-sulphites', 'Sulphites'], ['lupin', 'Lupin'], ['molluscs', 'Molluscs']
  ];
  function allergenMask(p) {
    const tags = ((p && p.allergens_tags) || []).join(' ');
    let m = 0;
    ALLERGENS.forEach(([k], i) => { if (tags.indexOf('en:' + k) !== -1) m |= (1 << i); });
    return m;
  }
  function allergenNames(mask) {
    return ALLERGENS.filter((_, i) => mask & (1 << i)).map(a => a[1]);
  }

  /* -------------------------------------------------------------- additives */
  /**
   * "en:e322i" -> "322i". Deduplicated, in label order.
   * Read from additives_tags when present, and from ingredients_tags too: the
   * bulk search API omits additives_tags, but Open Food Facts lists every
   * recognised additive among the ingredients as well. "14xx" is the generic
   * code for an unspecified modified starch.
   */
  function additiveCodes(p) {
    const out = [];
    const take = t => {
      const m = /^en:e(\d{3,4}[a-z]{0,4}|14xx)$/.exec(t);
      if (m && out.indexOf(m[1]) === -1) out.push(m[1]);
    };
    ((p && p.additives_tags) || []).forEach(take);
    ((p && p.ingredients_tags) || []).forEach(take);
    return out;
  }

  /**
   * Shard index for a barcode in the offline pack. FNV-1a with a murmur
   * finaliser: the plain multiply-and-add hash the pack used before left half
   * of the shards nearly empty, because EAN check digits fix the parity of the
   * digit sum and that parity survived into the low bits.
   */
  function shardOf(code, shards) {
    const s = String(code);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) % shards;
  }

  return {
    shardOf, CATS, UMBRELLA, cleanTags, catIndex, catName: tags => CATS[catIndex(tags)], isLiquid,
    NUTRIENT_MAP, MICRO_KEYS, nutrientsFrom,
    FLAG, ingredientFlags, ALLERGENS, allergenMask, allergenNames, additiveCodes
  };
});
