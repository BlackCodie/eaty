/* ==========================================================================
   views/plan.js — weekly meal planner + generated shopping list
   ========================================================================== */
(function () {
  'use strict';

  let tab = 'week';                 // 'week' | 'shop'
  let weekStart = null;             // Monday key

  const slotKey = (date, meal) => date + '|' + meal;

  App.views.plan = {
    title: () => 'Meal plan',
    sub: () => {
      const ws = weekStart || App.date.weekStart(App.date.today());
      return App.date.short(ws) + ' – ' + App.date.short(App.date.add(ws, 6));
    },
    actions: () => `
      <button class="appbar-btn" type="button" data-act="plan-prev" aria-label="Previous week">${App.icon('left')}</button>
      <button class="appbar-btn" type="button" data-act="plan-menu" aria-label="Plan options">${App.icon('more')}</button>
      <button class="appbar-btn" type="button" data-act="plan-next" aria-label="Next week">${App.icon('right')}</button>`,

    async render(el) {
      if (!weekStart) weekStart = App.date.weekStart(App.date.today());
      const plan = await Data.plan(weekStart);
      const days = App.date.range(App.date.add(weekStart, 6), 7);
      const today = App.date.today();
      const t = App.state.targets;

      el.innerHTML = `
      <div class="stack">
        <div class="segmented" id="plan-tabs">
          <button type="button" data-ptab="week" class="${tab === 'week' ? 'on' : ''}">${App.icon('plan')}Week</button>
          <button type="button" data-ptab="shop" class="${tab === 'shop' ? 'on' : ''}">${App.icon('cart')}Shopping list</button>
        </div>
        <div id="plan-body"></div>
      </div>`;

      el.querySelectorAll('[data-ptab]').forEach(b => b.addEventListener('click', () => {
        tab = b.dataset.ptab; App.refresh();
      }));

      const body = el.querySelector('#plan-body');
      if (tab === 'week') renderWeek(body, plan, days, today, t);
      else await renderShopping(body, plan);
    }
  };

  /* ============================================================== WEEK */

  function renderWeek(box, plan, days, today, t) {
    const weekKcal = days.reduce((s, d) => s + dayKcal(plan, d), 0);
    const plannedDays = days.filter(d => dayKcal(plan, d) > 0).length;

    box.innerHTML = `
      <div class="stack">
        <div class="stat-row">
          <div class="stat hi"><span class="v">${plannedDays}/7</span><span class="k">Days planned</span></div>
          <div class="stat"><span class="v">${App.int(plannedDays ? weekKcal / plannedDays : 0)}</span><span class="k">Avg kcal/day</span></div>
          <div class="stat"><span class="v">${App.int(t.kcal)}</span><span class="k">Your target</span></div>
        </div>

        ${days.map(d => dayHtml(plan, d, today, t)).join('')}

        <button class="btn ghost block" type="button" data-act="plan-shopping">
          ${App.icon('cart')}Generate shopping list</button>
      </div>`;

    enableDrag(box, plan);
  }

  function dayKcal(plan, date) {
    let k = 0;
    App.MEALS.forEach(m => (plan.slots[slotKey(date, m.k)] || []).forEach(i => k += (i.n && i.n.kcal) || 0));
    return k;
  }

  function dayHtml(plan, date, today, t) {
    const kcal = dayKcal(plan, date);
    const over = kcal > t.kcal * 1.08;
    return `<div class="plan-day${date === today ? ' today' : ''}">
      <div class="plan-day-head">
        <div>
          <div class="d">${App.date.dowLong(date)}</div>
          <div class="dt">${App.date.short(date)}</div>
        </div>
        <span class="kc" style="${over ? 'color:var(--fat)' : ''}">${App.int(kcal)} kcal</span>
        <button class="icon-btn" type="button" data-act="plan-day-menu" data-date="${date}"
                style="width:30px;height:30px" aria-label="Day options">${App.icon('more')}</button>
      </div>
      ${App.MEALS.map(m => {
        const items = plan.slots[slotKey(date, m.k)] || [];
        return `<div class="slot" data-slot="${slotKey(date, m.k)}">
          <span class="slot-label">${m.label.slice(0, 5)}</span>
          <div class="slot-items">
            ${items.map((i, idx) => `<span class="plan-pill" data-pill="${idx}" data-from="${slotKey(date, m.k)}">
              <span>${App.esc(i.name)}</span><small>${App.int(i.n.kcal)}</small></span>`).join('')}
          </div>
          <button class="slot-add" type="button" data-act="plan-add" data-date="${date}" data-meal="${m.k}"
                  aria-label="Add to ${m.label}">${App.icon('plus')}</button>
        </div>`;
      }).join('')}
    </div>`;
  }

  /* --------------------------------------------------- drag and drop */

  function enableDrag(root, plan) {
    let ghost = null, src = null, srcIdx = -1, pill = null, dropSlot = null;
    let startX = 0, startY = 0, holdTimer = null, active = false;

    root.querySelectorAll('.plan-pill').forEach(el => {
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('click', onClick);
    });

    function onClick(e) {
      if (active) { e.preventDefault(); e.stopPropagation(); return; }
      const el = e.currentTarget;
      openItemMenu(plan, el.dataset.from, Number(el.dataset.pill));
    }

    function onDown(e) {
      if (!e.isPrimary) return;
      pill = e.currentTarget;
      src = pill.dataset.from;
      srcIdx = Number(pill.dataset.pill);
      startX = e.clientX; startY = e.clientY;
      active = false;
      try { pill.setPointerCapture(e.pointerId); } catch (_) {}
      holdTimer = setTimeout(() => begin(e.clientX, e.clientY), 240);
      pill.addEventListener('pointermove', onMove);
      pill.addEventListener('pointerup', onUp);
      pill.addEventListener('pointercancel', onUp);
    }

    function begin(x, y) {
      clearTimeout(holdTimer);
      if (active || !pill) return;
      active = true;
      App.haptic('medium');
      const r = pill.getBoundingClientRect();
      ghost = pill.cloneNode(true);
      ghost.classList.add('ghost');
      ghost.style.width = r.width + 'px';
      ghost.style.left = r.left + 'px';
      ghost.style.top = r.top + 'px';
      ghost.dataset.ox = x - r.left;
      ghost.dataset.oy = y - r.top;
      document.body.appendChild(ghost);
      pill.classList.add('dragging');
      // Stop the view from scrolling underneath the drag.
      const view = pill.closest('.view');
      if (view) { view.dataset.lockScroll = '1'; view.style.overflowY = 'hidden'; }
    }

    function onMove(e) {
      if (!pill) return;
      const dx = Math.abs(e.clientX - startX), dy = Math.abs(e.clientY - startY);
      if (!active) {
        if (dx > 10 || dy > 10) begin(e.clientX, e.clientY);
        return;
      }
      e.preventDefault();
      ghost.style.left = (e.clientX - Number(ghost.dataset.ox)) + 'px';
      ghost.style.top = (e.clientY - Number(ghost.dataset.oy)) + 'px';

      ghost.style.visibility = 'hidden';
      const under = document.elementFromPoint(e.clientX, e.clientY);
      ghost.style.visibility = '';
      const slot = under && under.closest('.slot');
      if (slot !== dropSlot) {
        if (dropSlot) dropSlot.classList.remove('drop-target');
        dropSlot = slot;
        if (dropSlot) { dropSlot.classList.add('drop-target'); App.haptic('light'); }
      }
    }

    async function onUp() {
      clearTimeout(holdTimer);
      if (pill) {
        pill.removeEventListener('pointermove', onMove);
        pill.removeEventListener('pointerup', onUp);
        pill.removeEventListener('pointercancel', onUp);
        pill.classList.remove('dragging');
      }
      const view = document.querySelector('.view[data-lock-scroll]');
      if (view) { view.style.overflowY = ''; delete view.dataset.lockScroll; }

      if (ghost) { ghost.remove(); ghost = null; }
      const target = dropSlot;
      if (dropSlot) { dropSlot.classList.remove('drop-target'); dropSlot = null; }

      if (active && target && target.dataset.slot !== src) {
        const dest = target.dataset.slot;
        const list = plan.slots[src] || [];
        const item = list[srcIdx];
        if (item) {
          list.splice(srcIdx, 1);
          if (!list.length) delete plan.slots[src];
          (plan.slots[dest] = plan.slots[dest] || []).push(item);
          await Data.savePlan(plan);
          App.haptic('ok');
          App.refresh();
        }
      }
      // Let the synthetic click fire first, then clear the flag.
      setTimeout(() => { active = false; }, 60);
      pill = null;
    }
  }

  /* ========================================================== SHOPPING */

  const SHOP_ORDER = ['Vegetables', 'Fruit', 'Meat & Poultry', 'Fish & Seafood', 'Dairy & Eggs',
    'Grains & Bread', 'Legumes & Soy', 'Nuts & Seeds', 'Fats & Oils', 'Condiments',
    'Drinks', 'Snacks & Sweets', 'Supplements', 'Other'];

  async function renderShopping(box, plan) {
    const list = await Data.shopping(weekStart);

    if (!list.items.length) {
      box.innerHTML = UI.emptyState('cart', 'No shopping list yet',
        'Plan some meals for this week, then generate a list — ingredients are combined and grouped by aisle.',
        `<button class="btn primary mt8" type="button" data-act="plan-shopping">${App.icon('sparkle')}Generate from plan</button>`);
      return;
    }

    const groups = {};
    list.items.forEach(i => { (groups[i.cat] = groups[i.cat] || []).push(i); });
    const ordered = SHOP_ORDER.filter(c => groups[c]);
    const doneCount = list.items.filter(i => i.done).length;

    box.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="between">
            <div>
              <div class="num" style="font-size:24px;font-weight:750;line-height:1.1">${doneCount}/${list.items.length}</div>
              <div class="tiny muted">items collected</div>
            </div>
            <div class="row" style="gap:8px">
              <button class="icon-btn" type="button" data-act="shop-add" aria-label="Add item">${App.icon('plus')}</button>
              <button class="icon-btn" type="button" data-act="shop-menu" aria-label="List options">${App.icon('more')}</button>
            </div>
          </div>
          <div class="bar mt12" style="color:var(--brand);height:8px">
            <i style="width:${App.pct(doneCount, list.items.length)}%"></i></div>
        </div>

        ${ordered.map(cat => `
          <div class="card flush shop-group">
            <div class="meal-head"><div class="ic">${App.icon('cart')}</div><h3>${App.esc(cat)}</h3>
              <span class="kc">${groups[cat].filter(i => i.done).length}/${groups[cat].length}</span></div>
            ${groups[cat].map(i => `
              <button class="shop-item${i.done ? ' done' : ''}" type="button" data-act="shop-toggle" data-key="${App.esc(i.key)}">
                <span class="shop-box">${App.icon('check')}</span>
                <span class="si-main"><b>${App.esc(i.name)}</b><small>${App.esc(i.amount)}</small></span>
              </button>`).join('')}
          </div>`).join('')}
      </div>`;
  }

  /** Aggregate everything in the week's plan into a grouped shopping list. */
  async function generate() {
    const plan = await Data.plan(weekStart);
    const acc = {};

    function push(name, cat, grams, unit, refId) {
      const key = (refId || name).toLowerCase();
      if (!acc[key]) acc[key] = { key, name, cat: cat || 'Other', grams: 0, unit: unit || 'g' };
      acc[key].grams += grams || 0;
    }

    Object.keys(plan.slots).forEach(k => {
      (plan.slots[k] || []).forEach(item => {
        if (item.type === 'recipe') {
          const r = (App.state.recipesCache || []).find(x => x.id === item.refId);
          if (r) {
            const factor = (Number(item.qty) || 1) / Math.max(1, r.servings);
            (r.ingredients || []).forEach(ing => {
              const f = ing.refId ? App.food(ing.refId) : null;
              push(ing.name, f ? f.cat : 'Other', (ing.grams || 0) * factor, f ? f.unit : 'g', ing.refId);
            });
            return;
          }
        }
        const f = item.refId ? App.food(item.refId) : null;
        push(item.name, f ? f.cat : 'Other', item.grams || 0, f ? f.unit : 'g', item.refId);
      });
    });

    const existing = await Data.shopping(weekStart);
    const doneMap = {};
    existing.items.forEach(i => { if (i.done) doneMap[i.key] = true; });
    const manual = existing.items.filter(i => i.manual);

    const items = Object.values(acc).map(a => ({
      key: a.key,
      name: a.name,
      cat: a.cat,
      amount: fmtAmount(a.grams, a.unit),
      grams: Math.round(a.grams),
      done: !!doneMap[a.key]
    })).sort((a, b) => a.name.localeCompare(b.name));

    manual.forEach(m => { if (!items.find(i => i.key === m.key)) items.push(m); });

    await Data.saveShopping({ week: weekStart, items, generatedAt: Date.now() });
    return items.length;
  }

  function fmtAmount(grams, unit) {
    if (!grams) return '';
    if (unit === 'ml') return grams >= 1000 ? App.n(grams / 1000, 2) + ' L' : Math.round(grams) + ' ml';
    return grams >= 1000 ? App.n(grams / 1000, 2) + ' kg' : Math.round(grams) + ' g';
  }

  /* =========================================================== ACTIONS */

  App.act({
    'plan-prev': () => { weekStart = App.date.add(weekStart, -7); App.refresh(); },
    'plan-next': () => { weekStart = App.date.add(weekStart, 7); App.refresh(); },

    'plan-add': el => {
      const { date, meal } = el.dataset;
      FoodSheet.open({
        mode: 'pick',
        title: 'Plan ' + App.mealLabel(meal),
        onPick: async entry => {
          const plan = await Data.plan(weekStart);
          const key = slotKey(date, meal);
          (plan.slots[key] = plan.slots[key] || []).push(stripEntry(entry));
          await Data.savePlan(plan);
          App.haptic('ok');
          UI.toast('Added to ' + App.date.dowLong(date), 'ok');
          App.refresh();
        }
      });
    },

    async 'plan-shopping'() {
      const n = await generate();
      if (!n) return UI.toast('Plan some meals first', 'err');
      tab = 'shop';
      App.haptic('ok');
      UI.toast(`${n} item${n === 1 ? '' : 's'} on your list`, 'ok');
      App.refresh();
    },

    async 'plan-day-menu'(el) {
      const date = el.dataset.date;
      const plan = await Data.plan(weekStart);
      UI.actions({
        title: App.date.dowLong(date),
        subtitle: App.date.short(date) + ' · ' + App.int(dayKcal(plan, date)) + ' kcal planned',
        items: [
          { label: 'Log this day to the diary', icon: 'check', onClick: () => applyDay(date) },
          { label: 'Copy this day to…', icon: 'copy', onClick: () => copyDay(date) },
          '-',
          { label: 'Clear this day', icon: 'trash', danger: true, onClick: async () => {
              App.MEALS.forEach(m => delete plan.slots[slotKey(date, m.k)]);
              await Data.savePlan(plan);
              UI.toast('Day cleared'); App.refresh();
            } }
        ]
      });
    },

    async 'plan-menu'() {
      UI.actions({
        title: 'Meal plan',
        subtitle: App.date.short(weekStart) + ' – ' + App.date.short(App.date.add(weekStart, 6)),
        items: [
          { label: 'Generate shopping list', icon: 'cart', onClick: () => App.actions['plan-shopping']() },
          { label: 'Log the whole week to the diary', icon: 'check', onClick: () => applyWeek() },
          { label: 'Copy last week into this one', icon: 'copy', onClick: () => copyWeek() },
          { label: 'Jump to this week', icon: 'refresh', onClick: () => {
              weekStart = App.date.weekStart(App.date.today()); App.refresh();
            } },
          '-',
          { label: 'Clear this week', icon: 'trash', danger: true, onClick: async () => {
              const ok = await UI.confirm({
                title: 'Clear the week?', message: 'Every planned meal for this week will be removed.',
                confirmLabel: 'Clear', danger: true
              });
              if (!ok) return;
              await Data.savePlan({ week: weekStart, slots: {} });
              UI.toast('Week cleared'); App.refresh();
            } }
        ]
      });
    },

    async 'shop-toggle'(el) {
      const list = await Data.shopping(weekStart);
      const item = list.items.find(i => i.key === el.dataset.key);
      if (!item) return;
      item.done = !item.done;
      await Data.saveShopping(list);
      el.classList.toggle('done', item.done);
      App.haptic('light');
      // Update the header counters without a full re-render.
      const done = list.items.filter(i => i.done).length;
      const head = App.$('#plan-body .card .num');
      if (head) head.textContent = done + '/' + list.items.length;
      const bar = App.$('#plan-body .card .bar i');
      if (bar) bar.style.width = App.pct(done, list.items.length) + '%';
    },

    'shop-add'() {
      const s = UI.sheet({
        title: 'Add to list',
        body: `<div class="field"><label>Item</label>
                 <input id="sa-name" type="text" placeholder="Kitchen roll" autocapitalize="sentences"></div>
               <div class="field-row">
                 <div class="field"><label>Amount</label><input id="sa-amt" type="text" placeholder="2 packs"></div>
                 <div class="field"><label>Aisle</label>
                   <select id="sa-cat">${SHOP_ORDER.map(c => `<option>${c}</option>`).join('')}</select></div>
               </div>`,
        footer: `<button class="btn primary block" type="button" id="sa-go">${App.icon('plus')}Add item</button>`,
        onOpen(el) {
          el.querySelector('#sa-go').addEventListener('click', async () => {
            const name = el.querySelector('#sa-name').value.trim();
            if (!name) return UI.toast('Name the item', 'err');
            const list = await Data.shopping(weekStart);
            list.items.push({
              key: 'manual-' + App.uid(''), name,
              amount: el.querySelector('#sa-amt').value.trim(),
              cat: el.querySelector('#sa-cat').value,
              done: false, manual: true
            });
            await Data.saveShopping(list);
            s.close(); App.refresh();
          });
        }
      });
    },

    async 'shop-menu'() {
      UI.actions({
        title: 'Shopping list',
        items: [
          { label: 'Regenerate from plan', icon: 'refresh', onClick: async () => {
              const n = await generate(); UI.toast(`${n} items`, 'ok'); App.refresh();
            } },
          { label: 'Copy as text', icon: 'copy', onClick: () => copyListText() },
          { label: 'Uncheck everything', icon: 'close', onClick: async () => {
              const list = await Data.shopping(weekStart);
              list.items.forEach(i => i.done = false);
              await Data.saveShopping(list); App.refresh();
            } },
          '-',
          { label: 'Remove collected items', icon: 'trash', onClick: async () => {
              const list = await Data.shopping(weekStart);
              list.items = list.items.filter(i => !i.done);
              await Data.saveShopping(list); UI.toast('Cleaned up'); App.refresh();
            } },
          { label: 'Delete the whole list', icon: 'trash', danger: true, onClick: async () => {
              await Data.saveShopping({ week: weekStart, items: [], generatedAt: 0 });
              UI.toast('List deleted'); App.refresh();
            } }
        ]
      });
    }
  });

  /* ------------------------------------------------------------ helpers */

  function stripEntry(entry) {
    return {
      id: App.uid('pi'), type: entry.type, refId: entry.refId, name: entry.name,
      qty: entry.qty, servingLabel: entry.servingLabel, servingGrams: entry.servingGrams,
      grams: entry.grams, unit: entry.unit, n: entry.n
    };
  }

  function openItemMenu(plan, key, idx) {
    const item = (plan.slots[key] || [])[idx];
    if (!item) return;
    const [date, meal] = key.split('|');

    UI.actions({
      title: item.name,
      subtitle: `${App.int(item.n.kcal)} kcal · ${App.date.dowLong(date)} ${App.mealLabel(meal).toLowerCase()}`,
      items: [
        { label: 'Log to diary now', icon: 'check', onClick: async () => {
            await Data.saveEntry(Object.assign({}, item, {
              id: App.uid('e'), date, meal, ts: Date.now()
            }));
            App.haptic('ok');
            UI.toast('Logged to ' + App.date.label(date), 'ok');
          } },
        { label: 'Move to another meal', icon: 'right', onClick: () => {
            UI.actions({
              title: 'Move to…',
              items: App.MEALS.map(m => ({
                label: App.date.dowLong(date) + ' · ' + m.label,
                icon: m.icon,
                onClick: async () => {
                  plan.slots[key].splice(idx, 1);
                  if (!plan.slots[key].length) delete plan.slots[key];
                  const dest = slotKey(date, m.k);
                  (plan.slots[dest] = plan.slots[dest] || []).push(item);
                  await Data.savePlan(plan); App.refresh();
                }
              }))
            });
          } },
        '-',
        { label: 'Remove from plan', icon: 'trash', danger: true, onClick: async () => {
            plan.slots[key].splice(idx, 1);
            if (!plan.slots[key].length) delete plan.slots[key];
            await Data.savePlan(plan);
            UI.toast('Removed'); App.refresh();
          } }
      ]
    });
  }

  async function applyDay(date) {
    const plan = await Data.plan(weekStart);
    const rows = [];
    App.MEALS.forEach(m => {
      (plan.slots[slotKey(date, m.k)] || []).forEach(i => {
        rows.push(Object.assign({}, i, { id: App.uid('e'), date, meal: m.k, ts: Date.now() }));
      });
    });
    if (!rows.length) return UI.toast('Nothing planned that day', 'err');
    await Data.bulkEntries(rows);
    App.haptic('ok');
    UI.toast(`${rows.length} item${rows.length === 1 ? '' : 's'} logged to ${App.date.label(date)}`, 'ok');
  }

  async function applyWeek() {
    const ok = await UI.confirm({
      title: 'Log the whole week?',
      message: 'Every planned item is added to the diary on its day. Existing entries are kept.',
      confirmLabel: 'Log week'
    });
    if (!ok) return;
    const plan = await Data.plan(weekStart);
    const rows = [];
    Object.keys(plan.slots).forEach(k => {
      const [date, meal] = k.split('|');
      (plan.slots[k] || []).forEach(i => {
        rows.push(Object.assign({}, i, { id: App.uid('e'), date, meal, ts: Date.now() }));
      });
    });
    if (!rows.length) return UI.toast('Nothing planned this week', 'err');
    await Data.bulkEntries(rows);
    App.haptic('ok');
    UI.toast(`${rows.length} items logged`, 'ok');
  }

  function copyDay(date) {
    App.datePicker('Copy this day to…', async target => {
      const plan = await Data.plan(weekStart);
      const targetWeek = App.date.weekStart(target);
      const destPlan = targetWeek === weekStart ? plan : await Data.plan(targetWeek);
      App.MEALS.forEach(m => {
        const items = plan.slots[slotKey(date, m.k)] || [];
        if (!items.length) return;
        const dk = slotKey(target, m.k);
        destPlan.slots[dk] = (destPlan.slots[dk] || []).concat(
          items.map(i => Object.assign({}, i, { id: App.uid('pi') })));
      });
      await Data.savePlan(destPlan);
      if (targetWeek !== weekStart) await Data.savePlan(plan);
      UI.toast('Copied to ' + App.date.label(target), 'ok');
      App.refresh();
    });
  }

  async function copyWeek() {
    const prev = await Data.plan(App.date.add(weekStart, -7));
    if (!Object.keys(prev.slots).length) return UI.toast('Last week is empty', 'err');
    const plan = await Data.plan(weekStart);
    Object.keys(prev.slots).forEach(k => {
      const [date, meal] = k.split('|');
      const nk = slotKey(App.date.add(date, 7), meal);
      plan.slots[nk] = (plan.slots[nk] || []).concat(
        prev.slots[k].map(i => Object.assign({}, i, { id: App.uid('pi') })));
    });
    await Data.savePlan(plan);
    App.haptic('ok');
    UI.toast('Last week copied across', 'ok');
    App.refresh();
  }

  async function copyListText() {
    const list = await Data.shopping(weekStart);
    const groups = {};
    list.items.forEach(i => (groups[i.cat] = groups[i.cat] || []).push(i));
    const text = SHOP_ORDER.filter(c => groups[c]).map(c =>
      c + '\n' + groups[c].map(i => `- ${i.name}${i.amount ? ' (' + i.amount + ')' : ''}`).join('\n')
    ).join('\n\n');

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Shopping list', text });
      } else {
        await navigator.clipboard.writeText(text);
        UI.toast('Copied to clipboard', 'ok');
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      UI.toast('Could not share the list', 'err');
    }
  }

  /** Called from the recipe detail sheet. */
  App.addRecipeToPlan = function (recipe) {
    if (!weekStart) weekStart = App.date.weekStart(App.date.today());
    const days = App.date.range(App.date.add(weekStart, 6), 7);
    const s = UI.sheet({
      title: 'Add to plan',
      subtitle: recipe.name,
      body: `<div class="field"><label>Day</label>
               <select id="ap-day">${days.map(d =>
                 `<option value="${d}"${d === App.date.today() ? ' selected' : ''}>${App.date.dowLong(d)} — ${App.date.short(d)}</option>`).join('')}</select></div>
             <div class="field"><label>Meal</label>
               <select id="ap-meal">${App.MEALS.map(m => `<option value="${m.k}">${m.label}</option>`).join('')}</select></div>
             <div class="field"><label>Servings</label>
               <input id="ap-qty" type="number" value="1" min="0.25" step="0.25" inputmode="decimal"></div>`,
      footer: `<button class="btn primary block" type="button" id="ap-go">${App.icon('plus')}Add to plan</button>`,
      onOpen(el) {
        el.querySelector('#ap-go').addEventListener('click', async () => {
          const date = el.querySelector('#ap-day').value;
          const meal = el.querySelector('#ap-meal').value;
          const qty = Number(el.querySelector('#ap-qty').value) || 1;
          const plan = await Data.plan(App.date.weekStart(date));
          const key = slotKey(date, meal);
          (plan.slots[key] = plan.slots[key] || []).push(stripEntry(App.entryFromRecipe(recipe, qty)));
          await Data.savePlan(plan);
          App.haptic('ok');
          UI.toast('Added to ' + App.date.dowLong(date), 'ok');
          s.close();
          App.go('plan');
        });
      }
    });
  };
})();
