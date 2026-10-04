/* ==========================================================================
   localpack.js — bundled offline product pack (German supermarkets)

   A snapshot of German retail products harvested from Open Food Facts, shipped
   with the app as sharded JSON. Barcodes resolve straight from the shard with
   no network at all — which matters because supermarket aisles are exactly
   where phone signal disappears.

   Shards are fetched on demand (one small file per lookup) and precached by the
   service worker, so the whole pack works offline without ever holding all of
   it in memory.

   Data: Open Food Facts contributors, Open Database License (ODbL) v1.0.
   ========================================================================== */
(function () {
  'use strict';

  const DIR = 'data/de/';
  const cache = new Map();          // shard index -> Map(barcode -> record)
  let meta = null;
  let metaPromise = null;
  let unavailable = false;

  /* Field order written by the build script (pack v5; see tools/fetch-de.js).
     Nutrient fields are null for products with no nutrition table yet. */
  const F = { CODE: 0, NAME: 1, BRAND: 2, CAT: 3, LIQUID: 4, SERV: 5, PKG: 6,
              KCAL: 7, PROTEIN: 8, CARBS: 9, FAT: 10, FIBER: 11, SUGAR: 12,
              SATFAT: 13, NA: 14, NOVA: 15, ADDITIVES: 16, NUTRISCORE: 17, FLAGS: 18, TYPE: 19,
              CODES: 20, ALLERGENS: 21, INGREDIENTS: 22, EXTRAS: 23 };
  const NUTRI = ['', 'A', 'B', 'C', 'D', 'E'];

  const CATS = OffMap.CATS;          // same order the pack builder indexes by

  /** Shard filenames are zero-padded to the width recorded in index.json. */
  function shardFile(i) {
    return String(i).padStart((meta && meta.pad) || 2, '0') + '.json' + ver();
  }
  /* Shards are cached forever, so their URL carries the pack's build date: a
     refreshed pack gets new URLs and is fetched fresh instead of shadowed. */
  const ver = () => (meta && meta.built ? '?v=' + meta.built : '');

  /** Drop cached shards from earlier pack builds — each set is ~20 MB uncompressed. */
  async function pruneOldShards() {
    if (!('caches' in window) || !meta) return;
    try {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          const u = new URL(req.url);
          if (u.pathname.indexOf('/data/de/') !== -1 && /\.json$/.test(u.pathname) &&
              !/index\.json$/.test(u.pathname) && u.searchParams.get('v') !== meta.built) {
            await cache.delete(req);
          }
        }
      }
    } catch (_) {}
  }

  /** Same function the build script shards with. */
  const shardOf = code => OffMap.shardOf(code, meta ? meta.shards : 128);

  function info() {
    if (meta) return Promise.resolve(meta);
    if (unavailable) return Promise.resolve(null);
    if (metaPromise) return metaPromise;
    metaPromise = fetch(DIR + 'index.json')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('no pack')))
      .then(j => { meta = j; setTimeout(pruneOldShards, 3000); return j; })
      .catch(() => { unavailable = true; return null; })
      .finally(() => { metaPromise = null; });
    return metaPromise;
  }

  async function loadShard(i) {
    if (cache.has(i)) return cache.get(i);
    let map = new Map();
    try {
      const res = await fetch(DIR + shardFile(i));
      if (res.ok) {
        const rows = await res.json();
        for (const row of rows) map.set(row[F.CODE], row);
      }
    } catch (_) { /* offline and not yet precached — fall through empty */ }
    // Hold at most a few shards so memory stays flat on a phone.
    if (cache.size > 4) cache.delete(cache.keys().next().value);
    cache.set(i, map);
    return map;
  }

  /** Expand a packed row into the app's food shape. */
  function toFood(row) {
    const n = Nutrition.empty();
    n.kcal = row[F.KCAL];
    n.protein = row[F.PROTEIN];
    n.carbs = row[F.CARBS];
    n.fat = row[F.FAT];
    n.fiber = row[F.FIBER];
    n.sugar = row[F.SUGAR];
    n.satfat = row[F.SATFAT];
    n.na = row[F.NA];

    const nameOnly = row[F.KCAL] === null;
    if (nameOnly) Object.keys(n).forEach(k => { n[k] = 0; });
    const declared = nameOnly ? [] : ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satfat', 'na']
      .filter(k => n[k] > 0);
    // Anything else the label printed: vitamins, minerals, caffeine, alcohol …
    const extras = row[F.EXTRAS];
    let microCount = 0;
    if (extras && typeof extras === 'object') {
      Object.keys(extras).forEach(k => {
        if (!(k in n)) return;
        n[k] = Number(extras[k]) || 0;
        declared.push(k);
        if (OffMap.MICRO_KEYS.indexOf(k) !== -1) microCount++;
      });
    }

    const unit = row[F.LIQUID] ? 'ml' : 'g';
    const servings = [];
    if (row[F.SERV] > 0) servings.push({ label: 'Serving (' + row[F.SERV] + ' ' + unit + ')', g: row[F.SERV] });
    if (row[F.PKG] > 0 && row[F.PKG] !== row[F.SERV]) {
      servings.push({ label: 'Whole pack (' + row[F.PKG] + ' ' + unit + ')', g: row[F.PKG] });
    }
    servings.push({ label: '100 ' + unit, g: 100 });
    servings.push({ label: '1 ' + unit, g: 1 });

    const name = row[F.NAME];
    const brand = row[F.BRAND];
    const showBrand = brand && !name.toLowerCase().includes(brand.toLowerCase().split(/\s+/)[0]);

    const flags = row[F.FLAGS] || 0;
    return {
      id: 'off-' + row[F.CODE],
      barcode: row[F.CODE],
      name: showBrand ? name + ' (' + brand + ')' : name,
      brand,
      cat: CATS[row[F.CAT]] || 'Snacks & Sweets',
      unit,
      n,
      servings,
      image: '',
      declared,
      microCount,
      partialMicros: true,
      needsNutrition: nameOnly,
      // Quality inputs: processing group, additives, official Nutri-Score.
      nova: row[F.NOVA] || 0,
      // A known ingredient list with no E-numbers in it means no additives,
      // even where the search API left the count out.
      additives: row[F.ADDITIVES] >= 0 ? row[F.ADDITIVES]
        : row[F.INGREDIENTS] > 0 ? (row[F.CODES] ? String(row[F.CODES]).split('.').length : 0) : -1,
      additiveCodes: row[F.CODES] ? String(row[F.CODES]).split('.') : [],
      allergens: row[F.ALLERGENS] || 0,
      ingredientsN: row[F.INGREDIENTS] || 0,
      nutriscore: NUTRI[row[F.NUTRISCORE] || 0] || '',
      flags,
      palmOilFree: !!(flags & OffMap.FLAG.PALM_FREE),
      vegan: !!(flags & OffMap.FLAG.VEGAN),
      vegetarian: !!(flags & OffMap.FLAG.VEGETARIAN),
      type: row[F.TYPE] === undefined ? -1 : row[F.TYPE],
      source: 'pack',
      search: (name + ' ' + brand + ' ' + row[F.CODE]).toLowerCase(),
      builtin: false,
      fetchedAt: Date.now()
    };
  }

  /** Barcode -> food, or null. Never throws, never needs a connection. */
  async function lookup(code) {
    const m = await info();
    if (!m) return null;
    const key = String(code).replace(/\D/g, '');
    for (const variant of Barcode.variants(key)) {
      const map = await loadShard(shardOf(variant));
      const row = map.get(variant);
      if (row) return toFood(row);
    }
    return null;
  }

  /**
   * Name search across the pack. Only runs once the whole pack has been saved
   * offline — otherwise it would quietly pull 10 MB to answer one query.
   * Scans shards in turn and stops as soon as it has enough matches.
   */
  async function search(query, limit) {
    const m = await info();
    if (!m) return [];
    const q = String(query || '').toLowerCase().trim();
    if (q.length < 2) return [];
    if (!(await isDownloaded())) return [];

    const words = q.split(/\s+/).filter(Boolean);
    const max = limit || 30;
    const out = [];
    for (let i = 0; i < m.shards && out.length < max; i++) {
      const map = await loadShard(i);
      for (const row of map.values()) {
        if (row[F.KCAL] === null) continue;            // nothing to log without a label
        const hay = (row[F.NAME] + ' ' + row[F.BRAND]).toLowerCase();
        if (words.every(w => hay.indexOf(w) !== -1)) {
          out.push(toFood(row));
          if (out.length >= max) break;
        }
      }
    }
    return out;
  }

  /* ------------------------------------------------ better alternatives */
  let topPromise = null;
  function loadTop() {
    if (!topPromise) {
      topPromise = info().then(() => fetch(DIR + 'top.json' + ver()))
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(j => { if (!j) topPromise = null; return j; });
    }
    return topPromise;
  }

  /* Product types are Open Food Facts categories ("en:cocoa-and-hazelnuts-spreads"),
     kept in their own versioned file so index.json stays tiny. */
  let typesPromise = null;
  function loadTypes() {
    if (!typesPromise) {
      typesPromise = info().then(() => fetch(DIR + 'types.json' + ver()))
        .then(r => (r && r.ok ? r.json() : null)).catch(() => null)
        .then(j => {
          if (!j) { typesPromise = null; return null; }
          const byTag = new Map(j.map(([tag, n], i) => [tag, { i, n }]));
          return { list: j, byTag };
        });
    }
    return typesPromise;
  }

  /** "en:cocoa-and-hazelnuts-spreads" -> "cocoa and hazelnuts spreads" */
  function typeLabel(tag) {
    return String(tag || '').replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  }

  /**
   * Type index for any food. Pack foods carry it; live-scanned products are
   * classified from their category tags by picking the most specific tag the
   * pack knows (fewest products = most specific).
   */
  async function typeOf(food) {
    if (food && typeof food.type === 'number' && food.type >= 0) return food.type;
    const tags = (food && food.tags) || [];
    if (!tags.length) return -1;
    const t = await loadTypes();
    if (!t) return -1;
    let best = -1, bestN = Infinity;
    for (const tag of tags) {
      const hit = t.byTag.get(tag);
      if (hit && hit.n < bestN) { best = hit.i; bestN = hit.n; }
    }
    return best;
  }

  /**
   * Higher-graded products of the same kind, for the "better choices" list.
   * Same kind means the same Open Food Facts category; failing that, a shared
   * product-type word in the name (joghurt, pizza, müsli …). If neither is
   * known, nothing is suggested — a list of "better" products that are not
   * alternatives to this one is worse than no list.
   */
  async function alternatives(food, limit) {
    const current = food && Quality.rate(food);
    if (!current) return [];
    const [top, types] = await Promise.all([loadTop(), loadTypes()]);
    if (!top) return [];

    let pool = [], basis = null;
    const ti = await typeOf(food);
    if (ti >= 0 && top.type && top.type[ti]) {
      pool = top.type[ti];
      basis = types ? typeLabel(types.list[ti][0]) : 'same category';
    } else {
      const name = String(food.name || '').toLowerCase();
      Object.keys(top.kw || {}).forEach(word => {
        if (name.indexOf(word) !== -1) pool = pool.concat(top.kw[word]);
      });
      if (pool.length) basis = 'same kind';
    }
    if (!pool.length) return [];

    const seen = new Set([String(food.barcode || '')]);
    const out = [];
    for (const i of pool) {
      const row = top.rows[i];
      if (!row || seen.has(row[F.CODE])) continue;
      seen.add(row[F.CODE]);
      const alt = toFood(row);
      const r = Quality.rate(alt);
      // A few points is noise, not a better choice.
      if (r && r.score >= current.score + 8) out.push({ food: alt, rating: r, basis });
    }
    // Best first; among equals, the one judged on more complete data.
    out.sort((a, b) => (b.rating.score - a.rating.score) || (b.rating.confidence - a.rating.confidence));
    return out.slice(0, limit || 4);
  }

  /**
   * Where a product ranks among its own category, Oasis-style:
   * { better: 0–100 (share of rated peers it beats), n: peers rated, basis }.
   * Null when the category is unknown or too small to rank fairly.
   */
  async function rank(food) {
    const r = food && Quality.rate(food);
    if (!r) return null;
    const [top, types] = await Promise.all([loadTop(), loadTypes()]);
    if (!top || !top.dist) return null;
    const ti = await typeOf(food);
    const d = ti >= 0 ? top.dist[ti] : null;
    if (!d) return null;
    const n = d[0], q = d.slice(1);
    let better;
    if (r.score <= q[0]) better = 0;
    else if (r.score > q[20]) better = 100;
    else {
      for (let i = 1; i <= 20; i++) {
        if (r.score <= q[i]) {
          const lo = q[i - 1], hi = q[i];
          better = (i - 1 + (hi > lo ? (r.score - lo) / (hi - lo) : 0)) * 5;
          break;
        }
      }
    }
    return { better: Math.round(better), n, basis: types ? typeLabel(types.list[ti][0]) : 'its category' };
  }

  /** How big the bundled pack is, for the Settings screen. */
  async function stats() {
    const m = await info();
    return m ? { count: m.count, labelled: m.labelled, gzBytes: m.gzBytes, shards: m.shards, built: m.built } : null;
  }

  /**
   * Pull every shard through the service worker cache so the whole pack is
   * available with no signal. Opt-in, because it is a real download — the
   * aisles of a supermarket are exactly where you need it and cannot get it.
   */
  async function download(onProgress) {
    const m = await info();
    if (!m) throw new Error('No product pack is bundled with this build.');
    let done = 0, bytes = 0;
    for (let i = 0; i < m.shards; i++) {
      try {
        const res = await fetch(DIR + shardFile(i));
        if (res.ok) bytes += (await res.arrayBuffer()).byteLength;
      } catch (_) { /* keep going; a missing shard just means a gap */ }
      done++;
      if (onProgress) onProgress(done, m.shards, bytes);
    }
    // The alternatives index and category names, so "better choices" work offline too.
    for (const extra of ['top.json', 'types.json']) {
      try {
        const res = await fetch(DIR + extra + ver());
        if (res.ok) bytes += (await res.arrayBuffer()).byteLength;
      } catch (_) {}
    }
    return { shards: done, bytes };
  }

  /** True once every shard is present in the cache. */
  async function isDownloaded() {
    const m = await info();
    if (!m || !('caches' in window)) return false;
    try {
      for (let i = 0; i < m.shards; i++) {
        const hit = await caches.match(new URL(DIR + shardFile(i), location.href));
        if (!hit) return false;
      }
      return true;
    } catch (_) { return false; }
  }

  window.LocalPack = { lookup, search, alternatives, rank, loadTop, loadTypes, typeOf, typeLabel, stats, info, toFood, shardOf, download, isDownloaded, DIR };
})();
