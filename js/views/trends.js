/* ==========================================================================
   views/trends.js — weight, calories, protein, score history + measurements
   ========================================================================== */
(function () {
  'use strict';

  let period = 30;
  const MEASURES = [
    { k: 'waist', label: 'Waist' }, { k: 'chest', label: 'Chest' },
    { k: 'hips', label: 'Hips' },   { k: 'arm', label: 'Arm' },
    { k: 'thigh', label: 'Thigh' }, { k: 'bodyFat', label: 'Body fat', unit: '%' }
  ];

  App.views.trends = {
    title: () => 'Trends',
    sub: () => 'Last ' + period + ' days',
    actions: () => `<button class="appbar-btn accent" type="button" data-act="log-weight" aria-label="Log weight">${App.icon('plus')}</button>`,

    async render(el) {
      const t = App.state.targets;
      const p = App.state.profile;
      const today = App.date.today();
      const from = App.date.add(today, -(period - 1));

      // Only the selected window is read, so a year of history costs the same
      // as a month when you are looking at 30 days.
      const [weights, rangeEntries, workouts] = await Promise.all([
        Data.weights(),
        Data.entriesBetween(from, today),
        Data.workoutsBetween(from, today)
      ]);

      const days = App.date.range(today, period);

      /* -------- daily roll-ups -------- */
      const byDate = {};
      rangeEntries.forEach(e => {
        const d = (byDate[e.date] = byDate[e.date] || { entries: [], n: Nutrition.empty() });
        d.entries.push(e);
        Nutrition.KEYS.forEach(k => d.n[k] += e.n[k] || 0);
      });

      const series = days.map(d => {
        const rec = byDate[d];
        const logged = !!rec && rec.entries.length > 0;
        return {
          date: d,
          logged,
          kcal: logged ? rec.n.kcal : 0,
          protein: logged ? rec.n.protein : 0,
          score: logged ? Nutrition.score(rec.n, t, rec.entries).total : null
        };
      });

      const loggedDays = series.filter(s => s.logged);
      const avg = key => loggedDays.length
        ? loggedDays.reduce((s, x) => s + x[key], 0) / loggedDays.length : 0;
      const avgScore = (() => {
        const v = loggedDays.filter(s => s.score !== null);
        return v.length ? v.reduce((s, x) => s + x.score, 0) / v.length : 0;
      })();

      /* -------- weight -------- */
      const wInRange = weights.filter(w => w.date >= from);
      const latest = weights.length ? weights[weights.length - 1] : null;
      const first = wInRange.length ? wInRange[0] : latest;
      const change = latest && first ? latest.kg - first.kg : 0;

      const wSeries = days.map(d => {
        const rec = weights.find(w => w.date === d);
        return { x: App.date.short(d), y: rec ? rec.kg : null };
      });
      // Carry the last known weight forward so the line stays continuous.
      let carry = null;
      const wFilled = wSeries.map((pt, i) => {
        if (pt.y !== null) { carry = pt.y; return pt; }
        return { x: pt.x, y: i === 0 ? null : carry };
      });

      const target = Number(p.targetWeight) || null;
      let goalPct = null;
      if (target && weights.length) {
        const start = Number(p.startWeight) || weights[0].kg;
        const span = start - target;
        goalPct = span !== 0 ? App.clamp((start - latest.kg) / span * 100, 0, 100) : 100;
      }

      const kcalBars = series.map(s => ({
        x: App.date.dayNum(s.date),
        y: s.kcal,
        color: !s.logged ? 'var(--track)' : s.kcal > t.kcal * 1.08 ? 'var(--fat)' :
               s.kcal < t.kcal * 0.8 ? 'var(--carbs)' : 'var(--brand)'
      }));
      const proteinBars = series.map(s => ({
        x: App.date.dayNum(s.date),
        y: s.protein,
        color: !s.logged ? 'var(--track)' : s.protein >= t.protein ? 'var(--protein)' : 'rgba(255,122,92,.45)'
      }));
      const scoreLine = series.map(s => ({ x: App.date.short(s.date), y: s.score }));

      const hitProtein = loggedDays.filter(s => s.protein >= t.protein).length;
      const totalBurn = workouts.filter(w => w.date >= from).reduce((s, w) => s + (w.kcal || 0), 0);
      const workoutDays = new Set(workouts.filter(w => w.date >= from).map(w => w.date)).size;

      el.innerHTML = `
      <div class="stack">

        <div class="segmented" id="tr-period">
          ${[[30, '30 days'], [90, '3 months'], [365, '1 year']].map(([v, l]) =>
            `<button type="button" data-period="${v}" class="${period === v ? 'on' : ''}">${l}</button>`).join('')}
        </div>

        <!-- Weight -->
        <div class="card">
          <div class="card-head">
            <h2>Weight</h2>
            <button class="lnk" type="button" data-act="log-weight">${App.icon('plus')}Log</button>
          </div>
          ${latest ? `
            <div class="row mb12" style="gap:16px;align-items:flex-end">
              <div>
                <div class="num" style="font-size:32px;font-weight:750;line-height:1">${App.n(latest.kg, 1)}<span style="font-size:15px;color:var(--tx-2)"> kg</span></div>
                <div class="tiny muted">${App.date.label(latest.date)}</div>
              </div>
              <div style="padding-bottom:2px">
                <span class="badge ${change < 0 ? 'brand' : ''}" style="${change > 0 ? 'color:var(--fat)' : ''}">
                  ${change > 0 ? '+' : ''}${App.n(change, 1)} kg
                </span>
                <span class="tiny muted" style="margin-left:4px">in ${period}d</span>
              </div>
            </div>
            ${Charts.line(wFilled, { color: 'var(--brand)', goal: target, goalLabel: target ? 'Goal ' + target + ' kg' : '', height: 170, fmt: v => App.n(v, 1) })}
            ${goalPct !== null ? `
              <div class="mt12">
                <div class="between tiny muted mb8"><span>Progress to ${App.n(target, 1)} kg</span><b class="num">${Math.round(goalPct)}%</b></div>
                <div class="bar" style="color:var(--brand);height:8px"><i style="width:${goalPct}%"></i></div>
              </div>` : ''}
          ` : UI.emptyState('scale', 'No weigh-ins yet', 'Log your weight to see the trend and progress toward your goal.',
              `<button class="btn primary mt8" type="button" data-act="log-weight">${App.icon('plus')}Log weight</button>`)}
        </div>

        <!-- Consistency -->
        <div class="stat-row">
          <div class="stat hi"><span class="v">${loggedDays.length}</span><span class="k">Days logged</span></div>
          <div class="stat"><span class="v">${App.int(avg('kcal'))}</span><span class="k">Avg kcal</span></div>
          <div class="stat"><span class="v">${Math.round(avgScore)}</span><span class="k">Avg score</span></div>
        </div>

        <!-- Calories -->
        <div class="card">
          <div class="card-head"><h2>Calories</h2>
            <span class="sub">target ${App.int(t.kcal)}</span></div>
          ${Charts.bars(kcalBars, { goal: t.kcal, height: 170 })}
          <div class="chart-legend">
            <span style="color:var(--brand)"><i></i>On target</span>
            <span style="color:var(--fat)"><i></i>Over</span>
            <span style="color:var(--carbs)"><i></i>Well under</span>
          </div>
        </div>

        <!-- Protein -->
        <div class="card">
          <div class="card-head"><h2>Protein consistency</h2>
            <span class="sub">${hitProtein}/${loggedDays.length} days on target</span></div>
          ${Charts.bars(proteinBars, { goal: t.protein, height: 160, color: 'var(--protein)', fmt: v => Math.round(v) + 'g' })}
          <div class="mt12">
            <div class="between tiny muted mb8"><span>Hit rate</span>
              <b class="num">${loggedDays.length ? Math.round(hitProtein / loggedDays.length * 100) : 0}%</b></div>
            <div class="bar" style="color:var(--protein);height:8px">
              <i style="width:${loggedDays.length ? hitProtein / loggedDays.length * 100 : 0}%"></i></div>
          </div>
        </div>

        <!-- Score -->
        <div class="card">
          <div class="card-head"><h2>Nutrition score</h2>
            <span class="sub">avg ${Math.round(avgScore)}/100</span></div>
          ${Charts.line(scoreLine, { color: 'var(--fiber)', height: 160, minY: 0, maxY: 100, goal: 75, goalLabel: 'Good', fmt: v => Math.round(v) })}
        </div>

        <!-- Training -->
        <div class="card">
          <div class="card-head"><h2>Training</h2>
            <button class="lnk" type="button" data-act="add-workout">${App.icon('plus')}Log</button></div>
          <div class="stat-row">
            <div class="stat hi"><span class="v">${workoutDays}</span><span class="k">Active days</span></div>
            <div class="stat"><span class="v">${App.int(totalBurn)}</span><span class="k">kcal burned</span></div>
            <div class="stat"><span class="v">${App.int(period ? totalBurn / period : 0)}</span><span class="k">per day</span></div>
          </div>
        </div>

        <!-- Measurements -->
        <div class="card">
          <div class="card-head"><h2>Body measurements</h2>
            <button class="lnk" type="button" data-act="log-weight">${App.icon('plus')}Add</button></div>
          ${measurementRows(weights)}
        </div>

        <!-- History -->
        <div class="card flush">
          <div class="card-head" style="padding:var(--pad) var(--pad) 8px;margin:0"><h2>Weigh-in history</h2></div>
          ${weights.length ? `<div class="list">${weights.slice().reverse().slice(0, 20).map(w => `
            <button class="list-item" type="button" data-act="weight-menu" data-date="${w.date}">
              <div class="li-main"><div class="li-title">${App.n(w.kg, 1)} kg</div>
                <div class="li-sub">${App.date.label(w.date)}${w.bodyFat ? ' · ' + App.n(w.bodyFat, 1) + '% fat' : ''}${w.note ? ' · ' + App.esc(w.note) : ''}</div></div>
              ${App.icon('more', 'li-chev')}
            </button>`).join('')}</div>`
            : '<p class="tiny muted" style="padding:0 var(--pad) var(--pad)">Nothing logged yet.</p>'}
        </div>
      </div>`;

      el.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => {
        period = Number(b.dataset.period);
        App.refresh();
      }));
    }
  };

  function measurementRows(weights) {
    const withM = weights.filter(w => w.m && Object.keys(w.m).some(k => w.m[k]));
    if (!withM.length) {
      return '<p class="tiny muted">Log a weigh-in with measurements to track waist, chest and more over time.</p>';
    }
    const latest = withM[withM.length - 1];
    const prev = withM.length > 1 ? withM[withM.length - 2] : null;

    return '<div class="stack" style="gap:11px">' + MEASURES.map(m => {
      const v = latest.m[m.k];
      if (!v) return '';
      const pv = prev && prev.m[m.k];
      const d = pv ? v - pv : null;
      const spark = Charts.spark(withM.map(w => w.m[m.k]).filter(x => x), { color: 'var(--carbs)', width: 70, height: 24 });
      return `<div class="row">
        <span class="grow tiny muted" style="font-weight:600">${m.label}</span>
        ${spark}
        <span class="num" style="font-size:15px;font-weight:680;min-width:56px;text-align:right">${App.n(v, 1)}${m.unit || ' cm'}</span>
        ${d !== null && d !== 0
          ? `<span class="tiny" style="min-width:44px;text-align:right;color:${d < 0 ? 'var(--brand)' : 'var(--fat)'}">${d > 0 ? '+' : ''}${App.n(d, 1)}</span>`
          : '<span class="tiny muted" style="min-width:44px;text-align:right">—</span>'}
      </div>`;
    }).join('') + '</div>';
  }

  /* =========================================================== ACTIONS */

  App.act({
    async 'log-weight'() {
      const date = App.date.today();
      const existing = await Data.DB.get('weights', date);
      const p = App.state.profile;
      const last = (await Data.weights()).slice(-1)[0];

      const s = UI.sheet({
        title: existing ? 'Update weigh-in' : 'Log weight',
        subtitle: App.date.label(date),
        body: `
          <div class="field">
            <label for="lw-kg">Weight</label>
            <div class="input-suffix">
              <input id="lw-kg" type="number" inputmode="decimal" step="0.1"
                     value="${existing ? existing.kg : (last ? last.kg : p.weight || '')}" placeholder="0"><span>kg</span></div>
          </div>
          <div class="field">
            <label for="lw-date">Date</label>
            <input id="lw-date" type="date" value="${date}" max="${date}">
          </div>
          <button class="btn ghost block mb12" type="button" id="lw-more">${App.icon('down')}Body measurements</button>
          <div id="lw-measures" hidden>
            <div class="form-card">
              ${MEASURES.map(m => `
                <div class="field" style="margin-bottom:10px">
                  <label>${m.label}</label>
                  <div class="input-suffix">
                    <input name="${m.k}" type="number" inputmode="decimal" step="0.1"
                           value="${existing && existing.m ? (existing.m[m.k] || '') : ''}" placeholder="0">
                    <span>${m.unit || 'cm'}</span>
                  </div>
                </div>`).join('')}
            </div>
          </div>
          <div class="field mt12"><label>Note</label>
            <input id="lw-note" type="text" placeholder="Morning, after gym…" value="${App.esc(existing ? existing.note || '' : '')}"></div>
        `,
        footer: `${existing ? `<button class="btn danger" type="button" id="lw-del">${App.icon('trash')}</button>` : ''}
                 <button class="btn primary" type="button" id="lw-save">${App.icon('check')}Save</button>`,
        onOpen(el) {
          el.querySelector('#lw-more').addEventListener('click', function () {
            const box = el.querySelector('#lw-measures');
            box.hidden = !box.hidden;
            this.innerHTML = App.icon(box.hidden ? 'down' : 'up') + 'Body measurements';
          });

          el.querySelector('#lw-save').addEventListener('click', async () => {
            const kg = Number(el.querySelector('#lw-kg').value);
            if (!kg || kg <= 0) return UI.toast('Enter a weight', 'err');
            const d = el.querySelector('#lw-date').value || date;

            const m = {};
            MEASURES.forEach(x => {
              const v = Number(el.querySelector(`[name="${x.k}"]`).value);
              if (v > 0) m[x.k] = v;
            });

            await Data.saveWeight({
              date: d, kg,
              bodyFat: m.bodyFat || null,
              m,
              note: el.querySelector('#lw-note').value.trim(),
              ts: Date.now()
            });

            // Keep the profile weight (and therefore targets) in step.
            const prof = App.state.profile;
            if (d >= App.date.today() || !prof.weight) {
              prof.weight = kg;
              if (!prof.startWeight) prof.startWeight = kg;
              await Data.saveProfile(prof);
              App.state.targets = Nutrition.targets(prof);
            }

            App.haptic('ok');
            UI.toast('Weight saved', 'ok');
            s.close();
            App.refresh();
          });

          const del = el.querySelector('#lw-del');
          if (del) del.addEventListener('click', async () => {
            await Data.deleteWeight(date);
            UI.toast('Removed');
            s.close(); App.refresh();
          });
        }
      });
    },

    async 'weight-menu'(el) {
      const date = el.dataset.date;
      const w = await Data.DB.get('weights', date);
      if (!w) return;
      UI.actions({
        title: App.n(w.kg, 1) + ' kg',
        subtitle: App.date.label(date),
        items: [
          { label: 'Delete this weigh-in', icon: 'trash', danger: true, onClick: async () => {
              await Data.deleteWeight(date);
              UI.toast('Deleted', 'ok', { label: 'Undo', onClick: async () => { await Data.saveWeight(w); App.refresh(); } });
              App.refresh();
            } }
        ]
      });
    }
  });
})();
