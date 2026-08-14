/* ==========================================================================
   app.js — bootstrap, routing, theme, service worker, install prompt
   ========================================================================== */
(function () {
  'use strict';

  const TABS = ['today', 'diary', 'recipes', 'plan', 'trends'];
  const scrollMem = {};
  let rendering = false;

  /* --------------------------------------------------------------- Theme */
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');

  App.applyTheme = function () {
    const pref = (App.state.settings && App.state.settings.theme) || 'system';
    const dark = pref === 'dark' || (pref === 'system' && mqDark.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    // Keep the iOS status bar tint in step with the app background.
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = dark ? '#0A0E17' : '#F2F5F9';
    document.head.appendChild(meta);
  };
  mqDark.addEventListener('change', () => {
    if (!App.state.settings || App.state.settings.theme === 'system') App.applyTheme();
  });

  /* ------------------------------------------------------------- Routing */
  App.go = function (tab, opts) {
    if (!TABS.includes(tab)) return;
    const prev = App.state.tab;
    if (prev === tab && !(opts && opts.force)) {
      // Tapping the active tab scrolls back to the top.
      const cur = App.$('#view-' + tab);
      if (cur) cur.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const prevEl = App.$('#view-' + prev);
    if (prevEl) scrollMem[prev] = prevEl.scrollTop;

    App.state.tab = tab;
    TABS.forEach(k => {
      const el = App.$('#view-' + k);
      if (el) el.hidden = k !== tab;
    });
    App.$$('#tabbar .tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
    App.haptic('light');
    return App.refresh({ animate: true, restore: true });
  };

  /** Re-render the active view. */
  App.refresh = async function (opts) {
    const o = opts || {};
    const tab = App.state.tab;
    const view = App.views[tab];
    const el = App.$('#view-' + tab);
    if (!view || !el || rendering) return;

    rendering = true;
    const keepScroll = o.restore ? (scrollMem[tab] || 0) : el.scrollTop;
    try {
      updateAppbar(view);
      await view.render(el);
    } catch (err) {
      console.error('[render:' + tab + ']', err);
      el.innerHTML = `<div class="card"><div class="empty">
        <div class="ic">${App.icon('info')}</div>
        <h3>Something went wrong</h3>
        <p>${App.esc(err && err.message || 'This screen could not be drawn.')}</p>
        <button class="btn ghost mt8" type="button" onclick="location.reload()">Reload</button>
      </div></div>`;
    } finally {
      rendering = false;
    }

    if (o.animate) {
      el.classList.remove('enter');
      void el.offsetWidth;
      el.classList.add('enter');
    }
    el.scrollTop = keepScroll;
    updateAppbarShadow(el);
  };

  function updateAppbar(view) {
    App.$('#appbar-title').textContent =
      typeof view.title === 'function' ? view.title() : (view.title || '');
    const sub = App.$('#appbar-sub');
    const s = typeof view.sub === 'function' ? view.sub() : view.sub;
    sub.textContent = s || '';
    sub.hidden = !s;
    App.$('#appbar-actions').innerHTML =
      typeof view.actions === 'function' ? (view.actions() || '') : (view.actions || '');
  }

  function updateAppbarShadow(el) {
    App.$('#appbar').classList.toggle('scrolled', el.scrollTop > 4);
  }

  /* --------------------------------------------------------------- Boot */
  App.boot = async function (isReload) {
    await Data.DB.init();

    const profile = await Data.profile();
    App.state.settings = await Data.settings();
    App.applyTheme();

    if (!profile) {
      hideBoot();
      App.onboarding.start();
      return;
    }

    App.state.profile = profile;
    App.state.targets = Nutrition.targets(profile);
    App.state.date = App.state.date || App.date.today();
    App.state.customFoods = await Data.customFoods();
    App.state.recipesCache = await Data.recipes();
    App.state.ready = true;

    if (!isReload) handleLaunchParams();

    await App.refresh({ animate: true });
    hideBoot();

    requestPersistence();
    pruneStaleFoods();
  };

  /**
   * Ask the browser to keep this data. Without it, iOS may clear a web app's
   * storage after about a week of not being opened — which for a food diary
   * means losing months of logging with no warning.
   */
  async function requestPersistence() {
    if (!navigator.storage || !navigator.storage.persist) return;
    try {
      if (await navigator.storage.persisted()) { App.state.persisted = true; return; }
      App.state.persisted = await navigator.storage.persist();
      if (navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        App.state.quota = est;
      }
    } catch (_) { /* not supported — the backup nudge is the safety net */ }
  }

  /**
   * Scanned products accumulate forever and are concatenated into the search
   * index on every keystroke. Drop ones nobody kept: not favourited, not in a
   * recipe, not logged, untouched for 120 days.
   */
  async function pruneStaleFoods() {
    try {
      const foods = await Data.customFoods();
      if (foods.length < 400) return;

      const cutoff = Date.now() - 120 * 86400000;
      const stale = foods.filter(f => f.source && (f.fetchedAt || 0) < cutoff);
      if (!stale.length) return;

      const [entries, recipes, favs] = await Promise.all([
        Data.allEntries(), Data.recipes(), Data.favorites()
      ]);
      const keep = new Set();
      entries.forEach(e => e.refId && keep.add(e.refId));
      recipes.forEach(r => (r.ingredients || []).forEach(i => i.refId && keep.add(i.refId)));
      favs.forEach(f => keep.add(String(f.id).replace(/^food:/, '')));

      let removed = 0;
      for (const f of stale) {
        if (keep.has(f.id)) continue;
        await Data.deleteFood(f.id);
        removed++;
      }
      if (removed) {
        App.state.customFoods = await Data.customFoods();
        console.info('[eaty] pruned ' + removed + ' unused scanned products');
      }
    } catch (e) { console.warn('prune failed', e); }
  }

  function hideBoot() {
    const boot = App.$('#boot');
    if (boot && !boot.classList.contains('done')) {
      boot.classList.add('done');
      setTimeout(() => boot.remove(), 500);
    }
  }

  /** Support manifest shortcuts: ?tab=plan, ?action=log|weight */
  function handleLaunchParams() {
    const q = new URLSearchParams(location.search);
    const tab = q.get('tab');
    const action = q.get('action');
    if (tab && TABS.includes(tab)) App.state.tab = tab;

    if (action) {
      setTimeout(() => {
        if (action === 'log') {
          FoodSheet.open({ mode: 'diary', date: App.date.today(), meal: guessMeal() });
        } else if (action === 'scan') {
          Scanner.scanAndAdd({ mode: 'diary', date: App.date.today(), meal: guessMeal() });
        } else if (action === 'weight') {
          App.actions['log-weight']();
        }
      }, 480);
    }
    if (tab || action) history.replaceState(null, '', location.pathname);

    TABS.forEach(k => {
      const el = App.$('#view-' + k);
      if (el) el.hidden = k !== App.state.tab;
    });
    App.$$('#tabbar .tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === App.state.tab));
  }

  function guessMeal() {
    const h = new Date().getHours();
    if (h < 10.5) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 21) return 'dinner';
    return 'snacks';
  }
  App.guessMeal = guessMeal;

  /* ------------------------------------------------------------ Listeners */
  App.$$('#tabbar .tab').forEach(btn => {
    btn.addEventListener('click', () => App.go(btn.dataset.tab));
  });

  const activeDate = () => (App.state.tab === 'diary' ? App.state.date : App.date.today());

  App.$('#fab').addEventListener('click', () => {
    if (!App.state.ready) return;
    FoodSheet.open({ mode: 'diary', date: activeDate(), meal: guessMeal() });
  });

  App.$('#fab-scan').addEventListener('click', () => {
    if (!App.state.ready) return;
    Scanner.scanAndAdd({ mode: 'diary', date: activeDate(), meal: guessMeal() });
  });

  App.$('#views').addEventListener('scroll', ev => {
    if (ev.target.classList.contains('view')) updateAppbarShadow(ev.target);
  }, true);

  /* Roll the diary over to the new day if the app was left open overnight. */
  let lastSeen = App.date.today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !App.state.ready) return;
    const now = App.date.today();
    if (now !== lastSeen) {
      lastSeen = now;
      if (App.state.date === App.date.add(now, -1) || App.state.tab === 'today') {
        App.state.date = now;
      }
      App.refresh();
    }
  });

  /* Close the top sheet with the hardware/browser back gesture. */
  history.replaceState({ eaty: 0 }, '');
  window.addEventListener('popstate', () => {
    if (UI.openCount) {
      UI.closeTop();
      history.pushState({ eaty: 1 }, '');
    }
  });
  const origSheet = UI.sheet;
  UI.sheet = function (cfg) {
    history.pushState({ eaty: 1 }, '');
    return origSheet(cfg);
  };

  /* ------------------------------------------------------ Install prompt */
  App.installPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    App.installPrompt = e;
  });
  window.addEventListener('appinstalled', () => {
    App.installPrompt = null;
    UI.toast('Eaty installed', 'ok');
  });

  /* ------------------------------------------------------ Service worker */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              UI.toast('Update ready', 'ok', {
                label: 'Reload',
                onClick: () => { sw.postMessage({ type: 'SKIP_WAITING' }); location.reload(); }
              });
            }
          });
        });
      }).catch(err => console.warn('SW registration failed', err));
    });
  }

  /* --------------------------------------------------- iOS gesture guards */
  // Block pinch-zoom, which fights with the sheet drag gesture. Double-tap zoom
  // is already handled by `touch-action: manipulation` — intercepting touchend
  // here would swallow the synthetic click on rapid taps (steppers, +250 ml).
  document.addEventListener('gesturestart', e => e.preventDefault());

  // Stop the whole page rubber-banding while still allowing inner scrollers.
  const SCROLLABLE = '.view, .sheet-body, .chips, .datestrip, .quick-pills, textarea, .onboard-body, .pick-grid';
  document.addEventListener('touchmove', e => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function' || !t.closest(SCROLLABLE)) {
      e.preventDefault();
    }
  }, { passive: false });

  /* ---------------------------------------------------------------- Start */
  App.boot().catch(err => {
    console.error('boot failed', err);
    hideBoot();
    document.body.insertAdjacentHTML('beforeend',
      `<div style="position:fixed;inset:0;display:grid;place-items:center;padding:28px;background:var(--bg);z-index:400">
         <div style="text-align:center;max-width:34ch">
           <h2 style="font-size:19px;margin-bottom:8px">Eaty could not start</h2>
           <p style="font-size:14px;color:var(--tx-2);line-height:1.5">${App.esc(err && err.message || 'Unknown error')}</p>
           <button class="btn primary mt16" onclick="location.reload()">Try again</button>
         </div>
       </div>`);
  });
})();
