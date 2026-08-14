/* ==========================================================================
   store.js — IndexedDB persistence (with a LocalStorage fallback shim)
   All user data lives on-device. Nothing is ever sent anywhere.
   ========================================================================== */
(function () {
  'use strict';

  const DB_NAME = 'eaty';
  const DB_VER  = 1;

  /** store name -> { keyPath, indexes: [[name, keyPath]] } */
  const SCHEMA = {
    kv:        { keyPath: 'k' },
    entries:   { keyPath: 'id',   indexes: [['date', 'date']] },
    foods:     { keyPath: 'id' },                                  // user-created foods
    recipes:   { keyPath: 'id' },
    plans:     { keyPath: 'week' },
    shopping:  { keyPath: 'week' },
    weights:   { keyPath: 'date' },
    workouts:  { keyPath: 'id',   indexes: [['date', 'date']] },
    days:      { keyPath: 'date' },                                // water, notes, mood
    favorites: { keyPath: 'id' },
    recents:   { keyPath: 'id' }
  };

  /* ------------------------------------------------------- LS fallback */
  function LocalShim() {
    const mem = {};
    const load = s => {
      if (mem[s]) return mem[s];
      try { mem[s] = JSON.parse(localStorage.getItem('eaty.' + s) || '{}'); }
      catch (_) { mem[s] = {}; }
      return mem[s];
    };
    const save = s => {
      try { localStorage.setItem('eaty.' + s, JSON.stringify(mem[s])); }
      catch (e) { console.warn('localStorage full', e); }
    };
    return {
      isFallback: true,
      open: () => Promise.resolve(),
      get: (s, k) => Promise.resolve(load(s)[k] ?? null),
      getAll: s => Promise.resolve(Object.values(load(s))),
      put: (s, v) => { const o = load(s); o[v[SCHEMA[s].keyPath]] = v; save(s); return Promise.resolve(v); },
      bulkPut: (s, arr) => { const o = load(s); arr.forEach(v => o[v[SCHEMA[s].keyPath]] = v); save(s); return Promise.resolve(); },
      del: (s, k) => { const o = load(s); delete o[k]; save(s); return Promise.resolve(); },
      clear: s => { mem[s] = {}; save(s); return Promise.resolve(); },
      byIndex: (s, idx, val) => Promise.resolve(Object.values(load(s)).filter(r => r[idx] === val)),
      byRange: (s, idx, lo, hi) => Promise.resolve(
        Object.values(load(s)).filter(r => r[idx] >= lo && r[idx] <= hi)),
      distinct: (s, idx) => Promise.resolve(
        Array.from(new Set(Object.values(load(s)).map(r => r[idx]))).sort()),
      count: s => Promise.resolve(Object.keys(load(s)).length)
    };
  }

  /* ---------------------------------------------------------- IndexedDB */
  function IdbDriver() {
    let db = null;

    function open() {
      if (db) return Promise.resolve(db);
      return new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open(DB_NAME, DB_VER); }
        catch (e) { return reject(e); }

        req.onupgradeneeded = ev => {
          const d = ev.target.result;
          Object.keys(SCHEMA).forEach(name => {
            if (d.objectStoreNames.contains(name)) return;
            const cfg = SCHEMA[name];
            const os = d.createObjectStore(name, { keyPath: cfg.keyPath });
            (cfg.indexes || []).forEach(([iname, ipath]) => os.createIndex(iname, ipath, { unique: false }));
          });
        };
        req.onsuccess = () => {
          db = req.result;
          db.onversionchange = () => { db.close(); db = null; };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
      });
    }

    function tx(store, mode) {
      return open().then(d => {
        const t = d.transaction(store, mode || 'readonly');
        return t.objectStore(store);
      });
    }

    const wrap = req => new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    return {
      isFallback: false,
      open,
      get:    (s, k) => tx(s).then(o => wrap(o.get(k))).then(r => r === undefined ? null : r),
      getAll: s => tx(s).then(o => wrap(o.getAll())),
      put:    (s, v) => tx(s, 'readwrite').then(o => wrap(o.put(v))).then(() => v),
      del:    (s, k) => tx(s, 'readwrite').then(o => wrap(o.delete(k))),
      clear:  s => tx(s, 'readwrite').then(o => wrap(o.clear())),
      count:  s => tx(s).then(o => wrap(o.count())),
      byIndex: (s, idx, val) => tx(s).then(o => wrap(o.index(idx).getAll(val))),
      /** Records whose indexed value falls in [lo, hi] — no full-table scan. */
      byRange: (s, idx, lo, hi) =>
        tx(s).then(o => wrap(o.index(idx).getAll(IDBKeyRange.bound(lo, hi)))),
      /**
       * Distinct values held in an index, read with a key-only cursor so no
       * record bodies are deserialised. Used for "which days have entries".
       */
      distinct: (s, idx) => tx(s).then(o => new Promise((res, rej) => {
        const out = [];
        const req = o.index(idx).openKeyCursor(null, 'nextunique');
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return res(out);
          out.push(c.key);
          c.continue();
        };
        req.onerror = () => rej(req.error);
      })),
      bulkPut(s, arr) {
        if (!arr.length) return Promise.resolve();
        return open().then(d => new Promise((res, rej) => {
          const t = d.transaction(s, 'readwrite');
          const os = t.objectStore(s);
          arr.forEach(v => os.put(v));
          t.oncomplete = () => res();
          t.onerror = () => rej(t.error);
          t.onabort = () => rej(t.error);
        }));
      }
    };
  }

  let driver = null;
  const DB = {
    async init() {
      if (driver) return driver;
      if ('indexedDB' in window) {
        const idb = IdbDriver();
        try { await idb.open(); driver = idb; return driver; }
        catch (e) { console.warn('IndexedDB unavailable, falling back to localStorage:', e); }
      }
      driver = LocalShim();
      return driver;
    },
    get isFallback() { return driver ? driver.isFallback : false; }
  };
  ['get', 'getAll', 'put', 'del', 'clear', 'count',
   'byIndex', 'byRange', 'distinct', 'bulkPut'].forEach(m => {
    DB[m] = (...a) => DB.init().then(d => d[m](...a));
  });

  /* ====================================================================
     Data — the app-level API used by views
     ==================================================================== */
  const cache = {};
  const invalidate = keys => (Array.isArray(keys) ? keys : [keys]).forEach(k => delete cache[k]);

  const Data = window.Data = {
    DB,

    /* ---------------------------------------------------------- profile */
    async profile() {
      if (cache.profile !== undefined) return cache.profile;
      const rec = await DB.get('kv', 'profile');
      cache.profile = rec ? rec.v : null;
      return cache.profile;
    },
    async saveProfile(p) {
      await DB.put('kv', { k: 'profile', v: p });
      cache.profile = p;
      return p;
    },

    /* --------------------------------------------------------- settings */
    async settings() {
      if (cache.settings !== undefined) return cache.settings;
      const rec = await DB.get('kv', 'settings');
      cache.settings = Object.assign({
        theme: 'system',
        firstDay: 'mon',
        showMicros: true,
        waterUnit: 'ml',
        installDismissed: false
      }, rec ? rec.v : {});
      return cache.settings;
    },
    async saveSettings(patch) {
      const s = Object.assign(await Data.settings(), patch);
      await DB.put('kv', { k: 'settings', v: s });
      cache.settings = s;
      return s;
    },

    /* ------------------------------------------------------ diary entries
       entry: { id, date, meal, foodId|recipeId, name, grams, servingLabel,
                servingGrams, qty, n:{...}, custom?, ts } */
    entriesFor(date) { return DB.byIndex('entries', 'date', date); },
    /** Indexed range query — never touches entries outside the window. */
    entriesBetween(from, to) { return DB.byRange('entries', 'date', from, to); },
    /** Dates holding at least one entry, read key-only. Used for streaks. */
    loggedDates() { return DB.distinct('entries', 'date'); },
    allEntries() { return DB.getAll('entries'); },
    saveEntry(e) { return DB.put('entries', e); },
    deleteEntry(id) { return DB.del('entries', id); },
    bulkEntries(arr) { return DB.bulkPut('entries', arr); },

    /* ------------------------------------------------------------- days */
    async day(date) {
      const d = await DB.get('days', date);
      return d || { date, water: 0, note: '' };
    },
    saveDay(d) { return DB.put('days', d); },
    allDays() { return DB.getAll('days'); },

    /* ----------------------------------------------------- custom foods */
    async customFoods() {
      if (cache.customFoods) return cache.customFoods;
      cache.customFoods = await DB.getAll('foods');
      return cache.customFoods;
    },
    async saveFood(f) { await DB.put('foods', f); invalidate('customFoods'); return f; },
    async deleteFood(id) { await DB.del('foods', id); invalidate('customFoods'); },

    /* ---------------------------------------------------------- recipes */
    async recipes() {
      if (cache.recipes) return cache.recipes;
      cache.recipes = await DB.getAll('recipes');
      return cache.recipes;
    },
    async recipe(id) { return DB.get('recipes', id); },
    async saveRecipe(r) { await DB.put('recipes', r); invalidate('recipes'); return r; },
    async deleteRecipe(id) { await DB.del('recipes', id); invalidate('recipes'); },

    /* ------------------------------------------------------------ plans */
    async plan(week) {
      const p = await DB.get('plans', week);
      return p || { week, slots: {} };   // slots: { 'YYYY-MM-DD|meal': [items] }
    },
    savePlan(p) { return DB.put('plans', p); },
    allPlans() { return DB.getAll('plans'); },

    async shopping(week) {
      const s = await DB.get('shopping', week);
      return s || { week, items: [], generatedAt: 0 };
    },
    saveShopping(s) { return DB.put('shopping', s); },

    /* ---------------------------------------------------------- weights */
    async weights() {
      const all = await DB.getAll('weights');
      return all.sort((a, b) => a.date < b.date ? -1 : 1);
    },
    saveWeight(w) { return DB.put('weights', w); },
    deleteWeight(date) { return DB.del('weights', date); },

    /* --------------------------------------------------------- workouts */
    workoutsFor(date) { return DB.byIndex('workouts', 'date', date); },
    allWorkouts() { return DB.getAll('workouts'); },
    workoutsBetween(from, to) { return DB.byRange('workouts', 'date', from, to); },
    saveWorkout(w) { return DB.put('workouts', w); },
    deleteWorkout(id) { return DB.del('workouts', id); },

    /* -------------------------------------------------- favourites/recents */
    async favorites() {
      if (cache.favorites) return cache.favorites;
      cache.favorites = await DB.getAll('favorites');
      return cache.favorites;
    },
    async isFav(id) { return !!(await Data.favorites()).find(f => f.id === id); },
    async toggleFav(id, meta) {
      const favs = await Data.favorites();
      const found = favs.find(f => f.id === id);
      if (found) { await DB.del('favorites', id); invalidate('favorites'); return false; }
      await DB.put('favorites', Object.assign({ id, ts: Date.now() }, meta || {}));
      invalidate('favorites');
      return true;
    },

    async recents() {
      const r = await DB.getAll('recents');
      return r.sort((a, b) => b.ts - a.ts);
    },
    async pushRecent(rec) {
      await DB.put('recents', Object.assign({}, rec, { ts: Date.now() }));
      const all = await DB.getAll('recents');
      if (all.length > 60) {
        const old = all.sort((a, b) => b.ts - a.ts).slice(60);
        for (const o of old) await DB.del('recents', o.id);
      }
    },

    /* ------------------------------------------------------ import/export */
    async exportAll() {
      const out = { app: 'eaty', version: App.version, exportedAt: new Date().toISOString(), data: {} };
      for (const store of Object.keys(SCHEMA)) out.data[store] = await DB.getAll(store);
      return out;
    },
    async importAll(payload, mode) {
      if (!payload || !payload.data) throw new Error('Not an Eaty backup file');
      if (mode === 'replace') {
        for (const store of Object.keys(SCHEMA)) await DB.clear(store);
      }
      let n = 0;
      for (const store of Object.keys(SCHEMA)) {
        const rows = payload.data[store];
        if (!Array.isArray(rows) || !rows.length) continue;
        // Drop rows missing their key so a corrupt file can't abort the transaction.
        const kp = SCHEMA[store].keyPath;
        const valid = rows.filter(r => r && r[kp] !== undefined && r[kp] !== null);
        await DB.bulkPut(store, valid);
        n += valid.length;
      }
      Object.keys(cache).forEach(k => delete cache[k]);
      return n;
    },
    async resetAll() {
      for (const store of Object.keys(SCHEMA)) await DB.clear(store);
      Object.keys(cache).forEach(k => delete cache[k]);
    },

    invalidate,
    async stats() {
      const out = {};
      for (const s of Object.keys(SCHEMA)) out[s] = await DB.count(s);
      return out;
    }
  };
})();
