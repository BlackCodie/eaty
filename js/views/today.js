/* ==========================================================================
   views/today.js — home dashboard
   ========================================================================== */
(function () {
  'use strict';

  let microTab = 'vitamin';

  App.views.today = {
    title: () => 'Today',
    sub: () => App.date.label(App.date.today()),
    actions: () => `<button class="appbar-btn" type="button" data-act="open-settings" aria-label="Settings">${App.icon('gear')}</button>`,

    async render(el) {
      const today = App.date.today();
      const t = App.state.targets;
      const p = App.state.profile;

      // Only the windows actually rendered: today, the last 7 days for the
      // chart, and the bare list of logged dates for the streak. None of these
      // grow with how long you have been using the app.
      const week = App.date.range(today, 7);
      const [entries, workouts, day, weights, weekEntries, loggedDates, entryCount] = await Promise.all([
        Data.entriesFor(today),
        Data.workoutsFor(today),
        Data.day(today),
        Data.weights(),
        Data.entriesBetween(week[0], today),
        Data.loggedDates(),
        Data.DB.count('entries')
      ]);

      const totals = Nutrition.sum(entries.map(e => e.n));
      const burned = Nutrition.burned(workouts);
      const useBurn = App.state.settings.addExercise !== false;
      const goal = t.kcal + (useBurn ? burned : 0);
      const remaining = goal - totals.kcal;
      const score = Nutrition.score(totals, t, entries);
      const sLbl = Nutrition.scoreLabel(score.total);

      /* ---- streak: consecutive days with at least one entry, ending today/yesterday */
      const logged = new Set(loggedDates);
      let streak = 0;
      let cur = logged.has(today) ? today : App.date.add(today, -1);
      while (logged.has(cur)) { streak++; cur = App.date.add(cur, -1); }

      /* ---- last 7 days of calories */
      const byDate = {};
      weekEntries.forEach(e => { byDate[e.date] = (byDate[e.date] || 0) + (e.n.kcal || 0); });
      const weekBars = week.map(d => ({
        x: App.date.dow(d)[0],
        y: byDate[d] || 0,
        color: (byDate[d] || 0) > t.kcal * 1.05 ? 'var(--fat)' : 'var(--brand)',
        dim: d === today && !(byDate[d] > 0)
      }));

      const latestWeight = weights.length ? weights[weights.length - 1] : null;

      /* ---- daily supplement stack */
      const [suppStack, suppTaken] = await Promise.all([
        Supplements.stack(),
        Supplements.takenOn(today)
      ]);
      const suppSplit = Supplements.split(entries);
      const hasSupps = entries.some(e => e.type === 'supplement');

      /* ---- how much of today's intake actually carries micronutrient data */
      const coverage = Nutrition.microCoverage(entries);

      /* ---- calorie-weighted food quality for the day */
      const dayQ = Quality.rateDay(entries, e => {
        const f = e.refId ? App.food(e.refId) : null;
        return f || null;
      });

      /* ---- micronutrient completion */
      const tracked = Nutrition.MICROS.filter(m => !m.limit);
      const microAvg = tracked.reduce((s, m) =>
        s + Math.min(100, App.pct(totals[m.k] || 0, t.micros[m.k])), 0) / tracked.length;
      const vitDone = Nutrition.MICROS.filter(m => m.group === 'vitamin' && !m.limit)
        .filter(m => App.pct(totals[m.k] || 0, t.micros[m.k]) >= 80).length;
      const minDone = Nutrition.MICROS.filter(m => m.group === 'mineral' && !m.limit)
        .filter(m => App.pct(totals[m.k] || 0, t.micros[m.k]) >= 80).length;
      const vitTotal = Nutrition.MICROS.filter(m => m.group === 'vitamin' && !m.limit).length;
      const minTotal = Nutrition.MICROS.filter(m => m.group === 'mineral' && !m.limit).length;

      /* ---- per-meal roll-up */
      const mealTotals = {};
      App.MEALS.forEach(m => mealTotals[m.k] = 0);
      entries.forEach(e => { mealTotals[e.meal] = (mealTotals[e.meal] || 0) + (e.n.kcal || 0); });

      const waterGoal = t.water || 2500;
      const waterPct = App.clamp(App.pct(day.water, waterGoal), 0, 100);

      /* ---- backup nudge: this data exists in exactly one place ---- */
      const s = App.state.settings || {};
      const daysSinceBackup = s.lastBackup
        ? Math.floor((Date.now() - s.lastBackup) / 86400000) : null;
      const snoozed = s.backupSnoozeUntil && Date.now() < s.backupSnoozeUntil;
      const enoughToLose = entryCount >= 40;
      const nudge = enoughToLose && !snoozed &&
        (daysSinceBackup === null || daysSinceBackup >= 30);

      el.innerHTML = `
      <div class="stack">

        ${nudge ? `
          <div class="card" style="border-color:color-mix(in srgb, var(--warn) 40%, transparent)">
            <div class="row" style="gap:12px;align-items:flex-start">
              <span style="flex:none;color:var(--warn);margin-top:1px">${App.icon('download')}</span>
              <div class="grow">
                <b style="font-size:14.5px;display:block;margin-bottom:3px">Back up your diary</b>
                <span class="tiny muted" style="line-height:1.5">
                  ${App.int(entryCount)} entries live only on this device.
                  ${daysSinceBackup === null ? 'You have never exported them.'
                    : 'Last backup was ' + daysSinceBackup + ' days ago.'}
                  ${App.state.persisted === false
                    ? ' Your browser has not granted persistent storage, so it may clear them.' : ''}
                </span>
                <div class="btn-row mt12">
                  <button class="btn sm primary" type="button" data-act="backup-now">${App.icon('download')}Export now</button>
                  <button class="btn sm subtle" type="button" data-act="backup-later">Later</button>
                </div>
              </div>
            </div>
          </div>` : ''}

        <!-- Calories hero -->
        <div class="card glow">
          <div class="row" style="gap:16px;align-items:center">
            ${Charts.rings(
              [{ pct: App.pct(totals.kcal, goal), color: 'var(--kcal)' }],
              {
                size: 132, stroke: 13,
                center: `<div class="big" style="color:${remaining < 0 ? 'var(--protein)' : 'var(--tx)'}">${App.int(Math.abs(remaining))}</div>
                         <div class="lbl">${remaining < 0 ? 'over' : 'left'}</div>`
              }
            )}
            <div class="grow" style="display:flex;flex-direction:column;gap:9px">
              ${miniStat('target', 'var(--tx-2)', 'Goal', App.int(t.kcal) + ' kcal')}
              ${miniStat('apple', 'var(--brand)', 'Food', App.int(totals.kcal) + ' kcal')}
              ${miniStat('dumbbell', 'var(--carbs)', 'Exercise', (useBurn && burned ? '+' : '') + App.int(burned) + ' kcal')}
            </div>
          </div>

          <div class="divider"></div>

          <div class="macro-grid">
            ${UI.macroCell('p', 'Protein', totals.protein, t.protein)}
            ${UI.macroCell('c', 'Carbs', totals.carbs, t.carbs)}
            ${UI.macroCell('f', 'Fat', totals.fat, t.fat)}
          </div>
          <div class="mt12">${Charts.macroBar(totals)}</div>
        </div>

        <!-- Quick strip -->
        <div class="strip">
          <button class="strip-item press" type="button" data-act="go-trends">
            <div class="ic" style="background:var(--brand-dim);color:var(--brand)">${App.icon('flame')}</div>
            <div class="tx"><b>${streak}</b><small>day streak</small></div>
          </button>
          <button class="strip-item press" type="button" data-act="log-weight">
            <div class="ic" style="background:rgba(78,168,255,.14);color:var(--carbs)">${App.icon('scale')}</div>
            <div class="tx"><b>${latestWeight ? App.n(latestWeight.kg, 1) : '—'}</b><small>${latestWeight ? 'kg · tap to log' : 'log weight'}</small></div>
          </button>
        </div>

        <!-- Nutrition score -->
        <div class="card">
          <div class="card-head">
            <h2>Nutrition score</h2>
            <button class="lnk" type="button" data-act="score-info">${App.icon('info')}</button>
          </div>
          <div class="score-hero">
            ${Charts.rings([{ pct: score.total, color: sLbl.color }], {
              size: 92, stroke: 10,
              center: `<div class="big" style="font-size:26px">${score.total}</div>`
            })}
            <div class="score-info">
              <h3 style="color:${sLbl.color}">${sLbl.label}</h3>
              <p>${scoreAdvice(score, totals, t)}</p>
            </div>
          </div>
          <div class="score-breakdown">
            ${score.parts.map(pt => `
              <div class="score-line">
                <span class="sl-name">${pt.label}</span>
                <div class="bar" style="color:${pt.pct >= 80 ? 'var(--brand)' : pt.pct >= 45 ? 'var(--carbs)' : 'var(--warn)'}">
                  <i style="width:${App.clamp(pt.pct, 0, 100)}%"></i></div>
                <span class="sl-val">${Math.round(pt.pts)}/${pt.max}</span>
              </div>`).join('')}
          </div>
        </div>

        <!-- Food quality -->
        <div class="card">
          <div class="card-head">
            <h2>Food quality</h2>
            <button class="lnk" type="button" data-act="quality-info">${App.icon('info')}</button>
          </div>
          ${dayQ ? `
            <div class="q-hero" style="background:transparent;border:0;padding:0">
              <div class="q-ring">
                ${Charts.rings([{ pct: dayQ.score, color: dayQ.color }], { size: 76, stroke: 8 })}
                <div class="q-score"><b style="color:${dayQ.color}">${dayQ.score}</b><span>/100</span></div>
              </div>
              <div class="q-meta">
                <h4 style="color:${dayQ.color}">${dayQ.grade} · ${dayQ.label}</h4>
                <p>Calorie-weighted across ${dayQ.rated} item${dayQ.rated === 1 ? '' : 's'} today.</p>
              </div>
            </div>
            <div class="divider" style="margin:14px 0 12px"></div>
            <div class="stack" style="gap:9px">
              ${dayQ.best ? `<div class="row" style="gap:9px">
                ${pillFor(dayQ.best.score)}
                <span class="grow tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${App.esc(dayQ.best.name)}</span>
                <span class="tiny muted">best</span></div>` : ''}
              ${dayQ.worst && dayQ.worst.name !== dayQ.best.name ? `<div class="row" style="gap:9px">
                ${pillFor(dayQ.worst.score)}
                <span class="grow tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${App.esc(dayQ.worst.name)}</span>
                <span class="tiny muted">weakest</span></div>` : ''}
            </div>`
            : `<p class="tiny muted">Log something to see how the day rates.</p>`}
        </div>

        <!-- Micronutrients -->
        <div class="card">
          <div class="card-head">
            <h2>Micronutrients</h2>
            <span class="sub">${Math.round(microAvg)}% average</span>
          </div>
          ${coverage.fraction < 0.995 && coverage.total > 0 ? `
            <p class="tiny muted mb12" style="line-height:1.5">
              Measured against ${Math.round(coverage.fraction * 100)}% of today's calories —
              ${App.int(coverage.missingKcal)} kcal came from packaged food whose label does not
              declare vitamins, so it is left out rather than counted as zero.
            </p>` : ''}
          <div class="stat-row mb12">
            <div class="stat hi"><span class="v">${vitDone}/${vitTotal}</span><span class="k">Vitamins met</span></div>
            <div class="stat hi"><span class="v">${minDone}/${minTotal}</span><span class="k">Minerals met</span></div>
            <div class="stat"><span class="v">${App.n(totals.fiber, 0)}g</span><span class="k">Fibre</span></div>
          </div>
          <div class="segmented mb12" id="micro-tabs">
            <button type="button" data-micro="vitamin" class="${microTab === 'vitamin' ? 'on' : ''}">Vitamins</button>
            <button type="button" data-micro="mineral" class="${microTab === 'mineral' ? 'on' : ''}">Minerals</button>
          </div>
          ${hasSupps ? `
            <div class="row tiny mb12" style="gap:14px;flex-wrap:wrap">
              <span class="row" style="gap:5px"><i style="width:9px;height:9px;border-radius:3px;background:var(--brand);display:block"></i>
                <span class="muted">from food</span></span>
              <span class="row" style="gap:5px"><i style="width:9px;height:9px;border-radius:3px;background:var(--fiber);display:block"></i>
                <span class="muted">from supplements</span></span>
            </div>` : ''}
          <div id="micro-body">${UI.microGrid(totals, t, microTab, hasSupps ? suppSplit : null)}</div>
        </div>

        <!-- Meals -->
        <div class="card flush">
          <div class="card-head" style="padding:var(--pad) var(--pad) 10px;margin:0">
            <h2>Today's meals</h2>
            <button class="lnk" type="button" data-act="go-diary">Diary ${App.icon('right')}</button>
          </div>
          <div class="list">
            ${App.MEALS.map(m => `
              <button class="list-item" type="button" data-act="add-to-meal" data-meal="${m.k}">
                <div class="li-ic" style="background:var(--brand-dim);color:var(--brand)">${App.icon(m.icon)}</div>
                <div class="li-main">
                  <div class="li-title">${m.label}</div>
                  <div class="li-sub">${entries.filter(e => e.meal === m.k).length || 'No'} item${entries.filter(e => e.meal === m.k).length === 1 ? '' : 's'}</div>
                </div>
                <div class="li-right"><div class="li-kcal">${App.int(mealTotals[m.k] || 0)}</div><div class="li-macros">kcal</div></div>
                ${App.icon('plus', 'li-chev')}
              </button>`).join('')}
          </div>
        </div>

        <!-- Daily supplement stack -->
        ${suppStack.length ? `
        <div class="card flush">
          <div class="meal-head">
            <div class="ic">${App.icon('sparkle')}</div>
            <h3>Supplements</h3>
            <span class="kc">${suppTaken.size}/${suppStack.length}</span>
            <button class="icon-btn" type="button" data-act="supp-manage" aria-label="Manage supplements"
                    style="width:30px;height:30px">${App.icon('more')}</button>
          </div>
          <div class="list">
            ${suppStack.map(sp => {
              const on = suppTaken.has(sp.id);
              const doses = Nutrition.MICROS.filter(m => Supplements.perDose(sp, m.k) > 0)
                .slice(0, 2)
                .map(m => m.label + ' ' + App.amt(Supplements.perDose(sp, m.k), m.unit)).join(' · ');
              return `<button class="shop-item${on ? ' done' : ''}" type="button"
                              data-act="supp-toggle" data-id="${sp.id}">
                <span class="shop-box">${App.icon('check')}</span>
                <span class="si-main"><b>${App.esc(sp.name)}</b>
                  <small>1 ${App.esc(sp.unitLabel)}${doses ? ' · ' + App.esc(doses) : ''}</small></span>
              </button>`;
            }).join('')}
          </div>
          ${suppTaken.size < suppStack.length ? `
            <button class="meal-add" type="button" data-act="supp-take-all">
              ${App.icon('check')}Take all (${suppStack.length - suppTaken.size} left)</button>` : ''}
        </div>` : ''}

        <!-- Water -->
        <div class="card">
          <div class="card-head">
            <h2>Water</h2>
            <span class="sub num">${App.int(day.water)} / ${App.int(waterGoal)} ml</span>
          </div>
          <div class="bar" style="color:var(--water);height:10px"><i style="width:${waterPct}%"></i></div>
          <div class="btn-row mt12">
            <button class="btn sm" type="button" data-act="water" data-ml="250">+250</button>
            <button class="btn sm" type="button" data-act="water" data-ml="500">+500</button>
            <button class="btn sm" type="button" data-act="water" data-ml="-250">−250</button>
          </div>
        </div>

        <!-- Week glance -->
        <div class="card">
          <div class="card-head">
            <h2>Last 7 days</h2>
            <button class="lnk" type="button" data-act="go-trends">Trends ${App.icon('right')}</button>
          </div>
          ${Charts.bars(weekBars, { goal: t.kcal, height: 150, labelEvery: 1 })}
          <div class="chart-legend">
            <span style="color:var(--brand)"><i></i>Calories</span>
            <span style="color:var(--tx-3)"><i style="background:var(--tx-3)"></i>Goal ${App.int(t.kcal)}</span>
          </div>
        </div>

        <p class="tiny muted center" style="padding:4px 20px 0;line-height:1.5">
          ${App.esc(p.name ? p.name + ' · ' : '')}${Nutrition.GOALS.find(g => g.k === p.goal).label} ·
          maintenance ≈ ${App.int(t.maintenance)} kcal
        </p>
      </div>`;

      /* micro tab switching without a full re-render */
      el.querySelectorAll('[data-micro]').forEach(b => b.addEventListener('click', () => {
        microTab = b.dataset.micro;
        el.querySelectorAll('[data-micro]').forEach(x => x.classList.toggle('on', x === b));
        el.querySelector('#micro-body').innerHTML = UI.microGrid(totals, t, microTab);
      }));
    }
  };

  /** Grade chip from a bare score (Quality.gradeFor has no score field). */
  function pillFor(score) {
    return UI.gradePill(Object.assign({ score: Math.round(score) }, Quality.gradeFor(score)), true);
  }

  function miniStat(icon, color, label, value) {
    return `<div class="row" style="gap:9px">
      <span style="color:${color};width:18px;flex:none">${App.icon(icon)}</span>
      <span class="grow tiny muted" style="font-weight:600">${label}</span>
      <span class="num" style="font-size:14px;font-weight:680">${value}</span>
    </div>`;
  }

  function scoreAdvice(score, totals, t) {
    if (totals.kcal === 0) return 'Log your first meal to start scoring the day.';
    const weakest = score.parts.slice().sort((a, b) => (a.pts / a.max) - (b.pts / b.max))[0];
    const map = {
      'Calories': totals.kcal > t.kcal
        ? `You're ${App.int(totals.kcal - t.kcal)} kcal over target.`
        : `${App.int(t.kcal - totals.kcal)} kcal still to go today.`,
      'Protein': `Protein is the gap — ${App.n(Math.max(0, t.protein - totals.protein), 0)}g left.`,
      'Fibre': `Add fibre: ${App.n(Math.max(0, t.fiber - totals.fiber), 0)}g short of ${t.fiber}g.`,
      'Micronutrients': 'Vegetables, fruit or a mixed salad would lift your micronutrient coverage.',
      'Variety': 'Eating a wider range of foods improves coverage — try one new ingredient.'
    };
    return map[weakest.label] || 'Looking good — keep it consistent.';
  }

  /* ------------------------------------------------------------- actions */
  App.act({
    async 'backup-now'() {
      await App.exportBackup(false);
      App.state.settings = await Data.saveSettings({ lastBackup: Date.now() });
      App.refresh();
    },
    async 'backup-later'() {
      // Snooze, never pretend a backup happened — lastBackup stays untouched.
      App.state.settings = await Data.saveSettings({
        backupSnoozeUntil: Date.now() + 30 * 86400000
      });
      UI.toast('Reminder snoozed for 30 days');
      App.refresh();
    },
    'go-diary': () => App.go('diary'),
    'go-trends': () => App.go('trends'),
    'add-to-meal': el => FoodSheet.open({ mode: 'diary', date: App.date.today(), meal: el.dataset.meal }),

    async 'water'(el) {
      const today = App.date.today();
      const d = await Data.day(today);
      d.water = Math.max(0, (d.water || 0) + Number(el.dataset.ml));
      await Data.saveDay(d);
      App.haptic('light');
      App.refresh();
    },

    'quality-info': () => UI.sheet({
      full: true,
      title: 'How food quality is rated',
      body: `<p class="tiny muted mb14" style="line-height:1.6">
          Every food gets a 0–100 rating and an A–E grade from eight weighted criteria — three for
          what it gives you, five for what it costs you. A day's rating is the calorie-weighted
          average of everything you logged.
        </p>
        <div class="card flush mb14">
          ${Object.entries(Quality.WEIGHTS).map(([k, w]) => {
            const meta = {
              density: ['Nutrient density', 'Vitamins and minerals per calorie, against a 2000 kcal reference.'],
              protein: ['Protein', 'Grams per 100 kcal — full marks around 8 g.'],
              fiber: ['Fibre', 'Grams per 100 kcal — full marks around 2.5 g.'],
              sugar: ['Sugars', 'Per 100 g. Natural sugars in fruit, veg and plain dairy are judged leniently.'],
              satfat: ['Saturated fat', 'Per 100 g, from 1.5 g down to 10 g.'],
              sodium: ['Salt', 'Sodium per 100 g, from 90 mg down to 900 mg.'],
              processing: ['Processing', 'NOVA group. Ultra-processed food scores zero here.'],
              additives: ['Additives', 'Count of declared additives.']
            }[k];
            return `<div style="padding:12px var(--pad);border-bottom:1px solid var(--line)">
              <div class="between mb8"><b style="font-size:14px">${meta[0]}</b>
                <span class="badge brand">${w} pts</span></div>
              <span class="tiny muted" style="line-height:1.5">${meta[1]}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="card">
          <div class="row" style="gap:11px;align-items:flex-start">
            <span style="flex:none;color:var(--brand);margin-top:1px">${App.icon('info')}</span>
            <span class="tiny" style="line-height:1.55">
              <b>Missing data is never counted as zero.</b> If a product does not publish a figure,
              that criterion is dropped and the rest are reweighted — so a plain packet is not
              punished for what its label was never required to print. Each rating shows the share
              of criteria it could actually be judged on.
            </span>
          </div>
        </div>
        <p class="tiny muted mt14" style="line-height:1.55">
          Processing groups and additive counts come from Open Food Facts. For built-in whole foods
          the processing level is estimated from the food itself and marked “est.”. This is a
          general guide to food quality, not personalised dietary advice.
        </p>`
    }),

    'score-info': () => UI.sheet({
      title: 'How the score works',
      body: `<div class="stack" style="gap:12px;padding-top:2px">
        ${[
          ['Calories', 25, 'Full marks within 5% of your target — in either direction.'],
          ['Protein', 25, 'Scales up to your daily protein target. No penalty for going over.'],
          ['Fibre', 15, 'Scales up to 14 g per 1000 kcal, the standard recommendation.'],
          ['Micronutrients', 25, 'Average coverage across 19 vitamins and minerals, each capped at 100%.'],
          ['Variety', 10, 'Distinct foods logged, reaching full marks at 12 in a day.']
        ].map(([n, pts, d]) => `<div class="card" style="padding:13px 14px">
          <div class="between mb8"><b style="font-size:14.5px">${n}</b><span class="badge brand">${pts} pts</span></div>
          <p class="tiny muted" style="line-height:1.5">${d}</p></div>`).join('')}
        <p class="tiny muted" style="line-height:1.55;padding:2px 4px">
          The score is a guide for daily consistency, not a medical assessment.
          Reference intakes follow US RDA/AI values for your age and sex.
        </p>
      </div>`
    })
  });
})();
