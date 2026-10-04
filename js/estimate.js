/* ==========================================================================
   estimate.js — fill in what a label leaves out

   EU labels only have to print energy, fat, saturates, carbohydrate, sugars,
   protein and salt. Vitamins, minerals, caffeine, omega-3 and the rest are
   almost never on a packaged product, so a diary of scanned food would show
   near-zero micronutrients when the food really carried plenty.

   This module finds the closest reference food in the built-in database (same
   kind of food by name, similar macro profile) and borrows the values the label
   is missing, scaled by energy. Cooked rice and dry rice differ mainly in water,
   so scaling by calories carries the micronutrients across correctly.

   Estimates never overwrite a declared value, are kept out of the quality
   score, and are labelled as estimates everywhere they are shown.
   ========================================================================== */
(function () {
  'use strict';

  const COMPOUNDS = ['iodine', 'omega3', 'epadha', 'caffeine', 'isoflavones', 'nitrate', 'glycyrrhizin'];
  const STOP = new Set(('mit und oder der die das ein eine bio natur naturell classic klassisch original ' +
    'light leicht zero fit von vom im in aus auf fur für the with and of from style art nach typ ' +
    'packung stück stueck scheiben portion minis mini maxi family pack gross groß klein frisch fresh ' +
    'premium extra feine fein gut beste selection edition organic ' +
    // Category-level words match whole aisles ("fruit" is in "grapefruit").
    'fruit fruits frucht früchte obst gemüse vegetable vegetables food snack snacks drink getränk produkt product').split(' '));
  const SPLIT = /[^a-zà-ÿß]+/;

  const micros = () => Nutrition.MICROS.map(m => m.k).filter(k => k !== 'na');

  /** A built-in food's searchable text without its category ("fruit" matches every fruit). */
  const nameText = f => f.search.replace(String(f.cat || '').toLowerCase(), ' ');

  /* Every word the built-in database knows, for splitting German compounds. */
  let TOKENS = null;
  function tokens() {
    if (!TOKENS) {
      TOKENS = new Set();
      FoodDB.all().forEach(f => nameText(f).split(SPLIT).forEach(w => { if (w.length >= 5) TOKENS.add(w); }));
    }
    return TOKENS;
  }

  /**
   * Name -> search words: the appended "(Brand)", short and stop words
   * dropped (the brand stays when it is the name: "Nutella", "Red Bull"). German compounds also contribute their head noun, which comes
   * last: "Erdbeerjoghurt" -> "joghurt", "Vollmilchschokolade" -> "schokolade".
   */
  function words(food) {
    let name = String(food.name || '').toLowerCase().replace(/\([^)]*\)/g, ' ');
    const out = [];
    name.split(SPLIT).filter(w => w.length >= 4 && !STOP.has(w)).forEach(w => {
      out.push(w);
      if (w.length >= 8 && !tokens().has(w)) {
        for (let i = 2; i <= w.length - 5; i++) {
          if (tokens().has(w.slice(i))) { out.push(w.slice(i)); break; }
        }
      }
    });
    return Array.from(new Set(out)).slice(0, 8);
  }

  /** Energy fractions of protein, carbs and fat, plus sugar's share. */
  function profile(n) {
    const p = (n.protein || 0) * 4, c = (n.carbs || 0) * 4, f = (n.fat || 0) * 9;
    const t = p + c + f;
    if (t <= 0) return null;
    return { p: p / t, c: c / t, f: f / t, s: (n.sugar || 0) * 4 / t };
  }

  function distance(a, b) {
    return Math.abs(a.p - b.p) + Math.abs(a.c - b.c) + Math.abs(a.f - b.f) + 0.5 * Math.abs(a.s - b.s);
  }

  /**
   * Closest built-in reference for a product, or null.
   * Returns { ref, distance, hits, quality: 'close'|'rough' }.
   */
  function reference(food, extraWords) {
    if (!food || !food.n || food.builtin || food.kind === 'supplement') return null;
    const mine = (food.n.kcal || 0) < 5 ? null : profile(food.n);
    const ws = words(food).concat(extraWords || []);
    if (!ws.length) return null;

    const pool = new Map();
    ws.forEach(w => FoodDB.search(w, null, 20).forEach(f => {
      if (f.builtin && f.cat !== 'Supplements') pool.set(f.id, f);
    }));

    let best = null;
    pool.forEach(f => {
      const text = nameText(f);
      const hits = ws.filter(w => text.indexOf(w) !== -1).length;
      if (!hits) return;                      // a name match is required, always
      let d;
      if (!mine) {
        // Zero-calorie products (diet drinks) match zero-calorie references.
        if ((f.n.kcal || 0) >= 5) return;
        d = 0;
      } else {
        const theirs = profile(f.n);
        if (!theirs || !(f.n.kcal > 0)) return;
        d = distance(mine, theirs);
      }
      const rank = d - 0.15 * hits - (f.cat === food.cat ? 0.08 : 0);
      if (!best || rank < best.rank) best = { ref: f, distance: d, hits, rank };
    });
    if (!best || best.distance > 0.5) return null;
    best.quality = best.distance <= 0.3 ? 'close' : 'rough';
    return best;
  }

  /**
   * A copy of `food` with missing micronutrients and compounds estimated.
   * Returns the food unchanged when nothing sensible matches.
   */
  function apply(food, extraWords) {
    if (!food || !food.n || food.builtin || food.estimate) return food;
    const declared = new Set(food.declared || []);
    const m = reference(food, extraWords);
    if (!m) return food;
    const ref = m.ref;
    const ratio = ref.n.kcal > 0 && food.n.kcal > 0 ? Math.max(0.4, Math.min(3, food.n.kcal / ref.n.kcal)) : 1;
    const n = Object.assign({}, food.n);
    const keys = [];
    const F = OffMap.FLAG;
    const flags = typeof food.flags === 'number' ? food.flags : 0;
    const listed = (food.ingredientsN || 0) > 0;

    micros().forEach(k => {
      if (declared.has(k) || !(ref.n[k] > 0)) return;
      n[k] = ref.n[k] * ratio; keys.push(k);
    });
    COMPOUNDS.forEach(k => {
      if (declared.has(k) || !(ref.n[k] > 0)) return;
      // Stimulants and phytoestrogens only cross over when the product's own
      // ingredient list does not rule them out (decaf, soy-free "veggie" food).
      if (k === 'caffeine' && /decaf|koffeinfrei|entkoffeiniert|caffeine.?free/i.test(food.name)) return;
      if (k === 'isoflavones' && listed && !(flags & F.SOY)) return;
      if (k === 'glycyrrhizin' && listed && !(flags & F.LICORICE)) return;
      n[k] = ref.n[k] * ratio; keys.push(k);
    });

    // Glycemic index belongs to the kind of food; load follows this product's carbs.
    const out = Object.assign({}, food, { n });
    if (ref.gi > 0 && !(food.gi > 0)) {
      out.gi = ref.gi; out.giEstimated = true;
      n.gl = Math.round(ref.gi * Math.max(0, (n.carbs || 0) - (n.fiber || 0))) / 100;
      keys.push('gl');
    }
    // Free sugars: the label's sugar minus what is naturally in this kind of food.
    if (!declared.has('freesugar') && (n.sugar || 0) > 0) {
      const intrinsic = Math.max(0, (ref.n.sugar || 0) - (ref.n.freesugar || 0)) * ratio;
      if (flags & (F.ADDED_SUGAR | F.FRUIT_JUICE)) n.freesugar = Math.max(0, n.sugar - intrinsic);
      else if (listed) n.freesugar = 0;
      else n.freesugar = ref.n.sugar > 0 ? n.sugar * Math.min(1, (ref.n.freesugar || 0) / ref.n.sugar) : 0;
      n.freesugar = Math.round(n.freesugar * 10) / 10;
      keys.push('freesugar');
    }
    if (!keys.length) return food;
    out.microsEstimated = true;
    out.estimate = { refId: ref.id, refName: ref.name, keys, quality: m.quality };
    return out;
  }

  /** Whether the user wants estimates (Settings; on by default). */
  const enabled = () => !(App.state.settings && App.state.settings.estimateMicros === false);

  window.Estimate = { apply, reference, words, enabled, COMPOUNDS };
})();
