/* ==========================================================================
   quality.js — the Eaty Score (0–100, graded A–E)

   Rates a single product the way a shelf-scanner app does: not "how many
   calories" but "how good is this thing, really". Four pillars:

     Nutrition    55  nutrient density, protein, fibre, sugars, saturated fat,
                      salt and glycemic load — per calorie for what a food gives
                      you, per 100 g for what it costs you. One extreme (a soft
                      drink's sugar, a sausage's salt) halves the pillar, so it
                      cannot be averaged away by being low in everything else
     Additives    20  every E-number weighed by its evidence-based risk level
                      (js/additives.js): none 0, limited −4, moderate −15, high −40
     Processing   15  NOVA group
     Ingredients  10  hydrogenated fat, palm oil, sweeteners, flavourings, added
                      sugar, length of the list; whole grains and live cultures
                      count in its favour

   Two hard caps, the same rule Yuka made familiar: a product containing a
   high-risk additive or partially hydrogenated fat can score at most 49,
   however good its macros look.

   The governing rule is that **missing data is never scored as zero**. A
   criterion with no data is dropped and the remaining weights renormalised; the
   share of weight that had data is reported as `confidence`.

   Runs unchanged in the browser and in Node (the pack builder uses it), so the
   grade in the app and the grade in the build are computed by the same code.
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  // Browsers (and the Node test loader, which defines window) get a global.
  if (typeof window !== 'undefined') root.Quality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Shared modules: globals in the browser, require() in Node. */
  const dep = (name, file) => {
    if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
    try { return typeof require === 'function' ? require(file) : null; } catch (_) { return null; }
  };
  let _add = null, _off = null;
  const Additives = () => _add || (_add = dep('Additives', './additives.js'));
  const OffMap = () => _off || (_off = dep('OffMap', './offmap.js'));

  /* Reference intakes per 2000 kcal, used for nutrient density. Deliberately a
     single neutral reference — a food's quality should not change with who is
     looking at it. Personal RDAs still drive the daily diary targets. */
  const REF = {
    vitA: 800, b1: 1.1, b2: 1.4, b3: 16, b5: 6, b6: 1.4, b9: 200, b12: 2.5,
    vitC: 80, vitD: 15, vitE: 12, vitK: 75,
    ca: 800, fe: 14, mg: 375, k: 2000, zn: 10, se: 55, p: 700
  };
  const MICRO_KEYS = Object.keys(REF);

  const PILLARS = { nutrition: 55, additives: 20, processing: 15, ingredients: 10 };
  const PILLAR_LABEL = { nutrition: 'Nutrition', additives: 'Additives', processing: 'Processing', ingredients: 'Ingredients' };

  /* Criteria inside the nutrition pillar (relative weights). */
  const NUTRITION = { density: 20, protein: 10, fiber: 12, sugar: 16, satfat: 12, sodium: 10, glycemic: 6 };
  const NUTRITION_TOTAL = Object.values(NUTRITION).reduce((a, b) => a + b, 0);

  /** Effective weight of every criterion out of 100, for display. */
  const WEIGHTS = (() => {
    const w = {};
    Object.keys(NUTRITION).forEach(k => { w[k] = Math.round(PILLARS.nutrition * NUTRITION[k] / NUTRITION_TOTAL * 10) / 10; });
    w.additives = PILLARS.additives; w.processing = PILLARS.processing; w.ingredients = PILLARS.ingredients;
    return w;
  })();

  const RISK_PENALTY = [0, 4, 15, 40];
  const CAP = 49;

  const GRADES = [
    { min: 80, grade: 'A', label: 'Excellent', color: 'var(--grade-a)' },
    { min: 65, grade: 'B', label: 'Good', color: 'var(--grade-b)' },
    { min: 50, grade: 'C', label: 'Fair', color: 'var(--grade-c)' },
    { min: 32, grade: 'D', label: 'Poor', color: 'var(--grade-d)' },
    { min: -1, grade: 'E', label: 'Bad', color: 'var(--grade-e)' }
  ];

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  /** 1 when value <= good, 0 when value >= bad, linear between. */
  const lowerBetter = (v, good, bad) => clamp01((bad - v) / (bad - good));
  /** 0 when value <= none, 1 when value >= full, linear between. */
  const higherBetter = (v, none, full) => clamp01((v - none) / (full - none));

  /* ------------------------------------------------- processing estimate */
  const NOVA4 = /pizza|burger|nugget|crisps|chips\b|gumm|marshmallow|cola|energy drink|sports drink|doughnut|donut|cereal bar|instant ramen|cornflakes|ice cream|protein bar|salami|leberk|currywurst|d[oö]ner|bratwurst|wiener|fleischwurst|mortadella|chorizo|jerky|margarine|mayonnaise|ketchup|bbq|ranch|lemonade|nuss-nougat|milk chocolate|lebkuchen|digestive|croissant|waffle|pancake|shawarma|lasagne|bolognese|macaroni cheese|fish finger|spring roll|tikka|burrito|taco|pad thai|quiche|brownie|muffin|cheesecake|apple pie|cookie|pretzel|cracker|trail mix|granola|kondensmilch|schmelz|licorice|lakritz|vegan burger|protein powder/i;
  const NOVA3 = /bread|br[oö]tchen|cheese|k[aä]se|canned|pickle|gherkin|olives|ham\b|schinken|bacon|speck|smoked|r[aä]ucher|tofu|tempeh|hummus|m[uü]sli|couscous|pasta|noodle|nudel|tortilla|bagel|pita|naan|beer|wine|sekt|bier|zwieback|brezel|kn[aä]cke|sauerkraut|marmelade|konfit|honey|honig|dark chocolate|popcorn|baked beans|falafel|maultaschen|sp[aä]tzle|klo[sß]|passata|soy sauce|mustard|senf|seitan|salad|salat|soup|suppe|juice|saft|schorle|baguette|ciabatta|sourdough|pumpernickel|whisky|vodka|gl[uü]hwein/i;
  const NOVA2 = /\boil\b|[oö]l\b|butter|sugar|zucker|flour|mehl|ghee|schmalz|cream|sahne|schmand|breadcrumb|br[oö]sel|starch|st[aä]rke|syrup|sirup|vinegar|essig|salt\b|salz/i;

  /**
   * NOVA processing group for a food.
   * Uses the real value when the product carries one; otherwise estimates from
   * the name for built-in foods, and reports that it was an estimate.
   */
  function processing(food) {
    if (food && food.nova >= 1 && food.nova <= 4) return { nova: food.nova, estimated: false };
    if (!food || !food.builtin) return { nova: 0, estimated: false };   // genuinely unknown
    // The name only: category labels like "Grains & Bread" would mark plain rice as bread.
    const s = String(food.name || '');
    let nova = 1;
    if (NOVA4.test(s)) nova = 4;
    else if (NOVA3.test(s)) nova = 3;
    else if (NOVA2.test(s)) nova = 2;
    return { nova, estimated: true };
  }

  const NOVA_SCORE = { 1: 1, 2: 0.8, 3: 0.45, 4: 0 };
  const NOVA_TEXT = { 1: 'Unprocessed', 2: 'Culinary ingredient', 3: 'Processed', 4: 'Ultra-processed' };

  /* -------------------------------------------------------------- pillars */

  /** Additives pillar from resolved E-numbers, or from a bare count. */
  function additivesPillar(food, proc) {
    const codes = Array.isArray(food.additiveCodes) ? food.additiveCodes : [];
    const A = Additives();
    if (codes.length && A) {
      const list = codes.map(c => A.get(c) || { code: String(c).toUpperCase(), e: 'E' + String(c).toUpperCase(), name: 'E' + String(c).toUpperCase(), fn: '', risk: 1, note: '', unknown: true });
      // The same additive listed twice ("e322" and "e322i") counts once.
      const seen = new Set();
      const uniq = list.filter(a => (seen.has(a.code) ? false : (seen.add(a.code), true)));
      const penalty = uniq.reduce((s, a) => s + RISK_PENALTY[a.risk || 0], 0);
      const worst = uniq.reduce((m, a) => Math.max(m, a.risk || 0), 0);
      const counts = [0, 0, 0, 0];
      uniq.forEach(a => counts[a.risk || 0]++);
      const bits = [];
      if (counts[3]) bits.push(counts[3] + ' high risk');
      if (counts[2]) bits.push(counts[2] + ' moderate');
      return {
        pct: clamp01((100 - penalty) / 100),
        note: uniq.length + (uniq.length === 1 ? ' additive' : ' additives') + (bits.length ? ' · ' + bits.join(', ') : ''),
        list: uniq, worst
      };
    }
    const n = food.additives;
    if (typeof n === 'number' && n >= 0) {
      if (n === 0) return { pct: 1, note: 'none', list: [], worst: 0 };
      return { pct: n <= 2 ? 0.75 : n <= 5 ? 0.42 : 0.15, note: n + (n === 1 ? ' additive' : ' additives'), list: [], worst: 0 };
    }
    // A raw vegetable has no additives — that is knowledge, not an assumption.
    if (food.builtin && proc.nova === 1) return { pct: 1, note: 'whole food', list: [], worst: 0 };
    return null;
  }

  /** Ingredients pillar from the ingredient-analysis flags. */
  function ingredientsPillar(food, proc) {
    const F = OffMap() && OffMap().FLAG;
    const flags = typeof food.flags === 'number' ? food.flags : 0;
    const known = F && (flags !== 0 || (food.ingredientsN || 0) > 0);
    if (!known) {
      if (food.builtin && proc.nova === 1) return { pct: 1, note: 'single ingredient', hits: [] };
      return null;
    }
    let s = 100;
    const hits = [];
    const hit = (bit, delta, text, level) => { if (flags & bit) { s += delta; hits.push({ text, level }); } };
    hit(F.HYDROGENATED, -50, 'Hydrogenated fat', 'bad');
    hit(F.ADDED_SUGAR, -15, 'Added sugar', 'bad');
    hit(F.SWEETENER, -20, 'Sweeteners', 'bad');
    hit(F.PALM, -15, 'Palm oil', 'bad');
    hit(F.FLAVOURING, -10, 'Flavourings', 'bad');
    hit(F.WHOLEGRAIN, 10, 'Whole grain', 'good');
    hit(F.LIVE_CULTURES, 10, 'Live cultures', 'good');
    const n = food.ingredientsN || 0;
    if (n > 20) { s -= 15; hits.push({ text: n + ' ingredients', level: 'bad' }); }
    else if (n > 10) s -= 5;
    else if (n > 0 && n <= 3) hits.push({ text: n === 1 ? 'Single ingredient' : n + ' ingredients', level: 'good' });
    return { pct: clamp01(s / 100), note: n ? n + ' ingredients' : '', hits, hydrogenated: !!(flags & F.HYDROGENATED) };
  }

  /* ------------------------------------------------------------- scoring */

  /**
   * rate(food) -> {
   *   score, grade, label, color, confidence,
   *   parts[]    criteria { key, label, pillar, weight, pct, note }
   *   pillars[]  { key, label, weight, pct }  (pct null when unknown)
   *   good[], bad[]  plain-language highlights { key, text }
   *   additives[]    resolved E-numbers, cap (reason or null), nova, estimatedNova
   * }
   * `food` is any of the app's food shapes: built-in, custom, pack or API.
   */
  function rate(food) {
    if (!food || !food.n) return null;
    // A vitamin capsule is not a food; grading it on fibre and sugar is noise.
    if (food.kind === 'supplement') return null;
    // No nutrition table yet: additives alone would flatter a bag of sweets.
    if (food.needsNutrition) return null;
    const n = food.n;
    const kcal = Number(n.kcal) || 0;
    const declared = food.declared || null;   // null means "everything is known"
    const has = k => !declared || declared.indexOf(k) !== -1;
    const isDrink = food.unit === 'ml' || food.cat === 'Drinks';
    // Pure fats are judged like Nutri-Score 2023 judges oils: by the share of
    // their fat that is saturated, and not for lacking protein or fibre.
    const pureFat = (Number(n.fat) || 0) >= 80;
    const F = OffMap() && OffMap().FLAG;
    const sweetened = !!(F && typeof food.flags === 'number' && (food.flags & F.SWEETENER));

    const crit = {};
    const add = (key, label, pct, note) => { crit[key] = { key, label, pillar: 'nutrition', pct: clamp01(pct), note: note || '' }; };

    /* --- what it gives you, measured per calorie so dilution cannot cheat --- */
    const per100kcal = v => kcal > 0 ? (v * 100 / kcal) : 0;

    // Below roughly zero calories the per-calorie criteria are undefined rather
    // than bad — water is not nutrient-poor, it simply has no calories.
    const energyFree = kcal < 5;

    if (!energyFree) {
      const available = MICRO_KEYS.filter(k => has(k));
      if (available.length >= 4 && !food.microsEstimated) {
        let acc = 0;
        available.forEach(k => { acc += clamp01(per100kcal(Number(n[k]) || 0) / (REF[k] / 20)); });
        add('density', 'Nutrient density', acc / available.length, available.length + ' nutrients');
      }
      if (has('protein') && !pureFat) add('protein', 'Protein', higherBetter(per100kcal(Number(n.protein) || 0), 1, 8));
      // Glycemic load per 100 kcal; only foods with a known glycemic index.
      if (food.gi > 0 && n.gl >= 0) {
        add('glycemic', 'Glycemic load', lowerBetter(per100kcal(Number(n.gl) || 0), 4, 14), 'GI ' + food.gi + (food.giEstimated ? ' (est.)' : ''));
      }
    }

    if (has('fiber') && !pureFat && !(energyFree && isDrink)) {
      add('fiber', 'Fibre', energyFree
        ? higherBetter(Number(n.fiber) || 0, 0.3, 3)
        : higherBetter(per100kcal(Number(n.fiber) || 0), 0.3, 2.5));
    }

    /* --- what it costs you, per 100 g as labels are --- */
    // Built-in foods know their free sugars (WHO definition): sugar inside whole
    // fruit and plain milk is not penalised; juice and syrup sugar is.
    if (food.builtin && typeof n.freesugar === 'number') {
      const s = n.freesugar;
      add('sugar', 'Free sugars', isDrink ? lowerBetter(s, 0.5, 10) : lowerBetter(s, 2.5, 22.5),
        s > 0 ? (isDrink ? 'per 100 ml' : '') : 'none added');
    } else if (has('sugar')) {
      const s = Number(n.sugar) || 0;
      add('sugar', 'Sugars', isDrink ? lowerBetter(s, 0.5, 10) : lowerBetter(s, 4.5, 22.5), isDrink ? 'per 100 ml' : '');
    }
    // Sweetened drinks: Nutri-Score 2023 stopped letting sweeteners pass as "no sugar".
    if (crit.sugar && isDrink && sweetened && crit.sugar.pct > 0.5) {
      crit.sugar.pct = 0.5; crit.sugar.note = 'sweetened';
    }
    if (has('satfat')) {
      if (pureFat) {
        const ratio = (Number(n.satfat) || 0) / (Number(n.fat) || 1);
        add('satfat', 'Saturated fat', lowerBetter(ratio, 0.15, 0.6), Math.round(ratio * 100) + '% of fat');
      } else {
        add('satfat', 'Saturated fat', lowerBetter(Number(n.satfat) || 0, 1.5, 10));
      }
    }
    if (has('na')) add('sodium', 'Salt', lowerBetter(Number(n.na) || 0, 90, 900));

    // Vitamins sprayed into an ultra-processed product do not make it a whole food.
    const procEarly = processing(food);
    if (crit.density && procEarly.nova === 4) { crit.density.pct *= 0.5; crit.density.note += ' · fortified?'; }

    /* --- pillars --- */
    const pillars = [];
    const parts = [];
    const nKeys = Object.keys(crit);
    let nutritionShare = 0;
    if (nKeys.length) {
      const w = nKeys.reduce((s, k) => s + NUTRITION[k], 0);
      let pct = nKeys.reduce((s, k) => s + NUTRITION[k] * crit[k].pct, 0) / w;
      const neg = ['sugar', 'satfat', 'sodium'].filter(k => crit[k]).map(k => crit[k].pct);
      if (neg.length) pct *= 0.5 + 0.5 * Math.min(1, Math.min.apply(null, neg) / 0.25);
      // Criteria that cannot apply (protein in water, glycemic load without a
      // known GI) do not count against confidence; criteria with no data do.
      const applicable = Object.keys(NUTRITION).filter(k => {
        if (k === 'glycemic') return !!crit.glycemic;
        if (energyFree && (k === 'density' || k === 'protein')) return false;
        if (pureFat && (k === 'protein' || k === 'fiber')) return false;
        if (energyFree && isDrink && k === 'fiber') return false;
        return true;
      });
      nutritionShare = w / applicable.reduce((s, k) => s + NUTRITION[k], 0);
      pillars.push({ key: 'nutrition', label: 'Nutrition', weight: PILLARS.nutrition, pct: pct * 100 });
      nKeys.forEach(k => parts.push(Object.assign({}, crit[k], {
        weight: Math.round(PILLARS.nutrition * NUTRITION[k] / w * 10) / 10, pct: crit[k].pct * 100
      })));
    }

    const proc = processing(food);
    if (proc.nova) {
      const pct = NOVA_SCORE[proc.nova];
      pillars.push({ key: 'processing', label: 'Processing', weight: PILLARS.processing, pct: pct * 100 });
      parts.push({ key: 'processing', label: 'Processing', pillar: 'processing', weight: PILLARS.processing,
        pct: pct * 100, note: 'NOVA ' + proc.nova + (proc.estimated ? ' (est.)' : '') });
    }

    const addP = additivesPillar(food, proc);
    if (addP) {
      pillars.push({ key: 'additives', label: 'Additives', weight: PILLARS.additives, pct: addP.pct * 100 });
      parts.push({ key: 'additives', label: 'Additives', pillar: 'additives', weight: PILLARS.additives,
        pct: addP.pct * 100, note: addP.note });
    }

    const ingP = ingredientsPillar(food, proc);
    if (ingP) {
      pillars.push({ key: 'ingredients', label: 'Ingredients', weight: PILLARS.ingredients, pct: ingP.pct * 100 });
      parts.push({ key: 'ingredients', label: 'Ingredients', pillar: 'ingredients', weight: PILLARS.ingredients,
        pct: ingP.pct * 100, note: ingP.note });
    }

    if (!pillars.length) return null;

    const totalWeight = pillars.reduce((s, p) => s + p.weight, 0);
    let score = Math.round(pillars.reduce((s, p) => s + p.weight * p.pct / 100, 0) / totalWeight * 100);

    let cap = null;
    if (addP && addP.worst >= 3) {
      const worst = addP.list.find(a => a.risk >= 3);
      cap = 'Contains ' + worst.name + ' (' + (worst.e || worst.code) + '), a high-risk additive';
    } else if (ingP && ingP.hydrogenated) {
      cap = 'Contains hydrogenated fat, the main source of industrial trans fats';
    }
    if (cap && score > CAP) score = CAP;

    // Confidence: share of the full weighting that had real data behind it.
    const known = (nKeys.length ? PILLARS.nutrition * nutritionShare : 0) +
      (proc.nova ? PILLARS.processing * (proc.estimated ? 0.6 : 1) : 0) +
      (addP ? PILLARS.additives : 0) + (ingP ? PILLARS.ingredients : 0);

    // Fill pillars that had no data, so the UI can show them as unknown.
    Object.keys(PILLARS).forEach(k => {
      if (!pillars.some(p => p.key === k)) pillars.push({ key: k, label: PILLAR_LABEL[k], weight: PILLARS[k], pct: null });
    });
    pillars.sort((a, b) => b.weight - a.weight);

    const { good, bad } = highlights(food, crit, proc, addP, ingP, isDrink);
    const g = GRADES.find(x => score >= x.min);
    return {
      score,
      grade: g.grade,
      label: g.label,
      color: g.color,
      confidence: Math.round(known),
      parts,
      pillars,
      good, bad,
      additives: addP ? addP.list : [],
      cap,
      nova: proc.nova,
      estimatedNova: proc.estimated
    };
  }

  /** Plain-language reasons, strongest first. */
  function highlights(food, crit, proc, addP, ingP, isDrink) {
    const good = [], bad = [];
    const c = k => crit[k] ? crit[k].pct : null;
    if (addP) {
      addP.list.filter(a => a.risk >= 3).forEach(a => bad.push({ key: 'add-' + a.code, text: a.name + ' (' + (a.e || a.code) + ') — high-risk additive' }));
      addP.list.filter(a => a.risk === 2).forEach(a => bad.push({ key: 'add-' + a.code, text: a.name + ' (' + (a.e || a.code) + ') — moderate risk' }));
      if (!addP.list.length && addP.pct === 1 && !(food.builtin && proc.nova === 1)) good.push({ key: 'no-additives', text: 'No additives' });
    }
    if (ingP) (ingP.hits || []).forEach(h => (h.level === 'good' ? good : bad).push({ key: 'ing-' + h.text, text: h.text }));
    if (proc.nova === 4) bad.push({ key: 'nova', text: 'Ultra-processed' + (proc.estimated ? ' (estimated)' : '') });
    if (proc.nova === 1) good.push({ key: 'nova', text: 'Unprocessed' });

    const s = c('sugar');
    if (s !== null && s <= 0.25) bad.push({ key: 'sugar', text: isDrink ? 'Sugary drink' : 'High in sugar' });
    if (c('satfat') !== null && c('satfat') <= 0.25) bad.push({ key: 'satfat', text: 'High in saturated fat' });
    if (c('sodium') !== null && c('sodium') <= 0.25) bad.push({ key: 'sodium', text: 'Salty' });
    if (c('glycemic') !== null && c('glycemic') <= 0.2) bad.push({ key: 'glycemic', text: 'Spikes blood sugar' });

    const n = food.n;
    const lead = [];   // the strongest positives go first
    if (c('protein') !== null && c('protein') >= 0.75) lead.push({ key: 'protein', text: 'High in protein' });
    if (c('fiber') !== null && c('fiber') >= 0.75) lead.push({ key: 'fiber', text: 'Rich in fibre' });
    if (c('density') !== null && c('density') >= 0.6) lead.push({ key: 'density', text: 'Nutrient dense' });
    good.unshift.apply(good, lead);
    if (c('glycemic') !== null && c('glycemic') >= 0.9 && (n.carbs || 0) >= 10 && (s === null || s > 0.5)) {
      good.push({ key: 'glycemic', text: 'Gentle on blood sugar' });
    }
    if (s !== null && s >= 0.95) {
      if (food.builtin && !n.freesugar && (n.sugar || 0) >= 5) good.push({ key: 'sugar', text: 'No added sugar' });
      else if (!food.builtin && (n.carbs || 0) >= 10) good.push({ key: 'sugar', text: 'Little or no sugar' });
    }
    if (crit.satfat && crit.satfat.note && crit.satfat.pct >= 0.9) good.push({ key: 'satfat', text: 'Mostly unsaturated fat' });
    return { good, bad };
  }

  /** Calorie-weighted average rating across a set of logged entries. */
  function rateDay(entries, resolve) {
    let kcal = 0, acc = 0, rated = 0, worst = null, best = null;
    (entries || []).forEach(e => {
      const food = resolve ? resolve(e) : null;
      const r = food ? rate(food) : null;
      const k = (e.n && e.n.kcal) || 0;
      if (!r || k <= 0) return;
      kcal += k; acc += r.score * k; rated++;
      if (!worst || r.score < worst.score) worst = { score: r.score, name: e.name, grade: r.grade };
      if (!best || r.score > best.score) best = { score: r.score, name: e.name, grade: r.grade };
    });
    if (!kcal) return null;
    const score = Math.round(acc / kcal);
    const g = GRADES.find(x => score >= x.min);
    return { score, grade: g.grade, label: g.label, color: g.color, rated, worst, best };
  }

  function gradeFor(score) {
    return GRADES.find(x => score >= x.min);
  }

  return { rate, rateDay, gradeFor, processing, WEIGHTS, PILLARS, GRADES, REF, NOVA_TEXT, CAP };
});
