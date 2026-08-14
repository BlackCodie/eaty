/* ==========================================================================
   nutrition.js — energy targets, reference intakes, nutrient math, scoring
   ========================================================================== */
(function () {
  'use strict';

  const KEYS = window.FoodDB.KEYS;

  /* ----------------------------------------------------------- Metadata */
  const MICROS = [
    // Vitamins
    { k: 'vitA', label: 'Vitamin A',   unit: 'µg', group: 'vitamin', rda: p => p.sex === 'female' ? 700 : 900 },
    { k: 'b1',   label: 'Thiamin B1',  unit: 'mg', group: 'vitamin', rda: p => p.sex === 'female' ? 1.1 : 1.2 },
    { k: 'b2',   label: 'Riboflavin B2', unit: 'mg', group: 'vitamin', rda: p => p.sex === 'female' ? 1.1 : 1.3 },
    { k: 'b3',   label: 'Niacin B3',   unit: 'mg', group: 'vitamin', rda: p => p.sex === 'female' ? 14 : 16 },
    { k: 'b5',   label: 'Pantoth. B5', unit: 'mg', group: 'vitamin', rda: () => 5 },
    { k: 'b6',   label: 'Vitamin B6',  unit: 'mg', group: 'vitamin', rda: p => p.age > 50 ? (p.sex === 'female' ? 1.5 : 1.7) : 1.3 },
    { k: 'b9',   label: 'Folate B9',   unit: 'µg', group: 'vitamin', rda: () => 400 },
    { k: 'b12',  label: 'Vitamin B12', unit: 'µg', group: 'vitamin', rda: () => 2.4 },
    { k: 'vitC', label: 'Vitamin C',   unit: 'mg', group: 'vitamin', rda: p => p.sex === 'female' ? 75 : 90 },
    { k: 'vitD', label: 'Vitamin D',   unit: 'µg', group: 'vitamin', rda: p => p.age > 70 ? 20 : 15 },
    { k: 'vitE', label: 'Vitamin E',   unit: 'mg', group: 'vitamin', rda: () => 15 },
    { k: 'vitK', label: 'Vitamin K',   unit: 'µg', group: 'vitamin', rda: p => p.sex === 'female' ? 90 : 120 },
    // Minerals
    { k: 'ca', label: 'Calcium',    unit: 'mg', group: 'mineral', rda: p => (p.age > 70 || (p.sex === 'female' && p.age > 50)) ? 1200 : 1000 },
    { k: 'fe', label: 'Iron',       unit: 'mg', group: 'mineral', rda: p => (p.sex === 'female' && p.age <= 50) ? 18 : 8 },
    { k: 'mg', label: 'Magnesium',  unit: 'mg', group: 'mineral', rda: p => p.sex === 'female' ? (p.age > 30 ? 320 : 310) : (p.age > 30 ? 420 : 400) },
    { k: 'k',  label: 'Potassium',  unit: 'mg', group: 'mineral', rda: p => p.sex === 'female' ? 2600 : 3400 },
    { k: 'zn', label: 'Zinc',       unit: 'mg', group: 'mineral', rda: p => p.sex === 'female' ? 8 : 11 },
    { k: 'se', label: 'Selenium',   unit: 'µg', group: 'mineral', rda: () => 55 },
    { k: 'p',  label: 'Phosphorus', unit: 'mg', group: 'mineral', rda: () => 700 },
    { k: 'na', label: 'Sodium',     unit: 'mg', group: 'mineral', rda: () => 2300, limit: true }
  ];

  const OTHER = [
    { k: 'fiber',  label: 'Fibre',       unit: 'g',  group: 'other' },
    { k: 'sugar',  label: 'Sugars',      unit: 'g',  group: 'other', limit: true },
    { k: 'satfat', label: 'Saturated fat', unit: 'g', group: 'other', limit: true },
    { k: 'chol',   label: 'Cholesterol', unit: 'mg', group: 'other', limit: true },
    { k: 'water',  label: 'Water (food)', unit: 'g', group: 'other' }
  ];

  const MACROS = [
    { k: 'protein', label: 'Protein', short: 'P', unit: 'g', color: 'var(--protein)', kcalPerG: 4 },
    { k: 'carbs',   label: 'Carbs',   short: 'C', unit: 'g', color: 'var(--carbs)',   kcalPerG: 4 },
    { k: 'fat',     label: 'Fat',     short: 'F', unit: 'g', color: 'var(--fat)',     kcalPerG: 9 }
  ];

  const ACTIVITY = [
    { k: 'sedentary', label: 'Sedentary',    desc: 'Desk job, little exercise',        mult: 1.2 },
    { k: 'light',     label: 'Lightly active', desc: '1–3 light sessions a week',      mult: 1.375 },
    { k: 'moderate',  label: 'Moderately active', desc: '3–5 sessions a week',         mult: 1.55 },
    { k: 'active',    label: 'Very active',   desc: '6–7 hard sessions a week',        mult: 1.725 },
    { k: 'athlete',   label: 'Athlete',       desc: 'Twice-daily / physical job',      mult: 1.9 }
  ];

  const GOALS = [
    { k: 'lose',      label: 'Lose fat',       desc: 'Moderate deficit, high protein',   adj: -0.20, protein: 2.0, fatPct: 0.25 },
    { k: 'maintain',  label: 'Maintain',       desc: 'Hold weight, eat well',            adj: 0,     protein: 1.6, fatPct: 0.28 },
    { k: 'gain',      label: 'Gain muscle',    desc: 'Small surplus for lean gains',     adj: 0.12,  protein: 2.0, fatPct: 0.25 },
    { k: 'nutrition', label: 'Eat better',     desc: 'Focus on micronutrient quality',   adj: 0,     protein: 1.4, fatPct: 0.30 }
  ];

  /* ------------------------------------------------------ Nutrient math */
  function empty() {
    const n = {};
    for (const k of KEYS) n[k] = 0;
    return n;
  }

  /** Scale a per-100 nutrient object to `grams`. */
  function scale(per100, grams) {
    const f = (Number(grams) || 0) / 100;
    const out = {};
    for (const k of KEYS) out[k] = (Number(per100[k]) || 0) * f;
    return out;
  }

  /** Multiply a nutrient object by a factor (e.g. recipe servings). */
  function mul(n, factor) {
    const out = {};
    for (const k of KEYS) out[k] = (Number(n[k]) || 0) * factor;
    return out;
  }

  function add(a, b) {
    const out = {};
    for (const k of KEYS) out[k] = (Number(a[k]) || 0) + (Number(b[k]) || 0);
    return out;
  }

  function sum(list) {
    const out = empty();
    for (const n of list) {
      if (!n) continue;
      for (const k of KEYS) out[k] += Number(n[k]) || 0;
    }
    return out;
  }

  /** Energy implied by macros — used to sanity-check custom foods. */
  function kcalFromMacros(n) {
    return (n.protein || 0) * 4 + (n.carbs || 0) * 4 + (n.fat || 0) * 9;
  }

  /* --------------------------------------------------------- Body maths */
  function bmr(p) {
    const kg = Number(p.weight) || 70;
    const cm = Number(p.height) || 175;
    const age = Number(p.age) || 30;
    const base = 10 * kg + 6.25 * cm - 5 * age;
    if (p.sex === 'female') return base - 161;
    if (p.sex === 'male') return base + 5;
    return base - 78;                       // midpoint for unspecified
  }

  function tdee(p) {
    const a = ACTIVITY.find(x => x.k === p.activity) || ACTIVITY[1];
    return bmr(p) * a.mult;
  }

  function bmi(p) {
    const m = (Number(p.height) || 175) / 100;
    return (Number(p.weight) || 70) / (m * m);
  }

  /**
   * Full daily targets. Any key present in profile.custom overrides the
   * calculated value, so a user can dial in their own numbers.
   */
  function targets(profile) {
    const p = profile || {};
    const goal = GOALS.find(g => g.k === p.goal) || GOALS[1];
    const kg = Number(p.weight) || 70;

    const maintenance = tdee(p);
    let kcal = maintenance * (1 + goal.adj);

    // Never drop below a sane floor or below ~110% of BMR.
    const floor = Math.max(p.sex === 'female' ? 1200 : 1500, bmr(p) * 1.1);
    if (goal.adj < 0) kcal = Math.max(kcal, floor);
    kcal = Math.round(kcal / 10) * 10;

    let protein = Math.round(kg * goal.protein);
    let fat = Math.round(kcal * goal.fatPct / 9);
    const minFat = Math.round(kg * 0.6);
    if (fat < minFat) fat = minFat;

    let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
    if (carbs < 30) {                       // rebalance rather than emit nonsense
      carbs = 30;
      fat = Math.max(minFat, Math.round((kcal - protein * 4 - carbs * 4) / 9));
    }

    const t = {
      kcal,
      maintenance: Math.round(maintenance),
      bmr: Math.round(bmr(p)),
      protein, carbs, fat,
      fiber: Math.round(kcal / 1000 * 14),
      water: Math.round(kg * 33 / 50) * 50,   // ml, rounded to 50
      sugar: Math.round(kcal * 0.10 / 4),
      satfat: Math.round(kcal * 0.10 / 9),
      chol: 300,
      micros: {}
    };

    const forRda = { sex: p.sex || 'male', age: Number(p.age) || 30 };
    MICROS.forEach(m => { t.micros[m.k] = m.rda(forRda); });

    // User overrides
    const c = p.custom || {};
    ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'water'].forEach(k => {
      if (c[k] !== undefined && c[k] !== null && c[k] !== '') t[k] = Number(c[k]);
    });

    t.macroKcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    return t;
  }

  /**
   * What share of the day's calories came from foods whose micronutrients are
   * actually known. Entries carry `hasMicros` (set when they were logged); older
   * entries without the flag are assumed complete, which is what they were.
   */
  function microCoverage(entries) {
    let total = 0, known = 0;
    (entries || []).forEach(e => {
      const k = (e.n && e.n.kcal) || 0;
      if (k <= 0) return;
      total += k;
      if (e.hasMicros !== false) known += k;
    });
    return {
      total, known,
      fraction: total > 0 ? known / total : 0,
      missingKcal: total - known
    };
  }

  /* ------------------------------------------------------ Nutrition score */
  /**
   * 0–100 daily quality score.
   *   Calories 25 · Protein 25 · Fibre 15 · Micronutrients 25 · Variety 10
   */
  function score(totals, t, entries) {
    const parts = [];

    // Calories — reward being close to target in either direction.
    const dev = t.kcal > 0 ? Math.abs(totals.kcal - t.kcal) / t.kcal : 1;
    let calPts;
    if (totals.kcal === 0) calPts = 0;
    else if (dev <= 0.05) calPts = 25;
    else calPts = Math.max(0, 25 * (1 - (dev - 0.05) / 0.30));
    parts.push({ label: 'Calories', pts: calPts, max: 25, pct: Math.max(0, Math.min(100, (1 - dev) * 100)) });

    // Protein — hitting target is what matters; no penalty for going over.
    const pPct = t.protein > 0 ? Math.min(1, totals.protein / t.protein) : 0;
    parts.push({ label: 'Protein', pts: pPct * 25, max: 25, pct: pPct * 100 });

    // Fibre
    const fPct = t.fiber > 0 ? Math.min(1, totals.fiber / t.fiber) : 0;
    parts.push({ label: 'Fibre', pts: fPct * 15, max: 15, pct: fPct * 100 });

    // Micronutrients — mean coverage across all tracked vitamins + minerals
    // (sodium excluded: it is a ceiling, not a goal).
    //
    // Packaged food only has to declare energy, fat, saturates, carbohydrate,
    // sugars, protein and salt. Counting the undeclared vitamins as zero would
    // punish you for scanning a barcode rather than for what you ate, so the
    // target is scaled to the share of the day's calories that actually carries
    // micronutrient data, and that share is reported alongside the score.
    const tracked = MICROS.filter(m => !m.limit);
    const cover = microCoverage(entries);
    let acc = 0;
    tracked.forEach(m => {
      const target = (t.micros[m.k] || 0) * cover.fraction;
      acc += target > 0 ? Math.min(1, (totals[m.k] || 0) / target) : 0;
    });
    const mPct = tracked.length && cover.fraction > 0 ? acc / tracked.length : 0;
    parts.push({
      label: 'Micronutrients', pts: mPct * 25, max: 25, pct: mPct * 100,
      coverage: cover.fraction,
      note: cover.fraction >= 0.995
        ? ''
        : 'from ' + Math.round(cover.fraction * 100) + '% of intake'
    });

    // Variety — distinct foods logged today
    const distinct = new Set((entries || []).map(e => e.refId || e.name)).size;
    const vPct = Math.min(1, distinct / 12);
    parts.push({ label: 'Variety', pts: vPct * 10, max: 10, pct: vPct * 100, note: distinct + ' foods' });

    const total = Math.round(parts.reduce((s, p) => s + p.pts, 0));
    return { total: Math.max(0, Math.min(100, total)), parts };
  }

  function scoreLabel(v) {
    if (v >= 90) return { label: 'Excellent', color: 'var(--brand)' };
    if (v >= 75) return { label: 'Strong',    color: 'var(--brand)' };
    if (v >= 60) return { label: 'Good',      color: 'var(--carbs)' };
    if (v >= 40) return { label: 'Fair',      color: 'var(--fat)' };
    if (v > 0)   return { label: 'Needs work', color: 'var(--protein)' };
    return { label: 'Nothing logged', color: 'var(--tx-3)' };
  }

  /* ------------------------------------------------------- Exercise kcal */
  // METs for rough burn estimates when the user does not type a number.
  const EXERCISES = [
    { k: 'walking',   label: 'Walking',        met: 3.5 },
    { k: 'running',   label: 'Running',        met: 9.8 },
    { k: 'cycling',   label: 'Cycling',        met: 7.5 },
    { k: 'weights',   label: 'Weight training', met: 5.0 },
    { k: 'hiit',      label: 'HIIT / circuits', met: 8.0 },
    { k: 'swimming',  label: 'Swimming',       met: 7.0 },
    { k: 'football',  label: 'Football',       met: 7.0 },
    { k: 'yoga',      label: 'Yoga / mobility', met: 3.0 },
    { k: 'rowing',    label: 'Rowing',         met: 7.0 },
    { k: 'climbing',  label: 'Climbing',       met: 8.0 },
    { k: 'tennis',    label: 'Racket sports',  met: 7.3 },
    { k: 'hiking',    label: 'Hiking',         met: 6.0 },
    { k: 'other',     label: 'Other',          met: 5.0 }
  ];

  function burn(exKey, minutes, weightKg) {
    const ex = EXERCISES.find(e => e.k === exKey) || EXERCISES[EXERCISES.length - 1];
    return Math.round(ex.met * 3.5 * (Number(weightKg) || 70) / 200 * (Number(minutes) || 0));
  }

  window.Nutrition = {
    KEYS, MICROS, OTHER, MACROS, ACTIVITY, GOALS, EXERCISES,
    empty, scale, mul, add, sum, kcalFromMacros, microCoverage,
    bmr, tdee, bmi, targets, score, scoreLabel, burn,
    micro: k => MICROS.find(m => m.k === k),
    /** Convenience: total kcal burned from a list of workout records. */
    burned: list => (list || []).reduce((s, w) => s + (Number(w.kcal) || 0), 0)
  };
})();
