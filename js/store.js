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

  /* --------------------------------------------------------- import guard
     A backup file is untrusted input: it may be hand-edited, truncated, or
     shared by someone else. IDs and dates from it end up inside HTML
     attributes, and numbers get printed raw, so both are checked here — the one
     place where values that App.uid() did not generate can enter storage. */
  const SAFE_ID = /^[A-Za-z0-9_.:\-]{1,96}$/;
  const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
  const DATED = { weights: 1, days: 1, plans: 1, shopping: 1 };
  const IMG_DATA = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/;
  const num = (v, d) => { const x = Number(v); return isFinite(x) ? x : (d === undefined ? 0 : d); };

  function sanitizeNutrients(n) {
    if (!n || typeof n !== 'object') return n;
    const out = {};
    Object.keys(n).forEach(k => { out[k] = num(n[k]); });
    return out;
  }

  function sanitizeRow(store, r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const kp = SCHEMA[store].keyPath;
    const key = r[kp];
    if (typeof key !== 'string' || !SAFE_ID.test(key)) return null;
    if (DATED[store] && !DATE_KEY.test(key)) return null;
    if ((store === 'entries' || store === 'workouts') && !DATE_KEY.test(String(r.date))) return null;

    const row = Object.assign({}, r);
    if ('refId' in row && row.refId !== null && !(typeof row.refId === 'string' && SAFE_ID.test(row.refId))) {
      row.refId = null;
    }
    if (row.n) row.n = sanitizeNutrients(row.n);

    switch (store) {
      case 'entries':
        row.qty = num(row.qty, 1); row.grams = num(row.grams);
        break;
      case 'workouts':
        row.minutes = num(row.minutes); row.kcal = num(row.kcal);
        break;
      case 'weights':
        row.kg = num(row.kg, NaN);
        if (!isFinite(row.kg) || row.kg <= 0) return null;
        break;
      case 'recipes':
        row.servings = Math.max(1, num(row.servings, 1));
        row.minutes = Math.max(0, num(row.minutes));
        if (row.image && !IMG_DATA.test(String(row.image))) row.image = '';
        if (Array.isArray(row.ingredients)) {
          row.ingredients = row.ingredients.map(i => Object.assign({}, i, {
            grams: num(i && i.grams),
            refId: i && typeof i.refId === 'string' && SAFE_ID.test(i.refId) ? i.refId : null,
            n100: sanitizeNutrients(i && i.n100)
          }));
        }
        break;
      case 'foods':
        if (row.image && !/^https:\/\//.test(String(row.image))) row.image = '';
        if (Array.isArray(row.servings)) {
          row.servings = row.servings.map(sv => ({ label: String(sv && sv.label || ''), g: num(sv && sv.g, 100) }));
        }
        break;
      case 'kv':
        if (row.k === 'profile' && row.v && typeof row.v === 'object') {
          ['age', 'height', 'weight', 'targetWeight', 'startWeight'].forEach(k => {
            if (row.v[k] !== undefined && row.v[k] !== null) row.v[k] = num(row.v[k], null);
          });
        }
        if (row.k === 'settings' && row.v && typeof row.v === 'object') {
          if (['system', 'dark', 'light'].indexOf(row.v.theme) === -1) row.v.theme = 'system';
          if (['mon', 'sun'].indexOf(row.v.firstDay) === -1) row.v.firstDay = 'mon';
        }
        break;
    }
    return row;
  }

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
        addExercise: true,
        estimateMicros: true
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
      const SECRET_SETTINGS = ['fdcKey', 'claudeKey'];
      const out = { app: 'eaty', version: App.version, exportedAt: new Date().toISOString(), data: {} };
      for (const store of Object.keys(SCHEMA)) out.data[store] = await DB.getAll(store);
      // API keys are credentials, not data: a backup gets shared and synced.
      if (out.data.kv) {
        out.data.kv = out.data.kv.map(r => {
          if (!r || r.k !== 'settings' || !r.v) return r;
          const v = Object.assign({}, r.v);
          SECRET_SETTINGS.forEach(k => delete v[k]);
          return Object.assign({}, r, { v });
        });
      }
      return out;
    },
    async importAll(payload, mode) {
      if (!payload || typeof payload !== 'object' || !payload.data) throw new Error('Not an Eaty backup file');

      // Validate everything first. Only then touch storage — "replace" used to
      // wipe every store before looking at the file, so a truncated backup
      // meant losing the lot.
      const clean = {};
      let n = 0, dropped = 0;
      for (const store of Object.keys(SCHEMA)) {
        const rows = payload.data[store];
        if (!Array.isArray(rows)) continue;
        clean[store] = [];
        for (const r of rows) {
          const ok = sanitizeRow(store, r);
          if (ok) { clean[store].push(ok); n++; } else dropped++;
        }
      }
      if (!n) throw new Error('That backup contains no usable records');

      // Backups carry no API keys; keep the ones already on this device.
      const current = await Data.settings();
      const keep = {};
      ['fdcKey', 'claudeKey'].forEach(k => { if (current[k]) keep[k] = current[k]; });
      if (clean.kv) clean.kv = clean.kv.map(r => (r && r.k === 'settings' && r.v)
        ? Object.assign({}, r, { v: Object.assign({}, r.v, keep) }) : r);

      if (mode === 'replace') {
        for (const store of Object.keys(SCHEMA)) await DB.clear(store);
        if (Object.keys(keep).length && !(clean.kv || []).some(r => r && r.k === 'settings')) {
          (clean.kv = clean.kv || []).push({ k: 'settings', v: Object.assign({}, current) });
        }
      }
      for (const store of Object.keys(clean)) {
        if (clean[store].length) await DB.bulkPut(store, clean[store]);
      }
      Object.keys(cache).forEach(k => delete cache[k]);
      if (dropped) console.warn('[import] skipped ' + dropped + ' malformed records');
      return n;
    },
    async resetAll() {
      for (const store of Object.keys(SCHEMA)) await DB.clear(store);
      Object.keys(cache).forEach(k => delete cache[k]);
    },

    invalidate,
    sanitizeRow,
    async stats() {
      const out = {};
      for (const s of Object.keys(SCHEMA)) out[s] = await DB.count(s);
      return out;
    }
  };
})();
