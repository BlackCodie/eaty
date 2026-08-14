/* ==========================================================================
   quality.js — per-food quality rating (0–100, graded A–E)

   Rates a single food the way a shelf-scanner app does: not "how many
   calories" but "how good is this thing". Eight weighted criteria, three
   rewarding what a food gives you and five penalising what it costs you.

   The governing rule is that **missing data is never scored as zero**. A
   criterion with no data is dropped and the remaining weights are renormalised,
   and the share of weight that had data is reported as `confidence`. Otherwise
   a packaged product would be marked down for a vitamin figure that its label
   was never required to print.

   Runs unchanged in the browser and in Node (the pack builder uses it), so the
   grade in the app and the grade in the build are computed by the same code.
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Quality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Reference intakes per 2000 kcal, used for nutrient density. Deliberately a
     single neutral reference — a food's quality should not change with who is
     looking at it. Personal RDAs still drive the daily diary targets. */
  const REF = {
    vitA: 800, b1: 1.1, b2: 1.4, b3: 16, b5: 6, b6: 1.4, b9: 200, b12: 2.5,
    vitC: 80, vitD: 15, vitE: 12, vitK: 75,
    ca: 800, fe: 14, mg: 375, k: 2000, zn: 10, se: 55, p: 700
  };
  const MICRO_KEYS = Object.keys(REF);

  const WEIGHTS = {
    density: 20,    // micronutrients per calorie
    protein: 10,
    fiber: 12,
    sugar: 16,
    satfat: 12,
    sodium: 10,
    processing: 14, // NOVA group
    additives: 6
  };

  const GRADES = [
    { min: 80, grade: 'A', label: 'Excellent', color: 'var(--brand)' },
    { min: 65, grade: 'B', label: 'Good', color: '#7CC950' },
    { min: 50, grade: 'C', label: 'Fair', color: 'var(--fat)' },
    { min: 32, grade: 'D', label: 'Poor', color: '#F0842F' },
    { min: -1, grade: 'E', label: 'Avoid', color: 'var(--protein)' }
  ];

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  /** 1 when value <= good, 0 when value >= bad, linear between. */
  const lowerBetter = (v, good, bad) => clamp01((bad - v) / (bad - good));
  /** 0 when value <= none, 1 when value >= full, linear between. */
  const higherBetter = (v, none, full) => clamp01((v - none) / (full - none));

  /* ------------------------------------------------- processing estimate */
  const NOVA4 = /pizza|burger|nugget|crisps|chips\b|gumm|marshmallow|cola|energy drink|sports drink|doughnut|donut|cereal bar|instant ramen|cornflakes|ice cream|protein bar|salami|leberk|currywurst|d[oö]ner|bratwurst|wiener|fleischwurst|mortadella|chorizo|jerky|margarine|mayonnaise|ketchup|bbq|ranch|lemonade|nuss-nougat|milk chocolate|lebkuchen|digestive|croissant|waffle|pancake|shawarma|lasagne|bolognese|macaroni cheese|fish finger|spring roll|tikka|burrito|taco|pad thai|quiche|brownie|muffin|cheesecake|apple pie|cookie|pretzel|cracker|trail mix|granola|kondensmilch|schmelz/i;
  const NOVA3 = /bread|br[oö]tchen|cheese|k[aä]se|canned|pickle|gherkin|olives|ham\b|schinken|bacon|speck|smoked|r[aä]ucher|tofu|tempeh|hummus|m[uü]sli|couscous|pasta|noodle|nudel|tortilla|bagel|pita|naan|beer|wine|sekt|bier|zwieback|brezel|kn[aä]cke|sauerkraut|marmelade|konfit|honey|honig|dark chocolate|popcorn|baked beans|falafel|maultaschen|sp[aä]tzle|klo[sß]|passata|soy sauce|mustard|senf|seitan|salad|salat|soup|suppe|juice|saft|schorle|kefir|quark|joghurt|yogurt|baguette|ciabatta|sourdough|pumpernickel|dried|getrocknet|raisin|rosinen|dates|feigen/i;
  const NOVA2 = /\boil\b|[oö]l\b|butter|sugar|zucker|flour|mehl|ghee|schmalz|cream|sahne|schmand|breadcrumb|br[oö]sel|starch|st[aä]rke|syrup|sirup|vinegar|essig|salt\b|salz/i;

  /**
   * NOVA processing group for a food.
   * Uses the real value when the product carries one; otherwise estimates from
   * the name for built-in foods, and reports that it was an estimate.
   */
  function processing(food) {
    if (food && food.nova >= 1 && food.nova <= 4) return { nova: food.nova, estimated: false };
    if (!food || !food.builtin) return { nova: 0, estimated: false };   // genuinely unknown
    const s = String(food.name || '') + ' ' + String(food.cat || '');
    let nova = 1;
    if (NOVA4.test(s)) nova = 4;
    else if (NOVA3.test(s)) nova = 3;
    else if (NOVA2.test(s)) nova = 2;
    return { nova, estimated: true };
  }

  const NOVA_SCORE = { 1: 1, 2: 0.75, 3: 0.42, 4: 0 };

  /** Sugar in whole fruit, veg and plain dairy is intrinsic, not added. */
  function intrinsicSugar(food) {
    if (!food || !food.builtin) return false;
    if (food.cat === 'Fruit' || food.cat === 'Vegetables') return true;
    if (food.cat === 'Dairy & Eggs' && !/chocolate|ice cream|condensed|sweet/i.test(food.name || '')) return true;
    return false;
  }

  /* ------------------------------------------------------------- scoring */

  /**
   * rate(food) -> { score, grade, label, color, confidence, parts[], nova, estimatedNova }
   * `food` is any of the app's food shapes: built-in, custom, pack or API.
   */
  function rate(food) {
    if (!food || !food.n) return null;
    // A vitamin capsule is not a food; grading it on fibre and sugar is noise.
    if (food.kind === 'supplement') return null;
    const n = food.n;
    const kcal = Number(n.kcal) || 0;
    const declared = food.declared || null;   // null means "everything is known"
    const has = k => !declared || declared.indexOf(k) !== -1;

    const parts = [];
    const add = (key, label, pct, note) => {
      parts.push({ key, label, weight: WEIGHTS[key], pct: clamp01(pct) * 100, note: note || '' });
    };

    /* --- what it gives you, measured per calorie so dilution cannot cheat --- */
    const per100kcal = v => kcal > 0 ? (v * 100 / kcal) : 0;

    // Below roughly zero calories the per-calorie criteria are undefined rather
    // than bad — water is not nutrient-poor, it simply has no calories to carry
    // nutrients in. Those criteria drop out and the rest are reweighted.
    const energyFree = kcal < 5;

    if (!energyFree) {
      // Nutrient density: mean coverage across micros the food actually reports,
      // versus that micro's share of a 2000 kcal reference diet.
      const available = MICRO_KEYS.filter(k => has(k));
      if (available.length >= 4) {
        let acc = 0;
        available.forEach(k => {
          const share = REF[k] / 20;                     // reference amount per 100 kcal
          acc += clamp01(per100kcal(Number(n[k]) || 0) / share);
        });
        add('density', 'Nutrient density', acc / available.length,
          available.length + ' nutrients');
      }
      if (has('protein')) {
        add('protein', 'Protein', higherBetter(per100kcal(Number(n.protein) || 0), 1, 8));
      }
    }

    if (has('fiber')) {
      add('fiber', 'Fibre', energyFree
        ? higherBetter(Number(n.fiber) || 0, 0.3, 3)              // per 100 g
        : higherBetter(per100kcal(Number(n.fiber) || 0), 0.3, 2.5));
    }

    /* --- what it costs you, measured per 100 g as labels are --- */
    // Drinks are dilute, so solid-food thresholds would let a sugary soft drink
    // pass. Nutri-Score splits beverages out for the same reason.
    const isDrink = food.unit === 'ml' || food.cat === 'Drinks';

    if (has('sugar')) {
      const s = Number(n.sugar) || 0;
      const lenient = intrinsicSugar(food);
      let good, bad;
      if (isDrink) { good = 0.5; bad = lenient ? 20 : 13.5; }
      else if (lenient) { good = 12; bad = 45; }
      else { good = 4.5; bad = 22.5; }
      add('sugar', 'Sugars', lowerBetter(s, good, bad),
        lenient ? 'natural sugars' : isDrink ? 'per 100 ml' : '');
    }
    if (has('satfat')) {
      add('satfat', 'Saturated fat', lowerBetter(Number(n.satfat) || 0, 1.5, 10));
    }
    if (has('na')) {
      add('sodium', 'Salt', lowerBetter(Number(n.na) || 0, 90, 900));
    }

    const proc = processing(food);
    if (proc.nova) {
      add('processing', 'Processing',
        NOVA_SCORE[proc.nova], 'NOVA ' + proc.nova + (proc.estimated ? ' (est.)' : ''));
    }

    const addN = food.additives;
    if (typeof addN === 'number' && addN >= 0) {
      add('additives', 'Additives',
        addN === 0 ? 1 : addN <= 2 ? 0.75 : addN <= 5 ? 0.42 : 0,
        addN === 0 ? 'none' : addN + (addN === 1 ? ' additive' : ' additives'));
    }

    if (!parts.length) return null;

    const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
    const earned = parts.reduce((s, p) => s + p.weight * p.pct / 100, 0);
    const score = Math.round(earned / totalWeight * 100);
    const allWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

    const g = GRADES.find(x => score >= x.min);
    return {
      score,
      grade: g.grade,
      label: g.label,
      color: g.color,
      confidence: Math.round(totalWeight / allWeight * 100),
      parts,
      nova: proc.nova,
      estimatedNova: proc.estimated
    };
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

  return { rate, rateDay, gradeFor, processing, WEIGHTS, GRADES, REF };
});
