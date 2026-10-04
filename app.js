/* ==========================================================================
   app.js — bootstrap, routing, header, dock, theme, service worker
   ========================================================================== */
(function () {
  'use strict';

  /* Views, and the four tabs they live under. A tab with several views shows
     a segmented control under the large title; the tab remembers which one
     you were on. */
  const VIEWS = ['today', 'diary', 'plan', 'recipes', 'insights', 'trends'];
  const GROUPS = {
    today: ['today'],
    diary: ['diary'],
    plan: ['plan', 'recipes'],
    insights: ['insights', 'trends']
  };
  const SUBNAV = {
    plan: [['plan:week', 'Week', 'plan'], ['plan:shop', 'Shopping', 'cart'], ['recipes', 'Recipes', 'recipes']],
    insights: [['insights', 'Body', 'pulse'], ['trends', 'Trends', 'trends']]
  };
  const groupOf = view => Object.keys(GROUPS).find(g => GROUPS[g].includes(view)) || 'today';
  const lastSub = { plan: 'plan', insights: 'insights' };

  const scrollMem = {};
  let rendering = false;
  const root = document.documentElement;

  /* --------------------------------------------------------------- Theme */
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');

  App.applyTheme = function () {
    const pref = (App.state.settings && App.state.settings.theme) || 'system';
    const dark = pref === 'dark' || (pref === 'system' && mqDark.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    // Keep the iOS status bar tint in step with the app background.
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = dark ? '#05070C' : '#ECEFF5';
    document.head.appendChild(meta);
  };
  mqDark.addEventListener('change', () => {
    if (!App.state.settings || App.state.settings.theme === 'system') App.applyTheme();
  });

  /* ------------------------------------------------------------- Routing */
  App.go = function (target, opts) {
    // A tab name opens the view that tab last showed.
    const view = SUBNAV[target] && GROUPS[target] && !(opts && opts.exact) ? (lastSub[target] || target) : target;
    if (!VIEWS.includes(view) || !App.state.ready) return;
    const prev = App.state.tab;
    if (prev === view && !(opts && opts.force)) {
      // Tapping the active tab scrolls back to the top.
      const cur = App.$('#view-' + view);
      if (cur) cur.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const prevEl = App.$('#view-' + prev);
    if (prevEl) scrollMem[prev] = prevEl.scrollTop;

    App.state.tab = view;
    const g = groupOf(view);
    if (SUBNAV[g]) lastSub[g] = view;
    showView(view);
    App.haptic('light');
    return App.refresh({ animate: true, restore: true });
  };

  function showView(view) {
    VIEWS.forEach(k => {
      const el = App.$('#view-' + k);
      if (el) el.hidden = k !== view;
    });
    const g = groupOf(view);
    App.$$('#tabbar .tab').forEach(b => {
      const on = b.dataset.tab === g;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    moveLens();
  }

  /** Slide the glass lens under the active tab. */
  function moveLens() {
    const lens = App.$('#tabbar .tab-lens');
    const tab = App.$('#tabbar .tab.is-active');
    if (!lens || !tab) return;
    lens.style.width = tab.offsetWidth + 'px';
    lens.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
  }

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
    updateHeaderState(el);
  };

  function updateAppbar(view) {
    const title = typeof view.title === 'function' ? view.title() : (view.title || '');
    App.$('#appbar-title').textContent = title;
    App.$('#appbar-compact').textContent = title;
    const sub = App.$('#appbar-sub');
    const s = typeof view.sub === 'function' ? view.sub() : view.sub;
    sub.textContent = s || '';
    sub.hidden = !s;
    App.$('#appbar-actions').innerHTML =
      typeof view.actions === 'function' ? (view.actions() || '') : (view.actions || '');

    const g = groupOf(App.state.tab);
    const nav = App.$('#subnav');
    if (SUBNAV[g]) {
      // A view with halves (the planner) reports which one is showing via part().
      const cur = App.views[App.state.tab] && App.views[App.state.tab].part
        ? App.state.tab + ':' + App.views[App.state.tab].part() : App.state.tab;
      nav.innerHTML = `<div class="segmented glass" role="tablist">${SUBNAV[g].map(([v, label, icon]) =>
        `<button type="button" role="tab" data-subnav="${v}" aria-selected="${v === cur}"
           class="${v === cur ? 'on' : ''}">${App.icon(icon)}${label}</button>`).join('')}</div>`;
      nav.hidden = false;
    } else {
      nav.innerHTML = '';
      nav.hidden = true;
    }
    measureHeader();
  }

  /** Content starts below the expanded header, whatever it holds right now. */
  function measureHeader() {
    const bar = App.$('#appbar');
    const was = bar.classList.contains('scrolled');
    if (was) bar.classList.remove('scrolled');
    const large = bar.querySelector('.appbar-large');
    const prev = large.style.transition;
    large.style.transition = 'none';
    const h = bar.offsetHeight;
    large.style.transition = prev;
    if (was) bar.classList.add('scrolled');
    root.style.setProperty('--header-h', h + 'px');
  }

  function updateHeaderState(el) {
    App.$('#appbar').classList.toggle('scrolled', el.scrollTop > 10);
  }

  /* Subnav ids are "view" or "view:part" (the planner's week / shopping halves). */
  App.$('#subnav').addEventListener('click', ev => {
    const b = ev.target.closest('[data-subnav]');
    if (!b) return;
    const [view, part] = b.dataset.subnav.split(':');
    if (part && App.views[view] && App.views[view].part) App.views[view].part(part);
    App.go(view, { exact: true, force: true });
  });

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
    showView(App.state.tab);

    await App.refresh({ animate: true });
    hideBoot();
    App.raf(moveLens);

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

  /** Support manifest shortcuts: ?tab=plan, ?action=log|scan|weight */
  function handleLaunchParams() {
    const q = new URLSearchParams(location.search);
    const tab = q.get('tab');
    const action = q.get('action');
    if (tab) {
      const view = tab === 'recipes' || tab === 'trends' ? tab : (GROUPS[tab] ? (lastSub[tab] || tab) : null);
      if (view) App.state.tab = view;
    }

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
  App.activeDate = activeDate;

  App.$('#orb').addEventListener('click', () => {
    if (!App.state.ready) return;
    Scanner.scanAndAdd({ mode: 'diary', date: activeDate(), meal: guessMeal() });
  });

  /* Shared header action: add food to the day on screen. */
  App.actions['add-food-now'] = () => {
    if (!App.state.ready) return;
    FoodSheet.open({ mode: 'diary', date: activeDate(), meal: guessMeal() });
  };

  App.$('#views').addEventListener('scroll', ev => {
    if (ev.target.classList && ev.target.classList.contains('view')) updateHeaderState(ev.target);
  }, true);

  window.addEventListener('resize', () => { measureHeader(); moveLens(); });

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

  /* ---------------------------------------------------- Back gesture */
  /* While any sheet is open there is exactly one extra history entry. The
     back gesture closes the top sheet; closing the last sheet by any other
     means consumes that entry, so history never grows with use. */
  let guard = false;        // our entry is on the stack
  let ownPops = 0;          // history.back() calls we made ourselves
  history.replaceState({ eaty: 0 }, '');

  window.addEventListener('popstate', () => {
    if (ownPops > 0) { ownPops--; return; }
    if (!guard) return;
    guard = false;
    UI.closeTop();
    if (UI.openCount) { history.pushState({ eaty: 1 }, ''); guard = true; }
  });

  const origSheet = UI.sheet;
  UI.sheet = function (cfg) {
    if (!guard) { history.pushState({ eaty: 1 }, ''); guard = true; }
    const userClose = cfg && cfg.onClose;
    return origSheet(Object.assign({}, cfg, {
      onClose(result) {
        if (userClose) userClose(result);
        // Wait a tick: a flow that closes one sheet to open the next keeps the entry.
        setTimeout(() => {
          if (!UI.openCount && guard) { guard = false; ownPops++; history.back(); }
        }, 0);
      }
    }));
  };
  App.historyGuard = () => ({ guard, ownPops, length: history.length });

  /* --------------------------------------------------- Keyboard (iOS) */
  /* iOS overlays the keyboard instead of resizing the page; lift floating
     sheets and the toast above it and tuck the dock away. */
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const onVV = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const open = kb > 80;
      root.style.setProperty('--kb', open ? kb + 'px' : '0px');
      document.body.classList.toggle('kb-open', open);
    };
    vv.addEventListener('resize', onVV);
    vv.addEventListener('scroll', onVV);
  }

  /* ------------------------------------------------------ Haptics */
  /* Android vibrates; iOS 18+ plays a system haptic when a native switch
     control is toggled, so a hidden one is flipped inside the user's tap. */
  const hapticSwitch = App.$('#haptic-switch');
  App.haptic = function (kind) {
    if (navigator.vibrate) {
      // Browsers refuse vibration before the first tap, and log an error for trying.
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      const map = { light: 8, medium: 14, heavy: 22, ok: [8, 40, 12], err: [22, 60, 22] };
      try { navigator.vibrate(map[kind] || 8); } catch (_) {}
      return;
    }
    if (hapticSwitch) {
      try {
        hapticSwitch.click();
        if (kind === 'ok' || kind === 'err') setTimeout(() => hapticSwitch.click(), 90);
      } catch (_) {}
    }
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
  // is already handled by `touch-action: manipulation`.
  document.addEventListener('gesturestart', e => e.preventDefault());

  // Stop the whole page rubber-banding while still allowing inner scrollers.
  const SCROLLABLE = '.view, .sheet-body, .chips, .datestrip, .quick-pills, textarea, .onboard-body, .pick-grid, .serv-chips';
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
