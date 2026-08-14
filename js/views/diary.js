/* ==========================================================================
   views/diary.js — daily food diary, exercise log, water, notes
   ========================================================================== */
(function () {
  'use strict';

  App.views.diary = {
    title: () => 'Diary',
    sub: () => App.date.label(App.state.date),
    actions: () => `
      <button class="appbar-btn" type="button" data-act="diary-prev" aria-label="Previous day">${App.icon('left')}</button>
      <button class="appbar-btn" type="button" data-act="diary-today" aria-label="Jump to date">${App.icon('plan')}</button>
      <button class="appbar-btn" type="button" data-act="diary-next" aria-label="Next day">${App.icon('right')}</button>`,

    async render(el) {
      const date = App.state.date;
      const t = App.state.targets;

      const [entries, workouts, day, loggedDates] = await Promise.all([
        Data.entriesFor(date),
        Data.workoutsFor(date),
        Data.day(date),
        Data.loggedDates()          // key-only read, just to dot the date strip
      ]);

      const totals = Nutrition.sum(entries.map(e => e.n));
      const burned = Nutrition.burned(workouts);
      const useBurn = App.state.settings.addExercise !== false;
      const goal = t.kcal + (useBurn ? burned : 0);
      const remaining = goal - totals.kcal;

      const loggedSet = new Set(loggedDates);

      /* --- date strip: 7 days back, 3 forward, centred on the selection --- */
      const strip = [];
      for (let i = -7; i <= 3; i++) strip.push(App.date.add(date, i));

      const byMeal = {};
      App.MEALS.forEach(m => byMeal[m.k] = []);
      const supps = [];
      entries.forEach(e => {
        if (e.meal === App.SUPP_MEAL || e.type === 'supplement') supps.push(e);
        else (byMeal[e.meal] || byMeal.snacks).push(e);
      });
      supps.sort((a, b) => a.ts - b.ts);
      Object.keys(byMeal).forEach(k => byMeal[k].sort((a, b) => a.ts - b.ts));

      el.innerHTML = `
      <div class="stack">

        <div class="datestrip bleed" id="datestrip">
          ${strip.map(d => `
            <button class="dscell${d === date ? ' sel' : ''}${loggedSet.has(d) ? ' has' : ''}${App.date.isFuture(d) ? ' future' : ''}"
                    type="button" data-act="diary-set-date" data-date="${d}">
              <span class="dow">${App.date.dow(d)}</span>
              <span class="dnum">${App.date.dayNum(d)}</span>
              <span class="dot"></span>
            </button>`).join('')}
        </div>

        <div class="card">
          <div class="between mb12">
            <div>
              <div class="num" style="font-size:30px;font-weight:750;line-height:1.05;color:${remaining < 0 ? 'var(--protein)' : 'var(--tx)'}">
                ${App.int(Math.abs(remaining))}</div>
              <div class="tiny muted" style="font-weight:600">kcal ${remaining < 0 ? 'over budget' : 'remaining'}</div>
            </div>
            ${Charts.rings([{ pct: App.pct(totals.kcal, goal), color: 'var(--kcal)' }], {
              size: 72, stroke: 8,
              center: `<div class="mini num">${Math.round(App.pct(totals.kcal, goal))}%</div>`
            })}
          </div>
          <div class="stat-row mb12">
            <div class="stat"><span class="v">${App.int(t.kcal)}</span><span class="k">Goal</span></div>
            <div class="stat"><span class="v">${App.int(totals.kcal)}</span><span class="k">Food</span></div>
            <div class="stat"><span class="v">${App.int(burned)}</span><span class="k">Exercise</span></div>
          </div>
          <div class="macro-grid">
            ${UI.macroCell('p', 'Protein', totals.protein, t.protein)}
            ${UI.macroCell('c', 'Carbs', totals.carbs, t.carbs)}
            ${UI.macroCell('f', 'Fat', totals.fat, t.fat)}
          </div>
          <div class="divider" style="margin:14px 0 12px"></div>
          <div class="row wrap" style="gap:14px">
            ${[['Fibre', totals.fiber, t.fiber, 'g'], ['Sugars', totals.sugar, t.sugar, 'g'],
               ['Sat. fat', totals.satfat, t.satfat, 'g'], ['Sodium', totals.na, t.micros.na, 'mg']]
              .map(([l, v, tv, u]) => `<div class="tiny"><span class="muted">${l}</span>
                <b class="num" style="margin-left:5px">${App.n(v, 0)}${u}</b>
                <span class="muted" style="font-size:11px">/${App.n(tv, 0)}${u}</span></div>`).join('')}
          </div>
        </div>

        ${App.MEALS.map(m => mealCard(m, byMeal[m.k])).join('')}

        <!-- Supplements -->
        <div class="card flush">
          <div class="meal-head">
            <div class="ic">${App.icon('sparkle')}</div>
            <h3>Supplements</h3>
            <span class="kc">${supps.length || ''}</span>
            <button class="icon-btn" type="button" data-act="supp-manage" aria-label="Manage supplements"
                    style="width:30px;height:30px">${App.icon('more')}</button>
          </div>
          ${supps.length ? `<div class="list">${supps.map(e => `
            <button class="list-item" type="button" data-act="entry-menu" data-id="${e.id}">
              <div class="li-main">
                <div class="li-title">${App.esc(e.name)}</div>
                <div class="li-sub">${App.n(e.qty, 2)} × ${App.esc(e.servingLabel)}${suppHighlights(e)}</div>
              </div>
              ${e.n.kcal > 1 ? `<div class="li-right"><div class="li-kcal">${App.int(e.n.kcal)}</div>
                <div class="li-macros">kcal</div></div>` : ''}
            </button>`).join('')}</div>` : ''}
          <button class="meal-add" type="button" data-act="supp-log">${App.icon('plus')}Log a supplement</button>
        </div>

        <!-- Exercise -->
        <div class="card flush">
          <div class="meal-head">
            <div class="ic" style="background:rgba(78,168,255,.14);color:var(--carbs)">${App.icon('dumbbell')}</div>
            <h3>Exercise</h3>
            <span class="kc">${App.int(burned)} kcal</span>
          </div>
          ${workouts.length ? `<div class="list">${workouts.map(w => `
            <button class="list-item" type="button" data-act="workout-menu" data-id="${w.id}">
              <div class="li-main">
                <div class="li-title">${App.esc(w.name)}</div>
                <div class="li-sub">${w.minutes ? w.minutes + ' min' : ''}${w.note ? (w.minutes ? ' · ' : '') + App.esc(w.note) : ''}</div>
              </div>
              <div class="li-right"><div class="li-kcal" style="color:var(--carbs)">${App.int(w.kcal)}</div>
              <div class="li-macros">kcal</div></div>
            </button>`).join('')}</div>` : ''}
          <button class="meal-add" type="button" data-act="add-workout">${App.icon('plus')}Add workout</button>
        </div>

        <!-- Water -->
        <div class="card">
          <div class="card-head">
            <h2>Water</h2>
            <span class="sub num">${App.int(day.water)} / ${App.int(t.water)} ml</span>
          </div>
          <div class="bar" style="color:var(--water);height:10px"><i style="width:${App.clamp(App.pct(day.water, t.water), 0, 100)}%"></i></div>
          <div class="btn-row mt12">
            <button class="btn sm" type="button" data-act="diary-water" data-ml="250">${App.icon('water')}+250</button>
            <button class="btn sm" type="button" data-act="diary-water" data-ml="500">+500</button>
            <button class="btn sm" type="button" data-act="diary-water" data-ml="-250">−250</button>
          </div>
        </div>

        <!-- Note -->
        <div class="card">
          <div class="card-head"><h2>Notes</h2></div>
          <textarea id="day-note" placeholder="How did today feel? Hunger, energy, sleep…"
                    style="min-height:76px">${App.esc(day.note || '')}</textarea>
        </div>

        <div class="btn-row">
          <button class="btn ghost" type="button" data-act="copy-day">${App.icon('copy')}Copy a day</button>
          <button class="btn ghost" type="button" data-act="day-summary">${App.icon('list')}Full breakdown</button>
        </div>
      </div>`;

      /* keep the selected date visible in the strip */
      const sel = el.querySelector('.dscell.sel');
      if (sel) sel.parentElement.scrollLeft = sel.offsetLeft - sel.parentElement.clientWidth / 2 + sel.offsetWidth / 2;

      const note = el.querySelector('#day-note');
      note.addEventListener('change', async () => {
        const d = await Data.day(date);
        d.note = note.value;
        await Data.saveDay(d);
      });
    }
  };

  function mealCard(m, list) {
    const kcal = list.reduce((s, e) => s + (e.n.kcal || 0), 0);
    return `<div class="card flush">
      <div class="meal-head">
        <div class="ic">${App.icon(m.icon)}</div>
        <h3>${m.label}</h3>
        <span class="kc">${App.int(kcal)} kcal</span>
        <button class="icon-btn" type="button" data-act="meal-menu" data-meal="${m.k}" aria-label="${m.label} options"
                style="width:30px;height:30px">${App.icon('more')}</button>
      </div>
      ${list.length ? `<div class="list">${list.map(e => `
        <button class="list-item" type="button" data-act="entry-menu" data-id="${e.id}">
          <div class="li-main">
            <div class="li-title">${App.esc(e.name)}</div>
            <div class="li-sub">${App.esc(portionText(e))} · ${UI.macroLine(e.n)}</div>
          </div>
          <div class="li-right"><div class="li-kcal">${App.int(e.n.kcal)}</div><div class="li-macros">kcal</div></div>
        </button>`).join('')}</div>` : ''}
      <button class="meal-add" type="button" data-act="add-food" data-meal="${m.k}">${App.icon('plus')}Add food</button>
    </div>`;
  }

  /** The two biggest nutrients a supplement dose delivered, for the sub-line. */
  function suppHighlights(e) {
    const top = Nutrition.MICROS
      .map(m => ({ m, v: e.n[m.k] || 0 }))
      .filter(x => x.v > 0 && !x.m.limit)
      .sort((a, b) => App.pct(b.v, App.state.targets.micros[b.m.k]) - App.pct(a.v, App.state.targets.micros[a.m.k]))
      .slice(0, 2);
    if (!top.length) return '';
    return ' · ' + top.map(x => x.m.label + ' ' + App.amt(x.v, x.m.unit)).join(', ');
  }

  function portionText(e) {
    if (e.type === 'quick') return 'Quick add';
    if (e.type === 'recipe') return App.n(e.qty, 2) + ' × serving';
    const q = App.n(e.qty, 2);
    return `${q} × ${e.servingLabel}`;
  }

  /* =========================================================== ACTIONS */

  App.act({
    'diary-prev': () => { App.state.date = App.date.add(App.state.date, -1); App.refresh(); },
    'diary-next': () => { App.state.date = App.date.add(App.state.date, 1); App.refresh(); },
    'diary-set-date': el => { App.state.date = el.dataset.date; App.refresh(); },

    'diary-today'() {
      const s = UI.sheet({
        title: 'Jump to date',
        body: `<div class="field"><label>Date</label>
                 <input type="date" id="jd" value="${App.state.date}" max="${App.date.add(App.date.today(), 365)}"></div>
               <button class="btn ghost block" type="button" id="jd-today">${App.icon('refresh')}Back to today</button>`,
        footer: `<button class="btn primary block" type="button" id="jd-go">Go</button>`,
        onOpen(el) {
          el.querySelector('#jd-go').addEventListener('click', () => {
            const v = el.querySelector('#jd').value;
            if (v) { App.state.date = v; App.refresh(); }
            s.close();
          });
          el.querySelector('#jd-today').addEventListener('click', () => {
            App.state.date = App.date.today(); App.refresh(); s.close();
          });
        }
      });
    },

    'add-food': el => FoodSheet.open({ mode: 'diary', date: App.state.date, meal: el.dataset.meal }),

    /** Pick from saved supplements, or create one. */
    async 'supp-log'() {
      const list = await Supplements.all();
      if (!list.length) return Supplements.editor({});
      const date = App.state.date;
      UI.actions({
        title: 'Log a supplement',
        items: list.slice(0, 12).map(sp => ({
          label: sp.name,
          icon: 'sparkle',
          onClick: async () => {
            await Supplements.take(sp, date, 1);
            App.haptic('ok');
            UI.toast(sp.name + ' logged', 'ok');
            App.refresh();
          }
        })).concat([
          '-',
          { label: 'Add a new supplement', icon: 'plus', onClick: () => Supplements.editor({}) }
        ])
      });
    },

    async 'diary-water'(el) {
      const d = await Data.day(App.state.date);
      d.water = Math.max(0, (d.water || 0) + Number(el.dataset.ml));
      await Data.saveDay(d);
      App.haptic('light');
      App.refresh();
    },

    /* ---------------------------------------------------- entry actions */
    async 'entry-menu'(el) {
      const id = el.dataset.id;
      const entries = await Data.entriesFor(App.state.date);
      const entry = entries.find(e => e.id === id);
      if (!entry) return;

      UI.actions({
        title: entry.name,
        subtitle: `${App.int(entry.n.kcal)} kcal · ${UI.macroLine(entry.n)}`,
        items: [
          { label: 'Edit amount', icon: 'edit', onClick: () => editEntry(entry) },
          { label: 'Duplicate', icon: 'copy', onClick: async () => {
              const copy = Object.assign({}, entry, { id: App.uid('e'), ts: Date.now() });
              await Data.saveEntry(copy);
              UI.toast('Duplicated', 'ok'); App.refresh();
            } },
          { label: 'Move to another meal', icon: 'right', onClick: () => moveEntry(entry) },
          { label: 'Copy to another day', icon: 'plan', onClick: () => copyEntryToDay(entry) },
          { label: 'Nutrition detail', icon: 'list', onClick: () => entryDetail(entry) },
          '-',
          { label: 'Delete', icon: 'trash', danger: true, onClick: async () => {
              await Data.deleteEntry(entry.id);
              App.haptic('medium');
              UI.toast('Deleted', 'ok', {
                label: 'Undo',
                onClick: async () => { await Data.saveEntry(entry); App.refresh(); }
              });
              App.refresh();
            } }
        ]
      });
    },

    /* ----------------------------------------------------- meal actions */
    async 'meal-menu'(el) {
      const meal = el.dataset.meal;
      const label = App.mealLabel(meal);
      UI.actions({
        title: label,
        items: [
          { label: 'Add food', icon: 'plus', onClick: () => FoodSheet.open({ mode: 'diary', date: App.state.date, meal }) },
          { label: 'Copy this meal from another day', icon: 'copy', onClick: () => copyMealFrom(meal) },
          { label: 'Save as recipe', icon: 'recipes', onClick: () => saveMealAsRecipe(meal) },
          '-',
          { label: 'Clear ' + label.toLowerCase(), icon: 'trash', danger: true, onClick: async () => {
              const entries = (await Data.entriesFor(App.state.date)).filter(e => e.meal === meal);
              if (!entries.length) return UI.toast('Nothing to clear');
              const ok = await UI.confirm({
                title: `Clear ${label.toLowerCase()}?`,
                message: `${entries.length} item${entries.length === 1 ? '' : 's'} will be removed from ${App.date.label(App.state.date)}.`,
                confirmLabel: 'Clear', danger: true
              });
              if (!ok) return;
              for (const e of entries) await Data.deleteEntry(e.id);
              UI.toast('Cleared', 'ok', { label: 'Undo', onClick: async () => {
                await Data.bulkEntries(entries); App.refresh();
              } });
              App.refresh();
            } }
        ]
      });
    },

    'copy-day': () => copyWholeDay(),

    async 'day-summary'() {
      const entries = await Data.entriesFor(App.state.date);
      const totals = Nutrition.sum(entries.map(e => e.n));
      const t = App.state.targets;
      UI.sheet({
        full: true,
        title: 'Full breakdown',
        subtitle: App.date.label(App.state.date),
        body: `
          <div class="card mb12">
            <div class="macro-grid">
              ${UI.macroCell('p', 'Protein', totals.protein, t.protein)}
              ${UI.macroCell('c', 'Carbs', totals.carbs, t.carbs)}
              ${UI.macroCell('f', 'Fat', totals.fat, t.fat)}
            </div>
          </div>
          <div class="section-title mb8">Vitamins</div>
          <div class="card mb12">${UI.microGrid(totals, t, 'vitamin')}</div>
          <div class="section-title mb8">Minerals</div>
          <div class="card mb12">${UI.microGrid(totals, t, 'mineral')}</div>
          <div class="section-title mb8">Other</div>
          <div class="card"><div class="micro-grid">
            ${Nutrition.OTHER.map(o => {
              const tgt = t[o.k] || (o.k === 'water' ? t.water : 0);
              const pct = tgt ? App.pct(totals[o.k], tgt) : 0;
              return `<div class="micro">
                <div class="lab"><b>${o.label}</b><span>${App.n(totals[o.k], 1)}${o.unit}</span></div>
                <div class="bar" style="color:${o.limit ? (pct > 100 ? 'var(--protein)' : 'var(--brand)') : 'var(--brand)'}">
                  <i style="width:${App.clamp(pct, 0, 100)}%"></i></div>
              </div>`;
            }).join('')}
          </div></div>`
      });
    },

    /* ------------------------------------------------- exercise actions */
    'add-workout': () => workoutSheet(null),

    async 'workout-menu'(el) {
      const list = await Data.workoutsFor(App.state.date);
      const w = list.find(x => x.id === el.dataset.id);
      if (!w) return;
      UI.actions({
        title: w.name,
        subtitle: `${App.int(w.kcal)} kcal${w.minutes ? ' · ' + w.minutes + ' min' : ''}`,
        items: [
          { label: 'Edit', icon: 'edit', onClick: () => workoutSheet(w) },
          { label: 'Delete', icon: 'trash', danger: true, onClick: async () => {
              await Data.deleteWorkout(w.id);
              UI.toast('Deleted', 'ok', { label: 'Undo', onClick: async () => { await Data.saveWorkout(w); App.refresh(); } });
              App.refresh();
            } }
        ]
      });
    }
  });

  /* ====================================================== entry editing */

  function editEntry(entry) {
    const src = entry.refId && entry.type === 'food' ? App.food(entry.refId) : null;
    const recipe = entry.type === 'recipe' ? (App.state.recipesCache || []).find(r => r.id === entry.refId) : null;

    const servings = src ? src.servings.slice() : [{ label: entry.servingLabel, g: entry.servingGrams || 100 }];
    let servIdx = Math.max(0, servings.findIndex(sv => sv.label === entry.servingLabel));

    // Per-1-unit nutrients, used when the source food is no longer available.
    const baseQty = entry.qty || 1;
    const perQty = Nutrition.mul(entry.n, 1 / baseQty);

    const s = UI.sheet({
      title: entry.name,
      subtitle: 'Edit amount',
      body: `
        ${src ? `<div class="field">
          <label for="ee-serving">Serving</label>
          <select id="ee-serving">${servings.map((sv, i) =>
            `<option value="${i}"${i === servIdx ? ' selected' : ''}>${App.esc(sv.label)} — ${App.n(sv.g, sv.g < 10 ? 1 : 0)} ${src.unit || 'g'}</option>`).join('')}</select>
        </div>` : ''}
        <div class="field">
          <label for="ee-qty">Amount</label>
          <div class="stepper">
            <button type="button" id="ee-minus">${App.icon('close')}</button>
            <input type="number" id="ee-qty" value="${entry.qty}" min="0" step="0.25" inputmode="decimal">
            <button type="button" id="ee-plus">${App.icon('plus')}</button>
          </div>
          <div class="quick-pills mt8">${[0.5, 1, 1.5, 2, 3].map(v => `<button type="button" data-q="${v}">${v}×</button>`).join('')}</div>
        </div>
        <div class="field">
          <label>Meal</label>
          <div class="segmented" id="ee-meal">
            ${App.MEALS.map(m => `<button type="button" data-meal="${m.k}" class="${m.k === entry.meal ? 'on' : ''}">${m.label}</button>`).join('')}
          </div>
        </div>
        <div class="card" id="ee-preview"></div>`,
      footer: `<button class="btn danger" type="button" id="ee-del">${App.icon('trash')}</button>
               <button class="btn primary" type="button" id="ee-save">${App.icon('check')}Save</button>`,
      onOpen(el) {
        let meal = entry.meal;
        const qtyEl = el.querySelector('#ee-qty');
        const servEl = el.querySelector('#ee-serving');

        function calc() {
          const q = Math.max(0, Number(qtyEl.value) || 0);
          if (src) {
            const sv = servings[Number(servEl.value) || 0];
            return { n: Nutrition.scale(src.n, q * sv.g), grams: q * sv.g, sv, q };
          }
          if (recipe) {
            const rn = App.recipeNutrition(recipe);
            return { n: Nutrition.mul(rn.perServing, q), grams: rn.gramsPerServing * q, sv: servings[0], q };
          }
          return { n: Nutrition.mul(perQty, q), grams: (entry.servingGrams || 0) * q, sv: servings[0], q };
        }

        function draw() {
          const c = calc();
          el.querySelector('#ee-preview').innerHTML = `
            <div class="between">
              <div><div class="num" style="font-size:26px;font-weight:750;line-height:1">${App.int(c.n.kcal)}</div>
                <div class="tiny muted">kcal${c.grams ? ' · ' + App.n(c.grams, 0) + ' g' : ''}</div></div>
              <div class="tiny muted" style="text-align:right">${UI.macroLine(c.n)}</div>
            </div>`;
        }

        qtyEl.addEventListener('input', draw);
        if (servEl) servEl.addEventListener('change', draw);
        el.querySelector('#ee-plus').addEventListener('click', () => { qtyEl.value = App.round((+qtyEl.value || 0) + 0.5, 2); draw(); });
        el.querySelector('#ee-minus').addEventListener('click', () => { qtyEl.value = Math.max(0, App.round((+qtyEl.value || 0) - 0.5, 2)); draw(); });
        el.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { qtyEl.value = b.dataset.q; draw(); }));
        el.querySelectorAll('[data-meal]').forEach(b => b.addEventListener('click', () => {
          meal = b.dataset.meal;
          el.querySelectorAll('[data-meal]').forEach(x => x.classList.toggle('on', x === b));
        }));

        el.querySelector('#ee-save').addEventListener('click', async () => {
          const c = calc();
          if (c.q <= 0) return UI.toast('Enter an amount above zero', 'err');
          Object.assign(entry, {
            qty: c.q, n: c.n, grams: c.grams, meal,
            servingLabel: c.sv.label, servingGrams: c.sv.g
          });
          await Data.saveEntry(entry);
          App.haptic('ok');
          UI.toast('Updated', 'ok');
          s.close();
          App.refresh();
        });

        el.querySelector('#ee-del').addEventListener('click', async () => {
          await Data.deleteEntry(entry.id);
          UI.toast('Deleted', 'ok', { label: 'Undo', onClick: async () => { await Data.saveEntry(entry); App.refresh(); } });
          s.close();
          App.refresh();
        });

        draw();
      }
    });
  }

  function moveEntry(entry) {
    UI.actions({
      title: 'Move to…',
      items: App.MEALS.filter(m => m.k !== entry.meal).map(m => ({
        label: m.label, icon: m.icon,
        onClick: async () => {
          entry.meal = m.k;
          await Data.saveEntry(entry);
          UI.toast('Moved to ' + m.label, 'ok');
          App.refresh();
        }
      }))
    });
  }

  function copyEntryToDay(entry) {
    datePicker('Copy to which day?', async date => {
      const copy = Object.assign({}, entry, { id: App.uid('e'), date, ts: Date.now() });
      await Data.saveEntry(copy);
      UI.toast('Copied to ' + App.date.label(date), 'ok');
      App.refresh();
    });
  }

  /** Small day picker listing recent days plus a free date input. */
  function datePicker(title, onPick) {
    const today = App.date.today();
    const days = App.date.range(today, 8).reverse();
    const s = UI.sheet({
      title,
      body: `<div class="card flush mb12"><div class="list">
          ${days.map(d => `<button class="list-item" type="button" data-d="${d}">
            <div class="li-main"><div class="li-title">${App.date.label(d)}</div>
            <div class="li-sub">${App.date.dowLong(d)}</div></div>
            ${App.icon('right', 'li-chev')}</button>`).join('')}
        </div></div>
        <div class="field"><label>Or pick a date</label>
          <input type="date" id="dp-date" value="${today}"></div>`,
      footer: `<button class="btn primary block" type="button" id="dp-go">Use this date</button>`,
      onOpen(el) {
        el.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
          s.close(); onPick(b.dataset.d);
        }));
        el.querySelector('#dp-go').addEventListener('click', () => {
          const v = el.querySelector('#dp-date').value;
          if (!v) return;
          s.close(); onPick(v);
        });
      }
    });
  }
  App.datePicker = datePicker;

  function copyMealFrom(meal) {
    datePicker('Copy ' + App.mealLabel(meal).toLowerCase() + ' from…', async date => {
      const src = (await Data.entriesFor(date)).filter(e => e.meal === meal);
      if (!src.length) return UI.toast('Nothing logged for that meal', 'err');
      const copies = src.map(e => Object.assign({}, e, {
        id: App.uid('e'), date: App.state.date, ts: Date.now()
      }));
      await Data.bulkEntries(copies);
      App.haptic('ok');
      UI.toast(`${copies.length} item${copies.length === 1 ? '' : 's'} copied`, 'ok');
      App.refresh();
    });
  }

  function copyWholeDay() {
    datePicker('Copy a whole day from…', async date => {
      const src = await Data.entriesFor(date);
      if (!src.length) return UI.toast('That day is empty', 'err');
      const copies = src.map(e => Object.assign({}, e, {
        id: App.uid('e'), date: App.state.date, ts: Date.now()
      }));
      await Data.bulkEntries(copies);
      App.haptic('ok');
      UI.toast(`${copies.length} items copied from ${App.date.label(date)}`, 'ok');
      App.refresh();
    });
  }

  async function saveMealAsRecipe(meal) {
    const entries = (await Data.entriesFor(App.state.date)).filter(e => e.meal === meal);
    if (!entries.length) return UI.toast('Nothing in this meal yet', 'err');

    const s = UI.sheet({
      title: 'Save as recipe',
      subtitle: `${entries.length} ingredient${entries.length === 1 ? '' : 's'}`,
      body: `<div class="field"><label>Recipe name</label>
               <input id="sr-name" type="text" placeholder="${App.mealLabel(meal)} bowl" autocapitalize="sentences"></div>
             <div class="field"><label>Servings this makes</label>
               <input id="sr-serv" type="number" value="1" min="1" step="1" inputmode="numeric"></div>`,
      footer: `<button class="btn primary block" type="button" id="sr-go">${App.icon('check')}Create recipe</button>`,
      onOpen(el) {
        el.querySelector('#sr-go').addEventListener('click', async () => {
          const name = el.querySelector('#sr-name').value.trim();
          if (!name) return UI.toast('Give it a name', 'err');
          const recipe = {
            id: App.uid('r'),
            name,
            servings: Math.max(1, Number(el.querySelector('#sr-serv').value) || 1),
            minutes: 0,
            cats: [meal],
            image: '',
            instructions: [],
            ingredients: entries.map(e => {
              const src = e.refId ? App.food(e.refId) : null;
              return {
                refId: e.refId, name: e.name,
                grams: e.grams || 0, qty: e.qty, servingLabel: e.servingLabel,
                n100: src ? src.n : (e.grams ? Nutrition.mul(e.n, 100 / e.grams) : e.n)
              };
            }),
            created: Date.now(), updated: Date.now()
          };
          await Data.saveRecipe(recipe);
          App.state.recipesCache = await Data.recipes();
          App.haptic('ok');
          UI.toast('Recipe created', 'ok');
          s.close();
        });
      }
    });
  }

  function entryDetail(entry) {
    const t = App.state.targets;
    UI.sheet({
      full: true,
      title: entry.name,
      subtitle: `${App.int(entry.n.kcal)} kcal · ${App.n(entry.grams, 0)} g`,
      body: `<div class="section-title mb8">Vitamins</div>
             <div class="card mb12">${UI.microGrid(entry.n, t, 'vitamin')}</div>
             <div class="section-title mb8">Minerals</div>
             <div class="card mb12">${UI.microGrid(entry.n, t, 'mineral')}</div>
             <p class="tiny muted center">Percentages are of your full daily reference intake.</p>`
    });
  }

  /* ==================================================== workout sheet */

  function workoutSheet(existing) {
    const p = App.state.profile;
    const s = UI.sheet({
      title: existing ? 'Edit workout' : 'Add workout',
      body: `
        <div class="field">
          <label for="wo-type">Activity</label>
          <select id="wo-type">${Nutrition.EXERCISES.map(e =>
            `<option value="${e.k}"${existing && existing.type === e.k ? ' selected' : ''}>${e.label}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="wo-name">Name</label>
          <input id="wo-name" type="text" placeholder="Push day / 5k run" value="${App.esc(existing ? existing.name : '')}" autocapitalize="sentences">
        </div>
        <div class="field-row">
          <div class="field"><label>Duration</label>
            <div class="input-suffix"><input id="wo-min" type="number" inputmode="numeric" value="${existing ? existing.minutes || '' : 45}" placeholder="45"><span>min</span></div></div>
          <div class="field"><label>Calories</label>
            <div class="input-suffix"><input id="wo-kcal" type="number" inputmode="numeric" value="${existing ? existing.kcal || '' : ''}" placeholder="auto"><span>kcal</span></div></div>
        </div>
        <div class="hint mb12" id="wo-hint"></div>
        <div class="field"><label>Notes</label>
          <textarea id="wo-note" placeholder="Sets, weights, how it felt…" style="min-height:70px">${App.esc(existing ? existing.note || '' : '')}</textarea></div>`,
      footer: `<button class="btn primary block" type="button" id="wo-save">${App.icon('check')}Save workout</button>`,
      onOpen(el) {
        const typeEl = el.querySelector('#wo-type');
        const minEl = el.querySelector('#wo-min');
        const kcalEl = el.querySelector('#wo-kcal');
        const nameEl = el.querySelector('#wo-name');
        let kcalTouched = !!(existing && existing.kcal);

        function estimate() {
          const est = Nutrition.burn(typeEl.value, minEl.value, p.weight);
          el.querySelector('#wo-hint').textContent = `Estimated ${est} kcal for ${minEl.value || 0} min at ${p.weight} kg.`;
          if (!kcalTouched) kcalEl.value = est || '';
        }
        typeEl.addEventListener('change', () => {
          if (!nameEl.value) nameEl.value = Nutrition.EXERCISES.find(e => e.k === typeEl.value).label;
          estimate();
        });
        minEl.addEventListener('input', estimate);
        kcalEl.addEventListener('input', () => { kcalTouched = true; });
        estimate();

        el.querySelector('#wo-save').addEventListener('click', async () => {
          const w = {
            id: existing ? existing.id : App.uid('w'),
            date: existing ? existing.date : App.state.date,
            type: typeEl.value,
            name: nameEl.value.trim() || Nutrition.EXERCISES.find(e => e.k === typeEl.value).label,
            minutes: Number(minEl.value) || 0,
            kcal: Number(kcalEl.value) || Nutrition.burn(typeEl.value, minEl.value, p.weight),
            note: el.querySelector('#wo-note').value.trim(),
            ts: Date.now()
          };
          await Data.saveWorkout(w);
          App.haptic('ok');
          UI.toast('Workout saved', 'ok');
          s.close();
          App.refresh();
        });
      }
    });
  }
  App.workoutSheet = workoutSheet;
})();
