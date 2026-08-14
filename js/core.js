/* ==========================================================================
   core.js — global namespace, tiny DOM/format/date helpers, action dispatch
   ========================================================================== */
(function () {
  'use strict';

  const App = window.App = {
    version: '1.0.0',
    state: {
      ready: false,
      tab: 'today',
      date: null,          // 'YYYY-MM-DD' currently shown in the diary
      profile: null,
      targets: null,
      settings: null,
      cache: {}            // per-render scratch space
    },
    views: {},             // view modules register here
    actions: {},           // data-act handlers
    /** Register one or many action handlers. */
    act(name, fn) {
      if (typeof name === 'object') { Object.assign(App.actions, name); return; }
      App.actions[name] = fn;
    }
  };

  /* ----------------------------------------------------------- DOM utils */
  const $  = App.$  = (sel, root) => (root || document).querySelector(sel);
  const $$ = App.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Escape text for safe interpolation into an HTML template string. */
  App.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /** Build an element from an HTML string. */
  App.frag = function (html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content;
  };

  App.icon = (name, cls) =>
    `<svg viewBox="0 0 24 24"${cls ? ` class="${cls}"` : ''}><use href="#i-${name}"/></svg>`;

  /* ------------------------------------------------------------ Numbers */
  const round = App.round = (n, d) => {
    const f = Math.pow(10, d || 0);
    return Math.round((Number(n) || 0) * f) / f;
  };
  App.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  /** Compact number formatting: 1234 -> "1,234", 12.34 -> "12.3" */
  App.n = function (v, dec) {
    const x = Number(v) || 0;
    const d = dec === undefined ? (Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 1) : dec;
    return round(x, d).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
  };
  App.int = v => Math.round(Number(v) || 0).toLocaleString();

  /** Format a nutrient amount with its unit, choosing sensible precision. */
  App.amt = function (v, unit) {
    const x = Number(v) || 0;
    if (unit === 'kcal') return App.int(x);
    if (x >= 100) return App.n(x, 0) + unit;
    if (x >= 10)  return App.n(x, 1) + unit;
    if (x >= 1)   return App.n(x, 1) + unit;
    if (x > 0)    return App.n(x, 2) + unit;
    return '0' + unit;
  };

  App.uid = function (prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  App.pct = (v, target) => (!target || target <= 0) ? 0 : (Number(v) || 0) / target * 100;

  /* -------------------------------------------------------------- Dates */
  const D = App.date = {
    /** Local (not UTC) YYYY-MM-DD key. */
    key(d) {
      const x = d ? new Date(d) : new Date();
      const p = n => String(n).padStart(2, '0');
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
    },
    today() { return D.key(new Date()); },
    /** Parse a YYYY-MM-DD key into a local Date at midnight. */
    parse(key) {
      const [y, m, d] = String(key).split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    },
    add(key, days) {
      const d = D.parse(key);
      d.setDate(d.getDate() + days);
      return D.key(d);
    },
    diff(a, b) { // whole days a - b
      return Math.round((D.parse(a) - D.parse(b)) / 86400000);
    },
    /** Start of week, honouring the Monday/Sunday preference. */
    weekStart(key) {
      const d = D.parse(key);
      const sundayFirst = App.state.settings && App.state.settings.firstDay === 'sun';
      const dow = sundayFirst ? d.getDay() : (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - dow);
      return D.key(d);
    },
    dow(key) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][D.parse(key).getDay()]; },
    dowLong(key) { return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][D.parse(key).getDay()]; },
    month(key) { return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][D.parse(key).getMonth()]; },
    dayNum(key) { return D.parse(key).getDate(); },
    /** "Today" / "Yesterday" / "Mon 14 Apr" */
    label(key) {
      const t = D.today();
      if (key === t) return 'Today';
      if (key === D.add(t, -1)) return 'Yesterday';
      if (key === D.add(t, 1)) return 'Tomorrow';
      const d = D.parse(key);
      const sameYear = d.getFullYear() === new Date().getFullYear();
      return D.dow(key) + ' ' + d.getDate() + ' ' + D.month(key) + (sameYear ? '' : ' ' + d.getFullYear());
    },
    short(key) { return D.dayNum(key) + ' ' + D.month(key); },
    isFuture(key) { return D.diff(key, D.today()) > 0; },
    /** Array of `n` date keys ending at `end` (inclusive). */
    range(end, n) {
      const out = [];
      for (let i = n - 1; i >= 0; i--) out.push(D.add(end, -i));
      return out;
    }
  };

  /* ------------------------------------------------------------- Timing */
  App.debounce = function (fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms || 200); };
  };
  /**
   * Run `fn` after the browser has had a chance to flush styles.
   * Falls back to a timer because rAF never fires while the page is
   * backgrounded — sheets must still wire up their event listeners.
   */
  App.raf = function (fn) {
    let done = false;
    const run = () => { if (done) return; done = true; fn(); };
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 60);
  };
  App.sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ------------------------------------------------------------ Haptics */
  App.haptic = function (kind) {
    if (!navigator.vibrate) return;         // iOS Safari ignores this; harmless elsewhere
    const map = { light: 8, medium: 14, heavy: 22, ok: [8, 40, 12], err: [22, 60, 22] };
    try { navigator.vibrate(map[kind] || 8); } catch (_) {}
  };

  /* --------------------------------------------------- Action delegation */
  function dispatch(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const name = el.dataset.act;
    const fn = App.actions[name];
    if (!fn) return;
    ev.preventDefault();
    try {
      fn(el, ev);
    } catch (err) {
      console.error('[action:' + name + ']', err);
      if (App.toast) App.toast('Something went wrong', 'err');
    }
  }
  document.addEventListener('click', dispatch);

  /* Delegated "change" for selects/inputs that declare data-change */
  document.addEventListener('change', function (ev) {
    const el = ev.target.closest('[data-change]');
    if (!el) return;
    const fn = App.actions[el.dataset.change];
    if (fn) { try { fn(el, ev); } catch (e) { console.error(e); } }
  });

  /* Delegated "input" for live fields that declare data-input */
  document.addEventListener('input', function (ev) {
    const el = ev.target.closest('[data-input]');
    if (!el) return;
    const fn = App.actions[el.dataset.input];
    if (fn) { try { fn(el, ev); } catch (e) { console.error(e); } }
  });

  /* ------------------------------------------------------------- Errors */
  window.addEventListener('error', e => console.error('[window.error]', e.message, e.filename, e.lineno));
  window.addEventListener('unhandledrejection', e => console.error('[unhandled]', e.reason));
})();
