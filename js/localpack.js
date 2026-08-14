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

  /* Field order written by the build script (pack v2). */
  const F = { CODE: 0, NAME: 1, BRAND: 2, CAT: 3, LIQUID: 4, SERV: 5, PKG: 6,
              KCAL: 7, PROTEIN: 8, CARBS: 9, FAT: 10, FIBER: 11, SUGAR: 12,
              SATFAT: 13, NA: 14, NOVA: 15, ADDITIVES: 16, NUTRISCORE: 17, FLAGS: 18 };
  const NUTRI = ['', 'A', 'B', 'C', 'D', 'E'];

  const CATS = ['Vegetables', 'Fruit', 'Meat & Poultry', 'Fish & Seafood', 'Dairy & Eggs',
    'Grains & Bread', 'Legumes & Soy', 'Nuts & Seeds', 'Fats & Oils', 'Condiments',
    'Drinks', 'Snacks & Sweets', 'Supplements'];

  /** Shard filenames are zero-padded to the width recorded in index.json. */
  function shardFile(i) {
    return String(i).padStart((meta && meta.pad) || 2, '0') + '.json';
  }

  /** Must match the hash used by the build script. */
  function shardOf(code) {
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
    return h % (meta ? meta.shards : 32);
  }

  function info() {
    if (meta) return Promise.resolve(meta);
    if (unavailable) return Promise.resolve(null);
    if (metaPromise) return metaPromise;
    metaPromise = fetch(DIR + 'index.json')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('no pack')))
      .then(j => { meta = j; return j; })
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

    const declared = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satfat', 'na']
      .filter(k => n[k] > 0);

    const unit = row[F.LIQUID] ? 'ml' : 'g';
    const servings = [];
    if (row[F.SERV] > 0) servings.push({ label: 'Portion (' + row[F.SERV] + ' ' + unit + ')', g: row[F.SERV] });
    if (row[F.PKG] > 0 && row[F.PKG] !== row[F.SERV]) {
      servings.push({ label: 'Ganze Packung (' + row[F.PKG] + ' ' + unit + ')', g: row[F.PKG] });
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
      microCount: 0,
      partialMicros: true,
      needsNutrition: false,
      // Quality inputs: processing group, additive count, official Nutri-Score.
      nova: row[F.NOVA] || 0,
      additives: row[F.ADDITIVES] === undefined ? -1 : row[F.ADDITIVES],
      nutriscore: NUTRI[row[F.NUTRISCORE] || 0] || '',
      palmOilFree: !!(flags & 1),
      vegan: !!(flags & 2),
      vegetarian: !!(flags & 4),
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
        const hay = (row[F.NAME] + ' ' + row[F.BRAND]).toLowerCase();
        if (words.every(w => hay.indexOf(w) !== -1)) {
          out.push(toFood(row));
          if (out.length >= max) break;
        }
      }
    }
    return out;
  }

  /** How big the bundled pack is, for the Settings screen. */
  async function stats() {
    const m = await info();
    return m ? { count: m.count, shards: m.shards, built: m.built } : null;
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

  window.LocalPack = { lookup, search, stats, info, toFood, shardOf, download, isDownloaded, DIR };
})();
