/* ==========================================================================
   views/report.js — the weekly report

   One sheet that sums up a week: how much was logged, calories and protein
   against target, the average Eaty Score, what went well and what to watch
   (fibre, sugar, salt, late caffeine, alcohol, ultra-processed food, omega-3,
   protein), the hormone pattern, nutrient gaps with foods that fill them, and
   the most-logged, best and worst foods — compared with the week before.
   ========================================================================== */
(function () {
  'use strict';

  const resolve = e => (e.refId ? App.food(e.refId) : null);

  /** Everything the report shows for the 7 days starting at `start`. */
  async function summarise(start) {
    const end = App.date.add(start, 6);
    const days = App.date.range(end, 7);
    const entries = await Data.entriesBetween(start, end);
    const t = App.state.targets;
    const p = App.state.profile;
    const byDay = {};
    entries.forEach(e => (byDay[e.date] = byDay[e.date] || []).push(e));
    const logged = days.filter(d => (byDay[d] || []).some(e => (e.n && e.n.kcal) > 0));

    const per = logged.map(d => {
      const list = byDay[d];
      const body = Body.forDay(list, resolve, p);
      const item = id => body.items.find(i => i.id === id);
      return {
        date: d, list,
        totals: body.totals,
        quality: Quality.rateDay(list, resolve),
        upf: body.upfShare,
        lateCaffeine: !!(item('caffeine') && /after 3 pm/.test(item('caffeine').text)),
        hormones: Hormones.forDay(list, resolve)
      };
    });
    const n = per.length;
    const avg = k => n ? per.reduce((s, d) => s + (d.totals[k] || 0), 0) / n : 0;
    const count = fn => per.filter(fn).length;

    // Calorie-weighted quality over the whole week.
    const weekQuality = Quality.rateDay(entries, resolve);

    // Hormones: on how many days each one was pushed up or down, and by what.
    const hormones = {};
    per.forEach(d => d.hormones.forEach(h => {
      if (h.dir === 'neutral' || h.dir === 'support') return;
      const m = hormones[h.k] || (hormones[h.k] = { h, up: 0, down: 0, foods: {} });
      if (h.dir === 'up' || h.dir === 'mixed') m.up++;
      if (h.dir === 'down' || h.dir === 'mixed') m.down++;
      h.foods.forEach(f => { m.foods[f] = (m.foods[f] || 0) + 1; });
    }));

    // Nutrient gaps: average share of target on logged days.
    const gaps = n ? Nutrition.MICROS.filter(m => !m.limit && t.micros[m.k] > 0)
      .map(m => ({ m, pct: App.pct(avg(m.k), t.micros[m.k]) }))
      .filter(x => x.pct < 70).sort((a, b) => a.pct - b.pct).slice(0, 5) : [];

    // Foods: most logged, best and worst rated.
    const foods = {};
    entries.forEach(e => {
      if (e.type === 'supplement') return;
      const f = foods[e.name] || (foods[e.name] = { name: e.name, times: 0, kcal: 0, rating: null });
      f.times++; f.kcal += (e.n && e.n.kcal) || 0;
      if (!f.rating) { const food = resolve(e); f.rating = food ? Quality.rate(food) : null; }
    });
    const foodList = Object.values(foods);
    const rated = foodList.filter(f => f.rating);

    return {
      start, end, days, logged, n, entries,
      kcal: avg('kcal'), protein: avg('protein'), fiber: avg('fiber'),
      quality: weekQuality,
      fiberDays: count(d => (d.totals.fiber || 0) >= 30),
      sugarDays: count(d => (d.totals.freesugar || 0) > 50),
      saltDays: count(d => (d.totals.na || 0) > 2000),
      lateCaffeineDays: count(d => d.lateCaffeine),
      alcoholDays: count(d => (d.totals.alcohol || 0) > 0.5),
      drinks: per.reduce((s, d) => s + (d.totals.alcohol || 0), 0) / 10,
      omegaDays: count(d => (d.totals.epadha || 0) >= 250),
      proteinDays: count(d => (d.totals.protein || 0) >= t.protein * 0.9),
      upf: n ? per.filter(d => d.upf !== null).reduce((s, d) => s + d.upf, 0) / Math.max(1, per.filter(d => d.upf !== null).length) : null,
      hormones: Object.values(hormones).sort((a, b) => (b.up + b.down) - (a.up + a.down)),
      gaps,
      top: foodList.sort((a, b) => b.times - a.times).slice(0, 5),
      best: rated.slice().sort((a, b) => b.rating.score - a.rating.score).slice(0, 3),
      worst: rated.slice().sort((a, b) => a.rating.score - b.rating.score).slice(0, 3)
    };
  }

  /** Whole foods richest in a nutrient per typical portion, for "fill the gap". */
  function sourcesFor(k) {
    return FoodDB.all()
      .filter(f => f.builtin && f.n[k] > 0 && f.n.kcal >= 15 && !/Supplements|Condiments|Fats & Oils/.test(f.cat) && !/liver|leber/i.test(f.name))
      .map(f => { const sv = f.servings[0] || { g: 100 }; return { f, amount: f.n[k] * sv.g / 100, sv }; })
      .sort((a, b) => b.amount - a.amount).slice(0, 3);
  }

  const delta = (now, before, unit, better) => {
    if (before === null || before === undefined || !isFinite(before)) return '';
    const d = now - before;
    if (Math.abs(d) < (unit === '' ? 1 : 0.5)) return '<small class="muted">= last week</small>';
    const good = better === 'up' ? d > 0 : d < 0;
    return `<small style="color:${good ? 'var(--good)' : 'var(--caution)'}">${d > 0 ? '▲' : '▼'} ${App.n(Math.abs(d), 0)}${unit}</small>`;
  };

  function line(ok, text) {
    return `<div class="rep-line ${ok ? 'ok' : 'watch'}"><span>${ok ? '✓' : '!'}</span><p>${text}</p></div>`;
  }

  function html(w, prev) {
    const t = App.state.targets;
    if (!w.n) {
      return `<div class="card">${UI.emptyState('plan', 'Nothing logged this week',
        'Log a few days and the report fills in: calories, protein, the Eaty Score, sugar, salt, caffeine, hormones and nutrient gaps.')}</div>`;
    }
    const q = w.quality;
    const good = [], watch = [];
    (w.fiberDays >= Math.ceil(w.n / 2) ? good : watch).push(`Fibre target (30 g) met on <b>${w.fiberDays} of ${w.n}</b> days — average ${App.n(w.fiber, 0)} g.`);
    (w.proteinDays >= Math.ceil(w.n / 2) ? good : watch).push(`Protein target (${App.int(t.protein)} g) met on <b>${w.proteinDays} of ${w.n}</b> days.`);
    if (w.sugarDays) watch.push(`Free sugar over the WHO limit (50 g) on <b>${w.sugarDays}</b> day${w.sugarDays === 1 ? '' : 's'}.`);
    else good.push('Free sugar stayed under the WHO limit every day.');
    if (w.saltDays) watch.push(`Salt over 5 g on <b>${w.saltDays}</b> day${w.saltDays === 1 ? '' : 's'}.`);
    else good.push('Salt stayed under 5 g every day.');
    if (w.lateCaffeineDays) watch.push(`Caffeine after 3 pm on <b>${w.lateCaffeineDays}</b> day${w.lateCaffeineDays === 1 ? '' : 's'} — it is still active at bedtime.`);
    if (w.alcoholDays) watch.push(`Alcohol on <b>${w.alcoholDays}</b> day${w.alcoholDays === 1 ? '' : 's'}, about ${App.n(w.drinks, 1)} standard drinks in total.`);
    if (w.omegaDays) good.push(`Omega-3 EPA + DHA (250 mg) reached on <b>${w.omegaDays}</b> day${w.omegaDays === 1 ? '' : 's'}.`);
    else watch.push('No day reached 250 mg of omega-3 EPA + DHA — oily fish twice a week covers it.');
    if (w.upf !== null) (w.upf <= 0.25 ? good : watch).push(`<b>${Math.round(w.upf * 100)}%</b> of calories came from ultra-processed food${w.upf <= 0.25 ? ' — mostly whole food.' : '.'}`);

    return `
      <div class="stat-row mb12" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat"><span class="v">${w.n}/7</span><span class="k">days logged ${delta(w.n, prev && prev.n, '', 'up')}</span></div>
        <div class="stat hi" style="--c:${q ? q.color : 'var(--tx-3)'}"><span class="v" style="color:${q ? q.color : 'var(--tx-3)'}">${q ? q.score + ' ' + q.grade : '—'}</span>
          <span class="k">avg Eaty Score ${q && prev && prev.quality ? delta(q.score, prev.quality.score, '', 'up') : ''}</span></div>
        <div class="stat"><span class="v">${App.int(w.kcal)}</span><span class="k">kcal / day · target ${App.int(t.kcal)}</span></div>
        <div class="stat"><span class="v">${App.int(w.protein)} g</span><span class="k">protein / day ${delta(w.protein, prev && prev.n ? prev.protein : null, ' g', 'up')}</span></div>
      </div>

      ${good.length ? `<div class="section-title mb8">Going well</div><div class="card mb12">${good.map(x => line(true, x)).join('')}</div>` : ''}
      ${watch.length ? `<div class="section-title mb8">To watch</div><div class="card mb12">${watch.map(x => line(false, x)).join('')}</div>` : ''}

      ${w.hormones.length ? `<div class="section-title mb8">Hormones this week</div>
        <div class="card flush mb12">${w.hormones.slice(0, 7).map(x => {
          const topFoods = Object.entries(x.foods).sort((a, b) => b[1] - a[1]).slice(0, 3).map(f => f[0]).join(', ');
          const dirText = x.up && x.down ? `up on ${x.up}, down on ${x.down} days` : x.up ? `raised on ${x.up} day${x.up === 1 ? '' : 's'}` : `lowered on ${x.down} day${x.down === 1 ? '' : 's'}`;
          return `<div class="sig tone-${x.h.tone}" style="cursor:default">
            <span class="fx-ic">${App.icon(x.h.icon)}</span>
            <span class="sig-main"><span class="sig-top"><b>${App.esc(x.h.label)}</b><span>${x.up >= x.down ? '↑' : '↓'}</span></span>
              <p>${dirText} · mostly ${App.esc(topFoods)}</p></span>
          </div>`;
        }).join('')}</div>` : ''}

      ${w.gaps.length ? `<div class="section-title mb8">Nutrient gaps</div>
        <div class="card mb12">${w.gaps.map(g => {
          const src = sourcesFor(g.m.k);
          return `<div class="rep-gap"><div class="between"><b>${g.m.label}</b><span class="num" style="color:var(--caution)">${Math.round(g.pct)}%</span></div>
            <div class="bar" style="color:var(--caution)"><i style="width:${App.clamp(g.pct, 0, 100)}%"></i></div>
            ${src.length ? `<small>Try: ${src.map(x => `${App.esc(x.f.name)} (${App.esc(x.sv.label)})`).join(' · ')}</small>` : ''}</div>`;
        }).join('')}</div>` : ''}

      <div class="section-title mb8">Foods</div>
      <div class="card mb12">
        ${w.top.length ? `<p class="tiny muted mb8">Most logged</p>${w.top.map(f => `<div class="driver"><span class="grow">${App.esc(f.name)}</span><b>${f.times}×</b></div>`).join('')}` : ''}
        ${w.best.length ? `<p class="tiny muted mt12 mb8">Best rated</p>${w.best.map(f => `<div class="driver">${UI.gradePill(f.rating, true)}<span class="grow">${App.esc(f.name)}</span><b>${f.rating.score}</b></div>`).join('')}` : ''}
        ${w.worst.length && w.worst[0].rating.score < 50 ? `<p class="tiny muted mt12 mb8">Worth swapping</p>${w.worst.filter(f => f.rating.score < 50).map(f => `<div class="driver">${UI.gradePill(f.rating, true)}<span class="grow">${App.esc(f.name)}</span><b>${f.rating.score}</b></div>`).join('')}` : ''}
      </div>
      ${Product.disclaimer()}`;
  }

  function shareText(w) {
    const q = w.quality;
    return [`Eaty — week of ${App.date.short(w.start)}`,
      `${w.n}/7 days logged · ${App.int(w.kcal)} kcal/day · ${App.int(w.protein)} g protein/day`,
      q ? `Eaty Score ${q.score} (${q.grade})` : '',
      `Fibre target met ${w.fiberDays}/${w.n} days · free sugar over limit ${w.sugarDays} days · salt over limit ${w.saltDays} days`,
      w.alcoholDays ? `Alcohol on ${w.alcoholDays} days` : '',
      w.gaps.length ? 'Gaps: ' + w.gaps.map(g => g.m.label + ' ' + Math.round(g.pct) + '%').join(', ') : ''
    ].filter(Boolean).join('\n');
  }

  /** Open the report for the week containing `date` (default: this week). */
  async function open(date) {
    let start = App.date.weekStart(date || App.date.today());
    let w = null;
    const s = UI.sheet({
      full: true,
      title: 'Weekly report',
      subtitle: '',
      headerRight: `<button class="icon-btn" type="button" id="rp-prev" aria-label="Previous week">${App.icon('left')}</button>
        <button class="icon-btn" type="button" id="rp-next" aria-label="Next week">${App.icon('right')}</button>`,
      body: '<div id="rp-body"><div class="skeleton" style="height:120px"></div></div>',
      footer: `<button class="btn ghost block" type="button" id="rp-share">${App.icon('share')}Share summary</button>`,
      onOpen(el) {
        const draw = async () => {
          const [cur, prev] = await Promise.all([summarise(start), summarise(App.date.add(start, -7))]);
          w = cur;
          s.setSubtitle(App.date.short(start) + ' – ' + App.date.short(App.date.add(start, 6)) +
            (start === App.date.weekStart(App.date.today()) ? ' · so far' : ''));
          el.querySelector('#rp-body').innerHTML = html(cur, prev);
          el.querySelector('#rp-next').disabled = App.date.add(start, 7) > App.date.today();
        };
        el.querySelector('#rp-prev').addEventListener('click', () => { start = App.date.add(start, -7); draw(); });
        el.querySelector('#rp-next').addEventListener('click', () => {
          if (App.date.add(start, 7) > App.date.today()) return;
          start = App.date.add(start, 7); draw();
        });
        el.querySelector('#rp-share').addEventListener('click', async () => {
          if (!w) return;
          const text = shareText(w);
          try {
            if (navigator.share) await navigator.share({ title: 'Eaty weekly report', text });
            else { await navigator.clipboard.writeText(text); UI.toast('Summary copied', 'ok'); }
          } catch (_) { /* cancelled */ }
        });
        draw();
      }
    });
    return s;
  }

  App.act({
    'open-report': () => open(),
    'open-last-report': () => open(App.date.add(App.date.weekStart(App.date.today()), -1))
  });
  window.Report = { open, summarise };
})();
