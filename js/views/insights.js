/* ==========================================================================
   views/insights.js — what the day's food is doing to your body

   The daily physiology summary (caffeine, free sugar, glycemic load, omega-3,
   iodine, salt, processing …) against official reference amounts, the foods
   that drove each signal, and every food-level effect from what was eaten.
   ========================================================================== */
(function () {
  'use strict';

  let date = null;

  /* Which nutrient key explains each daily signal, for the "driven by" list. */
  const DRIVER = {
    caffeine: 'caffeine', freesugar: 'freesugar', fiber: 'fiber', salt: 'na', satfat: 'satfat',
    omega3: 'epadha', nitrate: 'nitrate', iodine: 'iodine', alcohol: 'alcohol', licorice: 'glycyrrhizin',
    isoflavones: 'isoflavones', gl: 'gl', protein: 'protein', kna: 'k'
  };
  const UNIT = { caffeine: 'mg', freesugar: 'g', fiber: 'g', na: 'mg', satfat: 'g', epadha: 'mg', nitrate: 'mg',
    iodine: 'µg', alcohol: 'g', glycyrrhizin: 'mg', isoflavones: 'mg', gl: '', protein: 'g', k: 'mg' };
  const RANK = { warn: 0, caution: 1, good: 2, info: 3 };

  const resolve = e => (e.refId ? App.food(e.refId) : null);

  App.views.insights = {
    title: () => 'Insights',
    sub: () => App.date.label(date || App.date.today()),
    actions: () => `
      <button class="appbar-btn" type="button" data-act="ins-prev" aria-label="Previous day">${App.icon('left')}</button>
      <button class="appbar-btn" type="button" data-act="ins-next" aria-label="Next day">${App.icon('right')}</button>`,

    async render(el) {
      if (!date) date = App.date.today();
      const p = App.state.profile;
      const all = await Data.entriesFor(date);
      const entries = all;

      if (!all.length) {
        el.innerHTML = `<div class="stack">
          <div class="card">${UI.emptyState('pulse', date === App.date.today() ? 'Nothing logged today' : 'Nothing logged this day',
            'Scan or add food and this page shows what it does to your hormones, blood sugar, heart, gut and sleep — with the evidence behind each point.',
            `<button class="btn primary mt8" type="button" data-act="ins-scan">${App.icon('barcode')}Scan a product</button>`)}</div>
          ${Product.disclaimer()}</div>`;
        return;
      }

      const day = Body.forDay(all, resolve, p);
      const items = day.items.slice().sort((a, b) => RANK[a.tone] - RANK[b.tone]);
      const count = t => items.filter(i => i.tone === t).length;
      const effects = foodEffects(entries);
      const hormones = Hormones.forDay(all, resolve).filter(h => h.dir !== 'neutral');
      App.state.insights = { items, effects, hormones, entries: all };

      const good = count('good'), watch = count('caution'), warn = count('warn');
      const headline = warn ? (warn === 1 ? 'One thing needs attention' : warn + ' things need attention')
        : watch ? (watch === 1 ? 'Mostly on track — one to watch' : 'Mostly on track — ' + watch + ' to watch')
        : 'Your body is well looked after today';

      el.innerHTML = `
      <div class="stack">
        <div class="ins-hero">
          <div class="grow">
            <h3>${headline}</h3>
            <p>${all.length} item${all.length === 1 ? '' : 's'} logged · ${App.int(day.totals.kcal)} kcal${
              day.upfShare !== null ? ' · ' + Math.round(day.upfShare * 100) + '% ultra-processed' : ''}</p>
            <div class="ins-counts">
              ${warn ? `<span class="warn">${warn} attention</span>` : ''}
              ${watch ? `<span class="caution">${watch} to watch</span>` : ''}
              ${good ? `<span class="good">${good} on track</span>` : ''}
            </div>
          </div>
        </div>

        ${hormones.length ? `<div>
          <div class="section-title mb8">Today's hormones</div>
          ${Product.hormoneGrid(hormones, h => 'From ' + h.foods.slice(0, 3).join(', ') + (h.foods.length > 3 ? ' +' + (h.foods.length - 3) : ''))}
        </div>` : ''}

        <div>
          <div class="section-title mb8">Daily signals</div>
          <div class="card flush">${items.map((i, k) => sigHtml(i, k)).join('')}</div>
        </div>

        ${effects.length ? `<div>
          <div class="section-title mb8">From what you ate</div>
          ${effects.map((x, k) => effectHtml(x, k)).join('')}
        </div>` : ''}

        ${Product.disclaimer()}
      </div>`;

      el.querySelectorAll('[data-sig]').forEach(b => b.addEventListener('click', () => openSignal(items[Number(b.dataset.sig)], all)));
      el.querySelectorAll('[data-hm]').forEach(b => b.addEventListener('click', () => {
        const h = hormones.find(x => x.k === b.dataset.hm);
        if (h) Product.openHormone(h, App.date.label(date) + ' · ' + h.foods.length + ' food' + (h.foods.length === 1 ? '' : 's'));
      }));
      el.querySelectorAll('[data-fxi]').forEach(b => b.addEventListener('click', () => {
        const x = effects[Number(b.dataset.fxi)];
        if (x) Product.openEffect(x.effect);
      }));
    }
  };

  /* ----------------------------------------------------------- signals */

  function sigHtml(i, k) {
    const meta = Body.SYSTEMS[i.system] || { icon: 'info' };
    const pct = i.target ? App.clamp(i.value / i.target * 100, 0, 100) : (i.limit ? 100 : 0);
    const val = App.n(i.value, i.value >= 10 ? 0 : 1);
    return `<button class="sig tone-${i.tone}" type="button" data-sig="${k}">
      <span class="fx-ic">${App.icon(meta.icon)}</span>
      <span class="sig-main">
        <span class="sig-top"><b>${App.esc(i.label)}</b>
          <span>${val}${i.unit ? ' ' + App.esc(i.unit) : ''}${i.target ? `<small> / ${i.limit ? '≤' : ''}${App.n(i.target, i.target < 10 ? 1 : 0)}</small>` : ''}</span></span>
        ${i.target ? `<span class="bar${i.limit && i.value > i.target ? ' over' : ''}" style="display:block"><i style="width:${pct}%"></i></span>` : ''}
        <p>${App.esc(i.text)}</p>
      </span>
    </button>`;
  }

  function openSignal(i, entries) {
    const key = DRIVER[i.id];
    let drivers = [];
    if (i.id === 'upf') {
      drivers = entries.map(e => ({ e, f: resolve(e) }))
        .filter(x => x.f && Quality.processing(x.f).nova === 4)
        .map(x => ({ name: x.e.name, v: x.e.n.kcal || 0, unit: 'kcal' }));
    } else if (key) {
      drivers = entries.filter(e => e.n && e.n[key] > 0)
        .map(e => ({ name: e.name, v: e.n[key], unit: UNIT[key] }));
    }
    drivers.sort((a, b) => b.v - a.v);
    const meta = Body.SYSTEMS[i.system] || {};
    UI.sheet({
      title: i.label,
      subtitle: meta.label,
      body: `
        <p style="font-size:15px;line-height:1.6">${App.esc(i.text)}</p>
        ${drivers.length ? `<div class="section-title mt16 mb8">Driven by</div>
          <div class="card">${drivers.slice(0, 8).map(d => `<div class="driver">
            <span class="grow">${App.esc(d.name)}</span><b>${App.n(d.v, d.v >= 10 ? 0 : 1)} ${App.esc(d.unit)}</b></div>`).join('')}</div>` : ''}
        ${i.src && i.src.length ? `<div class="section-title mt16 mb8">Sources</div>
          <ul class="src-list">${i.src.map(s => `<li>${App.esc(Body.SOURCES[s] || s)}</li>`).join('')}</ul>` : ''}
        ${Product.disclaimer()}`
    });
  }

  /* ------------------------------------------------- per-food effects */

  /**
   * Food-level effects for the day, merged by kind: "Processed meat — Salami,
   * Wiener Würstchen". Each entry is rebuilt as its food at the logged amount,
   * using the logged nutrients (which include any estimates made at the time).
   */
  function foodEffects(entries) {
    const byId = new Map();
    entries.forEach(e => {
      if (!e.n || !(e.grams > 0)) return;
      const f = resolve(e);
      const food = Object.assign({}, f || { name: e.name }, { n: Nutrition.mul(e.n, 100 / e.grams) });
      Body.forFood(food, e.grams).forEach(fx => {
        const cur = byId.get(fx.id);
        if (!cur) byId.set(fx.id, { effect: fx, foods: [e.name] });
        else {
          if (cur.foods.indexOf(e.name) === -1) cur.foods.push(e.name);
          if (RANK[fx.tone] < RANK[cur.effect.tone]) cur.effect = fx;   // keep the strongest version
        }
      });
    });
    return Array.from(byId.values()).sort((x, y) => RANK[x.effect.tone] - RANK[y.effect.tone]);
  }

  function effectHtml(x, k) {
    const e = x.effect;
    const meta = Body.SYSTEMS[e.system] || { icon: 'info' };
    return `<button class="fx tone-${e.tone}" type="button" data-fxi="${k}">
      <span class="fx-ic">${App.icon(meta.icon)}</span>
      <span class="fx-main">
        <b>${App.esc(e.title)}</b>
        <p>${App.esc(e.text)}</p>
        <span class="fx-meta">
          ${Product.evidenceBadge(e.evidence)}
          <span class="ev">${App.esc(x.foods.slice(0, 3).join(', ') + (x.foods.length > 3 ? ' +' + (x.foods.length - 3) : ''))}</span>
        </span>
      </span>
    </button>`;
  }

  /* ----------------------------------------------------------- actions */

  App.act({
    'ins-prev'() { date = App.date.add(date || App.date.today(), -1); App.refresh(); },
    'ins-next'() {
      const next = App.date.add(date || App.date.today(), 1);
      if (next > App.date.today()) return UI.toast('That day has not happened yet', 'err');
      date = next; App.refresh();
    },
    'ins-scan'() {
      Scanner.scanAndAdd({ mode: 'diary', date: date || App.date.today(), meal: App.guessMeal() });
    }
  });
})();
