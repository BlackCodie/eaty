/* ==========================================================================
   foodsheet.js — food search, portion picker, custom foods, quick add.
   Shared by the diary, the recipe editor and the meal planner.
   ========================================================================== */
(function () {
  'use strict';

  const MEALS = App.MEALS = [
    { k: 'breakfast', label: 'Breakfast', icon: 'apple' },
    { k: 'lunch',     label: 'Lunch',     icon: 'leaf' },
    { k: 'dinner',    label: 'Dinner',    icon: 'recipes' },
    { k: 'snacks',    label: 'Snacks',    icon: 'sparkle' }
  ];
  App.mealLabel = k => (MEALS.find(m => m.k === k) || { label: k }).label;

  /* ------------------------------------------------ food/recipe resolving */

  /** Look up a food by id across built-ins and the user's custom foods. */
  App.food = function (id) {
    return FoodDB.byId(id) ||
      (App.state.customFoods || []).find(f => f.id === id) || null;
  };

  /**
   * Totals for a recipe. Ingredients carry an `n100` snapshot so a recipe
   * still computes correctly if its source food is later edited or removed.
   */
  App.recipeNutrition = function (recipe) {
    const ings = (recipe && recipe.ingredients) || [];
    const total = Nutrition.sum(ings.map(i => {
      const src = i.refId ? App.food(i.refId) : null;
      const per100 = (src && src.n) || i.n100 || {};
      return Nutrition.scale(per100, i.grams || 0);
    }));
    const servings = Math.max(1, Number(recipe && recipe.servings) || 1);
    const grams = ings.reduce((s, i) => s + (Number(i.grams) || 0), 0);
    return {
      total,
      perServing: Nutrition.mul(total, 1 / servings),
      grams,
      gramsPerServing: grams / servings
    };
  };

  /* ------------------------------------------------------- entry building */

  /** Does this food carry real micronutrient data, or only a pack label? */
  App.foodHasMicros = function (food) {
    if (!food) return false;
    if (food.builtin) return true;
    if (!food.declared) return true;                  // hand-entered with full detail
    return Nutrition.MICROS.filter(m => !m.limit)
      .some(m => food.declared.indexOf(m.k) !== -1);
  };

  /** Build a diary entry from a built-in/custom food. */
  function entryFromFood(food, qty, serving, meta) {
    const grams = (Number(qty) || 0) * (serving.g || 100);
    return Object.assign({
      id: App.uid('e'),
      type: 'food',
      refId: food.id,
      name: food.name,
      unit: food.unit || 'g',
      qty: Number(qty) || 0,
      servingLabel: serving.label,
      servingGrams: serving.g,
      grams,
      n: Nutrition.scale(food.n, grams),
      // Recorded at log time so the daily score can tell "zero" from "unknown".
      hasMicros: App.foodHasMicros(food),
      ts: Date.now()
    }, meta || {});
  }

  /** Build a diary entry from a recipe (qty = number of servings). */
  function entryFromRecipe(recipe, qty, meta) {
    const rn = App.recipeNutrition(recipe);
    const q = Number(qty) || 0;
    return Object.assign({
      id: App.uid('e'),
      type: 'recipe',
      refId: recipe.id,
      name: recipe.name,
      unit: 'serving',
      qty: q,
      servingLabel: q === 1 ? '1 serving' : q + ' servings',
      servingGrams: rn.gramsPerServing,
      grams: rn.gramsPerServing * q,
      n: Nutrition.mul(rn.perServing, q),
      // A recipe knows its micros only if its ingredients did.
      hasMicros: (recipe.ingredients || []).some(i => {
        const src = i.refId ? App.food(i.refId) : null;
        return src ? App.foodHasMicros(src) : true;
      }),
      ts: Date.now()
    }, meta || {});
  }

  App.entryFromFood = entryFromFood;
  App.entryFromRecipe = entryFromRecipe;

  /* ============================================================ SEARCH UI */

  let searchState = { tab: 'all', q: '' };

  /**
   * FoodSheet.open({
   *   mode: 'diary' | 'pick',      // 'pick' returns the chosen item instead of logging
   *   date, meal,                  // diary mode
   *   title,
   *   allowRecipes: true,
   *   onPick(entryLike)            // pick mode
   * })
   */
  function open(opts) {
    const o = Object.assign({ mode: 'diary', allowRecipes: true }, opts);
    searchState = { tab: 'all', q: '' };

    const s = UI.sheet({
      full: true,
      title: o.title || (o.mode === 'diary' ? 'Add to ' + App.mealLabel(o.meal) : 'Choose food'),
      subtitle: o.mode === 'diary' && o.date ? App.date.label(o.date) : '',
      body: `
        <div class="sticky-tools">
          <div class="searchbar with-scan">
            ${App.icon('search')}
            <input type="search" id="fs-q" placeholder="Search foods or scan a barcode"
                   autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
            <button class="clr" type="button" id="fs-clr" hidden aria-label="Clear">${App.icon('close')}</button>
            <button class="scan-btn" type="button" id="fs-scan" aria-label="Scan barcode">${App.icon('barcode')}</button>
          </div>
          <div class="chips mt12" id="fs-tabs">
            <button class="chip on" data-fstab="all">All</button>
            <button class="chip" data-fstab="online">${App.icon('barcode')}Products</button>
            <button class="chip" data-fstab="fav">${App.icon('star')}Favourites</button>
            <button class="chip" data-fstab="recent">${App.icon('clock')}Recent</button>
            ${o.allowRecipes ? `<button class="chip" data-fstab="recipe">${App.icon('recipes')}Recipes</button>` : ''}
            <button class="chip" data-fstab="mine">${App.icon('user')}My foods</button>
          </div>
        </div>
        <div id="fs-results"><div class="skeleton" style="height:56px;margin-bottom:8px"></div>
          <div class="skeleton" style="height:56px;margin-bottom:8px"></div>
          <div class="skeleton" style="height:56px"></div></div>`,
      footer: `
        <button class="btn ghost" type="button" id="fs-custom">${App.icon('plus')}New food</button>
        <button class="btn ghost" type="button" id="fs-quick">${App.icon('bolt')}Quick add</button>`,
      onOpen(el) {
        const input = el.querySelector('#fs-q');
        const clr = el.querySelector('#fs-clr');

        const run = App.debounce(() => render(el, o, s), 130);
        input.addEventListener('input', () => {
          searchState.q = input.value;
          clr.hidden = !input.value;
          run();
        });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
        clr.addEventListener('click', () => {
          input.value = ''; searchState.q = ''; clr.hidden = true; render(el, o, s); input.focus();
        });

        el.querySelectorAll('[data-fstab]').forEach(b => b.addEventListener('click', () => {
          el.querySelectorAll('[data-fstab]').forEach(x => x.classList.toggle('on', x === b));
          searchState.tab = b.dataset.fstab;
          render(el, o, s);
        }));

        el.querySelector('#fs-custom').addEventListener('click', () => openCustomFood({
          onSaved(food) { openPortion({ kind: 'food', data: food }, o, s); }
        }));
        el.querySelector('#fs-quick').addEventListener('click', () => openQuickAdd(o, s));
        el.querySelector('#fs-scan').addEventListener('click', () =>
          Scanner.scanAndAdd(Object.assign({}, o, { parent: s })));

        render(el, o, s);
      }
    });
    return s;
  }

  async function render(el, o, sheetApi) {
    const box = el.querySelector('#fs-results');
    if (!box) return;
    const tab = searchState.tab;
    const q = searchState.q.trim();

    let rows = [];
    if (tab === 'online') {
      if (!q) {
        box.innerHTML = UI.emptyState('barcode', 'Search packaged products',
          'Type a product or brand to search Open Food Facts — millions of items with strong German coverage. Or scan the barcode directly.',
          `<button class="btn primary mt8" type="button" data-act="scan-from-search">${App.icon('barcode')}Scan a barcode</button>`);
        wireScan(box, o, sheetApi);
        return;
      }
      box.innerHTML = `<div class="card"><div class="empty" style="padding:26px 20px">
        <div class="ic" style="background:var(--brand-dim);color:var(--brand)">${App.icon('search')}</div>
        <h3>Searching Open Food Facts…</h3>
        <div class="boot-bar mt8" style="width:150px"><i></i></div></div></div>`;
      // Query both databases at once: Open Food Facts for packaged goods,
      // FoodData Central for analysed generic foods with full micronutrients.
      const [offRes, fdcRes] = await Promise.allSettled([
        OFF.search(q, { limit: 25 }),
        FDC.search(q, { limit: 15 })
      ]);
      if (searchState.q.trim() !== q || searchState.tab !== 'online') return;   // superseded

      const products = [];
      const seenKey = new Set();
      const push = f => {
        const key = (f.barcode || (f.source + ':' + f.name)).toLowerCase();
        if (seenKey.has(key)) return;
        seenKey.add(key);
        products.push(f);
      };
      // Interleave so neither source buries the other.
      const a = offRes.status === 'fulfilled' ? offRes.value : [];
      const b = fdcRes.status === 'fulfilled' ? fdcRes.value : [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i]) push(a[i]);
        if (b[i]) push(b[i]);
      }

      // Nothing online? Fall back to the saved German pack, which needs no network.
      if (!products.length) {
        try { (await LocalPack.search(q, 25)).forEach(push); } catch (_) {}
      }

      if (!products.length && offRes.status === 'rejected' && fdcRes.status === 'rejected') {
        box.innerHTML = UI.emptyState('info', 'Could not search', OFF.message(offRes.reason),
          `<button class="btn ghost mt8" type="button" data-act="scan-from-search">${App.icon('barcode')}Scan instead</button>`);
        wireScan(box, o, sheetApi);
        return;
      }
      // Remember why a source dropped out so the footer can explain it.
      lastOnlineNote = '';
      if (fdcRes.status === 'rejected' &&
          (fdcRes.reason.code === 'rate-limit' || fdcRes.reason.code === 'bad-key')) {
        lastOnlineNote = FDC.message(fdcRes.reason);
      }
      rows = products.map(f => ({ kind: 'food', data: f, online: true }));
      if (!rows.length) {
        box.innerHTML = UI.emptyState('search', 'No products found',
          'Try the brand name, or scan the barcode — that always finds the exact item.',
          `<button class="btn ghost mt8" type="button" data-act="scan-from-search">${App.icon('barcode')}Scan a barcode</button>`);
        wireScan(box, o, sheetApi);
        return;
      }
    } else if (tab === 'recipe') {
      const recipes = await Data.recipes();
      const filtered = q
        ? recipes.filter(r => (r.name + ' ' + (r.cats || []).join(' ')).toLowerCase().includes(q.toLowerCase()))
        : recipes;
      rows = filtered
        .sort((a, b) => (b.updated || 0) - (a.updated || 0))
        .map(r => ({ kind: 'recipe', data: r }));
    } else if (tab === 'fav') {
      const favs = await Data.favorites();
      rows = favs.sort((a, b) => b.ts - a.ts).map(f => resolveRef(f.id)).filter(Boolean);
      if (q) rows = rows.filter(r => r.data.name.toLowerCase().includes(q.toLowerCase()));
    } else if (tab === 'recent') {
      const recents = await Data.recents();
      rows = recents.map(r => resolveRef(r.id)).filter(Boolean).slice(0, 40);
      if (q) rows = rows.filter(r => r.data.name.toLowerCase().includes(q.toLowerCase()));
    } else if (tab === 'mine') {
      const custom = await Data.customFoods();
      const list = q ? custom.filter(f => f.name.toLowerCase().includes(q.toLowerCase())) : custom;
      rows = list.sort((a, b) => a.name.localeCompare(b.name)).map(f => ({ kind: 'food', data: f }));
    } else {
      const custom = await Data.customFoods();
      rows = FoodDB.search(q, custom, 80).map(f => ({ kind: 'food', data: f }));
      if (o.allowRecipes && q) {
        const recipes = await Data.recipes();
        const rm = recipes.filter(r => r.name.toLowerCase().includes(q.toLowerCase()))
          .map(r => ({ kind: 'recipe', data: r }));
        rows = rm.concat(rows);
      }
    }

    if (!rows.length) {
      box.innerHTML = UI.emptyState(
        'search',
        q ? 'No matches' : (tab === 'fav' ? 'No favourites yet' : tab === 'recent' ? 'Nothing logged yet' : tab === 'mine' ? 'No custom foods' : 'Nothing here'),
        q ? 'Try a shorter word, or create it as a new food.'
          : tab === 'fav' ? 'Star a food while adding it and it will show up here.'
          : tab === 'mine' ? 'Add foods that are not in the database — they stay on your device.'
          : 'Foods you log will appear here for quick re-entry.'
      );
      return;
    }

    box.innerHTML = '<div class="card flush"><div class="list">' + rows.map((r, i) => rowHtml(r, i)).join('') + '</div></div>' +
      (tab === 'online' ? onlineFooter() : '');

    box.querySelectorAll('[data-fsrow]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const r = rows[Number(btn.dataset.fsrow)];
        if (!r) return;
        // Online results are only persisted once you actually pick one.
        if (r.online) { try { await OFF.save(r.data); } catch (_) {} }
        openPortion(r, o, sheetApi);
      });
    });
    box.querySelectorAll('img[data-fallback]').forEach(img => {
      img.addEventListener('error', () => img.remove());
    });
  }

  let lastOnlineNote = '';

  function onlineFooter() {
    const base = 'Open Food Facts + USDA FoodData Central. Adding one saves it to your device for offline use.';
    return `<p class="tiny muted center mt12" style="line-height:1.5">${base}</p>` +
      (lastOnlineNote
        ? `<p class="tiny center mt8" style="line-height:1.5;color:var(--warn)">${App.esc(lastOnlineNote)}</p>`
        : '');
  }

  function wireScan(box, o, sheetApi) {
    const btn = box.querySelector('[data-act="scan-from-search"]');
    if (btn) btn.addEventListener('click', () =>
      Scanner.scanAndAdd(Object.assign({}, o, { parent: sheetApi })));
  }

  function resolveRef(refId) {
    if (refId.startsWith('recipe:')) {
      const id = refId.slice(7);
      const r = (App.state.recipesCache || []).find(x => x.id === id);
      return r ? { kind: 'recipe', data: r } : null;
    }
    const f = App.food(refId.replace(/^food:/, ''));
    return f ? { kind: 'food', data: f } : null;
  }

  function rowHtml(r, i) {
    if (r.kind === 'recipe') {
      const rn = App.recipeNutrition(r.data);
      return `<button class="list-item" type="button" data-fsrow="${i}">
        <div class="li-ic" style="background:var(--brand-dim);color:var(--brand)">${App.icon('recipes')}</div>
        <div class="li-main">
          <div class="li-title">${App.esc(r.data.name)}</div>
          <div class="li-sub">Recipe · per serving · ${UI.macroLine(rn.perServing)}</div>
        </div>
        <div class="li-right"><div class="li-kcal">${App.int(rn.perServing.kcal)}</div>
        <div class="li-macros">kcal</div></div>
      </button>`;
    }
    const f = r.data;
    const sv = f.servings[0] || { label: '100 g', g: 100 };
    const n = Nutrition.scale(f.n, sv.g);
    const badge = (f.source === 'off' || f.source === 'pack' || f.source === 'fdc')
      ? ` <span class="badge off-badge">${f.source === 'fdc' ? 'USDA' : 'Product'}</span>`
      : f.builtin ? '' : ' <span class="badge">Mine</span>';
    const rating = Quality.rate(f);
    return `<button class="list-item" type="button" data-fsrow="${i}">
      ${f.image ? `<img class="li-photo" src="${App.esc(f.image)}" alt="" loading="lazy" data-fallback>` : ''}
      ${UI.gradePill(rating)}
      <div class="li-main">
        <div class="li-title">${App.esc(f.name)}${badge}</div>
        <div class="li-sub">${App.esc(sv.label)} · ${UI.macroLine(n)}</div>
      </div>
      <div class="li-right"><div class="li-kcal">${App.int(n.kcal)}</div>
      <div class="li-macros">kcal</div></div>
    </button>`;
  }

  /* =========================================================== PORTION UI */

  async function openPortion(source, o, parentSheet) {
    const isRecipe = source.kind === 'recipe';
    const data = source.data;
    const refId = (isRecipe ? 'recipe:' : 'food:') + data.id;
    const fav = await Data.isFav(refId);

    let servings, servIdx = 0, qty = 1;
    if (isRecipe) {
      servings = [{ label: 'serving', g: App.recipeNutrition(data).gramsPerServing }];
    } else {
      servings = data.servings.slice();
    }

    let meal = o.meal || 'snacks';

    const s = UI.sheet({
      title: data.name,
      subtitle: isRecipe ? 'Recipe' : App.esc(data.cat || ''),
      headerRight: `<button class="icon-btn${fav ? ' accent' : ''}" type="button" id="pt-fav" aria-label="Favourite">${App.icon('star')}</button>`,
      body: `
        <div class="field">
          <label for="pt-serving">Serving</label>
          <select id="pt-serving">${servings.map((sv, i) =>
            `<option value="${i}">${App.esc(sv.label)}${isRecipe ? '' : ` — ${App.n(sv.g, sv.g < 10 ? 1 : 0)} ${data.unit || 'g'}`}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="pt-qty">Amount</label>
          <div class="stepper">
            <button type="button" id="pt-minus" aria-label="Less">${App.icon('close')}</button>
            <input type="number" id="pt-qty" value="1" min="0" step="0.25" inputmode="decimal">
            <button type="button" id="pt-plus" aria-label="More">${App.icon('plus')}</button>
          </div>
          <div class="quick-pills mt8">
            ${[0.5, 1, 1.5, 2, 3].map(v => `<button type="button" data-q="${v}">${v}×</button>`).join('')}
          </div>
          <div class="hint" id="pt-grams"></div>
        </div>

        ${o.mode === 'diary' ? `<div class="field">
          <label>Meal</label>
          <div class="segmented" id="pt-meal">
            ${MEALS.map(m => `<button type="button" data-meal="${m.k}" class="${m.k === meal ? 'on' : ''}">${m.label}</button>`).join('')}
          </div>
        </div>` : ''}

        <div class="card mt16" id="pt-preview"></div>
        ${!isRecipe ? `<div class="section-title mt16 mb8" id="pt-quality-title">Food quality</div>
          <div class="card" id="pt-quality"></div>` : ''}
        <div class="mt12" id="pt-micros"></div>
      `,
      footer: o.batch
        ? `<button class="btn ghost" type="button" id="pt-add-next" style="flex:0 0 auto;padding:0 14px">
             ${App.icon('barcode')}Add &amp; scan</button>
           <button class="btn primary" type="button" id="pt-add">
             ${App.icon('plus')}<span id="pt-add-label">Add</span></button>`
        : `<button class="btn primary block" type="button" id="pt-add">
             ${App.icon('plus')}<span id="pt-add-label">Add</span></button>`,
      onOpen(el) {
        const qtyEl = el.querySelector('#pt-qty');
        const servEl = el.querySelector('#pt-serving');

        // Quality depends on the food, not the portion, so render it once.
        const qBox = el.querySelector('#pt-quality');
        if (qBox) {
          const card = UI.qualityCard(data);
          if (card) {
            qBox.innerHTML = card;
          } else {
            qBox.remove();
            const t = el.querySelector('#pt-quality-title');
            if (t) t.remove();
          }
        }

        function update() {
          qty = Math.max(0, Number(qtyEl.value) || 0);
          servIdx = Number(servEl.value) || 0;
          const sv = servings[servIdx];
          const n = isRecipe
            ? Nutrition.mul(App.recipeNutrition(data).perServing, qty)
            : Nutrition.scale(data.n, qty * sv.g);

          el.querySelector('#pt-grams').textContent = isRecipe
            ? `${App.n(qty, 2)} × serving (~${App.n(sv.g * qty, 0)} g)`
            : `${App.n(qty * sv.g, 1)} ${data.unit || 'g'} total`;

          el.querySelector('#pt-preview').innerHTML = `
            <div class="between mb12">
              <div><div class="num" style="font-size:28px;font-weight:750;line-height:1">${App.int(n.kcal)}</div>
                   <div class="tiny muted" style="font-weight:600">calories</div></div>
              ${Charts.rings([{ pct: 100, color: 'var(--kcal)' }], {
                size: 52, stroke: 6,
                center: `<div class="mini">${App.n(n.fiber, 1)}g</div><div class="tiny muted" style="font-size:9px">fibre</div>`
              })}
            </div>
            <div class="macro-grid">
              ${['protein', 'carbs', 'fat'].map((k, i) => {
                const cls = ['p', 'c', 'f'][i];
                const lbl = ['Protein', 'Carbs', 'Fat'][i];
                const tot = n.protein * 4 + n.carbs * 4 + n.fat * 9;
                const share = tot > 0 ? (n[k] * (k === 'fat' ? 9 : 4)) / tot * 100 : 0;
                return `<div class="macro ${cls}">
                  <div class="top"><span class="name">${lbl}</span>
                  <span class="num">${App.n(n[k], 1)}<small>g</small></span></div>
                  <div class="bar"><i style="width:${share}%"></i></div>
                  <div class="tiny muted">${Math.round(share)}% of energy</div>
                </div>`;
              }).join('')}
            </div>`;

          const t = App.state.targets;
          if (t) {
            const top = Nutrition.MICROS
              .map(m => ({ m, pct: App.pct(n[m.k] || 0, t.micros[m.k]) }))
              .filter(x => !x.m.limit && x.pct >= 5)
              .sort((a, b) => b.pct - a.pct).slice(0, 6);
            const partialNote = (!isRecipe && data.partialMicros)
              ? `<div class="card mt12" style="display:flex;gap:11px;align-items:flex-start">
                   <span style="flex:none;color:var(--warn);margin-top:1px">${App.icon('info')}</span>
                   <span class="tiny" style="line-height:1.55">
                     This product's packaging only declares energy and macros, which is all EU labels
                     require. Its vitamins and minerals are unknown, so it adds nothing to your
                     micronutrient coverage for the day.
                   </span>
                 </div>`
              : '';

            el.querySelector('#pt-micros').innerHTML = (top.length
              ? `<div class="section-title mb8">Notable nutrients</div>
                 <div class="card"><div class="micro-grid">${top.map(x => `
                   <div class="micro good">
                     <div class="lab"><b>${x.m.label}</b><span>${Math.round(x.pct)}%</span></div>
                     <div class="bar" style="color:var(--brand)"><i style="width:${App.clamp(x.pct, 0, 100)}%"></i></div>
                   </div>`).join('')}</div></div>`
              : '') + partialNote;
          }

          const lbl = el.querySelector('#pt-add-label');
          if (lbl) lbl.textContent = o.mode === 'diary'
            ? `Add ${App.int(n.kcal)} kcal to ${App.mealLabel(meal)}`
            : `Add ${App.int(n.kcal)} kcal`;
        }

        servEl.addEventListener('change', update);
        qtyEl.addEventListener('input', update);
        el.querySelector('#pt-plus').addEventListener('click', () => {
          qtyEl.value = App.round((Number(qtyEl.value) || 0) + 0.5, 2); update(); App.haptic('light');
        });
        el.querySelector('#pt-minus').addEventListener('click', () => {
          qtyEl.value = Math.max(0, App.round((Number(qtyEl.value) || 0) - 0.5, 2)); update(); App.haptic('light');
        });
        el.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
          qtyEl.value = b.dataset.q; update(); App.haptic('light');
        }));
        el.querySelectorAll('[data-meal]').forEach(b => b.addEventListener('click', () => {
          meal = b.dataset.meal;
          el.querySelectorAll('[data-meal]').forEach(x => x.classList.toggle('on', x === b));
          update();
        }));

        el.querySelector('#pt-fav').addEventListener('click', async function () {
          const now = await Data.toggleFav(refId, { kind: source.kind, name: data.name });
          this.classList.toggle('accent', now);
          App.haptic('light');
          UI.toast(now ? 'Added to favourites' : 'Removed from favourites');
        });

        async function commit(scanAgain) {
          const sv = servings[servIdx];
          if (qty <= 0) return UI.toast('Enter an amount above zero', 'err');

          const entry = isRecipe
            ? entryFromRecipe(data, qty)
            : entryFromFood(data, qty, sv);

          await Data.pushRecent({ id: refId, name: data.name, kind: source.kind });

          if (o.mode === 'diary') {
            entry.date = o.date;
            entry.meal = meal;
            await Data.saveEntry(entry);
            App.haptic('ok');
            UI.toast(`${data.name} added`, 'ok');
            s.close();
            if (scanAgain) {
              // Straight back to the camera — logging a whole shop should not
              // mean reopening the scanner between every item.
              setTimeout(() => Scanner.scanAndAdd({
                mode: 'diary', date: o.date, meal, batch: true, parent: parentSheet || null
              }), 260);
            } else {
              if (parentSheet) parentSheet.close();
            }
            App.refresh();
          } else {
            s.close();
            if (parentSheet) parentSheet.close();
            if (o.onPick) o.onPick(entry, source);
          }
        }

        el.querySelector('#pt-add').addEventListener('click', () => commit(false));
        const nextBtn = el.querySelector('#pt-add-next');
        if (nextBtn) nextBtn.addEventListener('click', () => commit(true));

        update();
      }
    });
  }

  /* ======================================================= CUSTOM FOOD UI */

  function openCustomFood(opts) {
    const o = opts || {};
    const existing = o.food || null;
    // `prefill` seeds a brand-new food (e.g. a scanned product whose label the
    // database is missing) without turning the sheet into an edit-existing one.
    const seed = existing || o.prefill || null;
    const n = (seed && seed.n) || {};

    const microFields = Nutrition.MICROS.concat(
      [{ k: 'sugar', label: 'Sugars', unit: 'g' }, { k: 'satfat', label: 'Saturated fat', unit: 'g' },
       { k: 'chol', label: 'Cholesterol', unit: 'mg' }]
    );

    const s = UI.sheet({
      full: true,
      title: existing ? 'Edit food' : 'New food',
      subtitle: 'Values per 100 g / 100 ml',
      body: `
        <div class="field">
          <label for="cf-name">Name</label>
          <input id="cf-name" name="name" type="text" placeholder="e.g. Bakery sourdough" value="${App.esc(seed ? seed.name : '')}" autocapitalize="sentences">
        </div>

        <div class="field">
          <label for="cf-barcode">Barcode <span class="muted" style="font-weight:400">(optional)</span></label>
          <div class="searchbar with-scan">
            <span style="position:absolute;left:13px;width:18px;color:var(--tx-3)">${App.icon('barcode')}</span>
            <input id="cf-barcode" name="barcode" type="text" inputmode="numeric" style="padding-left:40px"
                   placeholder="Scan or type" value="${App.esc((o.barcode || (seed && seed.barcode)) || '')}">
            <button class="scan-btn" type="button" id="cf-scan" aria-label="Scan barcode">${App.icon('camera')}</button>
          </div>
          <div class="hint">Attach a barcode and scanning this product later finds it instantly, offline.</div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="cf-cat">Category</label>
            <select id="cf-cat" name="cat">${FoodDB.CATS.map(c =>
              `<option${seed && seed.cat === c ? ' selected' : ''}>${c}</option>`).join('')}</select>
          </div>
          <div class="field" style="max-width:110px">
            <label for="cf-unit">Unit</label>
            <select id="cf-unit" name="unit">
              <option value="g"${seed && seed.unit === 'g' ? ' selected' : ''}>grams</option>
              <option value="ml"${seed && seed.unit === 'ml' ? ' selected' : ''}>millilitres</option>
            </select>
          </div>
        </div>

        <div class="section-title mb8">Per 100</div>
        <div class="form-card">
          <div class="field-row">
            <div class="field"><label>Calories</label>
              <div class="input-suffix"><input name="kcal" type="number" inputmode="decimal" step="any" value="${n.kcal || ''}" placeholder="0"><span>kcal</span></div></div>
            <div class="field"><label>Protein</label>
              <div class="input-suffix"><input name="protein" type="number" inputmode="decimal" step="any" value="${n.protein || ''}" placeholder="0"><span>g</span></div></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Carbs</label>
              <div class="input-suffix"><input name="carbs" type="number" inputmode="decimal" step="any" value="${n.carbs || ''}" placeholder="0"><span>g</span></div></div>
            <div class="field"><label>Fat</label>
              <div class="input-suffix"><input name="fat" type="number" inputmode="decimal" step="any" value="${n.fat || ''}" placeholder="0"><span>g</span></div></div>
          </div>
          <div class="field" style="margin-bottom:0"><label>Fibre</label>
            <div class="input-suffix"><input name="fiber" type="number" inputmode="decimal" step="any" value="${n.fiber || ''}" placeholder="0"><span>g</span></div></div>
          <div class="hint mt8" id="cf-check"></div>
        </div>

        <div class="section-title mt16 mb8">Servings</div>
        <div class="form-card">
          <div id="cf-servings"></div>
          <button class="btn ghost sm mt12" type="button" id="cf-add-serving">${App.icon('plus')}Add serving</button>
          <div class="hint mt8">A serving lets you log “1 slice” instead of typing grams.</div>
        </div>

        <button class="btn ghost block mt16" type="button" id="cf-toggle-micro">
          ${App.icon('down')}Micronutrients (optional)</button>
        <div id="cf-micros" hidden class="mt12">
          <div class="form-card">
            ${microFields.map(m => `
              <div class="field" style="margin-bottom:10px">
                <label>${m.label}</label>
                <div class="input-suffix">
                  <input name="${m.k}" type="number" inputmode="decimal" step="any" value="${n[m.k] || ''}" placeholder="0">
                  <span>${m.unit}</span>
                </div>
              </div>`).join('')}
          </div>
        </div>
      `,
      footer: `${existing ? `<button class="btn danger" type="button" id="cf-del">${App.icon('trash')}</button>` : ''}
               <button class="btn primary" type="button" id="cf-save">${App.icon('check')}Save food</button>`,
      onOpen(el) {
        /* servings editor */
        let servings = (seed && Array.isArray(seed.servings))
          ? seed.servings.filter(sv => !/^(100|1) (g|ml)$/.test(sv.label)).map(sv => ({ label: sv.label, g: sv.g }))
          : [];
        if (!servings.length) servings = [{ label: '', g: '' }];

        function drawServings() {
          el.querySelector('#cf-servings').innerHTML = servings.map((sv, i) => `
            <div class="field-row" style="align-items:flex-end;margin-bottom:10px">
              <div class="field" style="margin:0">
                ${i === 0 ? '<label>Description</label>' : ''}
                <input data-sv-label="${i}" type="text" placeholder="1 slice" value="${App.esc(sv.label)}">
              </div>
              <div class="field" style="margin:0;max-width:100px">
                ${i === 0 ? '<label>Weight</label>' : ''}
                <div class="input-suffix"><input data-sv-g="${i}" type="number" inputmode="decimal" step="any" placeholder="30" value="${sv.g}"><span>g</span></div>
              </div>
              <button class="icon-btn danger" type="button" data-sv-del="${i}" style="margin-bottom:1px">${App.icon('trash')}</button>
            </div>`).join('');

          el.querySelectorAll('[data-sv-label]').forEach(inp => inp.addEventListener('input', () => {
            servings[Number(inp.dataset.svLabel)].label = inp.value;
          }));
          el.querySelectorAll('[data-sv-g]').forEach(inp => inp.addEventListener('input', () => {
            servings[Number(inp.dataset.svG)].g = inp.value;
          }));
          el.querySelectorAll('[data-sv-del]').forEach(b => b.addEventListener('click', () => {
            servings.splice(Number(b.dataset.svDel), 1);
            if (!servings.length) servings = [{ label: '', g: '' }];
            drawServings();
          }));
        }
        drawServings();
        el.querySelector('#cf-add-serving').addEventListener('click', () => {
          servings.push({ label: '', g: '' }); drawServings();
        });

        el.querySelector('#cf-scan').addEventListener('click', async () => {
          const code = await Scanner.scan();
          if (code) {
            el.querySelector('#cf-barcode').value = code;
            UI.toast('Barcode captured', 'ok');
          }
        });

        el.querySelector('#cf-toggle-micro').addEventListener('click', function () {
          const box = el.querySelector('#cf-micros');
          box.hidden = !box.hidden;
          this.innerHTML = App.icon(box.hidden ? 'down' : 'up') + 'Micronutrients (optional)';
        });

        /* live macro/calorie sanity check */
        const check = () => {
          const f = UI.readForm(el);
          const derived = (f.protein || 0) * 4 + (f.carbs || 0) * 4 + (f.fat || 0) * 9;
          const box = el.querySelector('#cf-check');
          if (!f.kcal || !derived) { box.textContent = ''; return; }
          const diff = Math.abs(derived - f.kcal) / f.kcal;
          box.innerHTML = diff > 0.18
            ? `<span style="color:var(--warn)">Macros work out to ~${Math.round(derived)} kcal — check the numbers.</span>`
            : `<span style="color:var(--brand)">Macros match ~${Math.round(derived)} kcal ✓</span>`;
        };
        el.addEventListener('input', check);
        check();

        el.querySelector('#cf-save').addEventListener('click', async () => {
          const f = UI.readForm(el);
          if (!f.name || !String(f.name).trim()) return UI.toast('Give the food a name', 'err');

          const nn = Nutrition.empty();
          Nutrition.KEYS.forEach(k => { if (f[k] !== undefined && f[k] !== null) nn[k] = Number(f[k]) || 0; });
          if (!nn.kcal) nn.kcal = Nutrition.kcalFromMacros(nn);

          const svs = servings
            .filter(sv => String(sv.label).trim() && Number(sv.g) > 0)
            .map(sv => ({ label: String(sv.label).trim(), g: Number(sv.g) }));
          const unit = f.unit || 'g';
          svs.push({ label: '100 ' + unit, g: 100 });
          svs.push({ label: '1 ' + unit, g: 1 });

          const barcode = String(f.barcode || '').replace(/\D/g, '');
          const food = {
            id: existing ? existing.id : (barcode ? 'off-' + barcode : App.uid('cf')),
            name: String(f.name).trim(),
            cat: f.cat || 'Snacks & Sweets',
            unit,
            n: nn,
            servings: svs,
            barcode: barcode || null,
            declared: Nutrition.KEYS.filter(k => nn[k] > 0),
            partialMicros: Nutrition.MICROS.filter(m => nn[m.k] > 0).length < 5,
            search: (f.name + ' ' + f.cat + ' ' + barcode).toLowerCase(),
            builtin: false,
            updated: Date.now()
          };
          await Data.saveFood(food);
          App.state.customFoods = await Data.customFoods();
          App.haptic('ok');
          UI.toast('Food saved', 'ok');
          s.close();
          if (o.onSaved) o.onSaved(food);
        });

        const delBtn = el.querySelector('#cf-del');
        if (delBtn) delBtn.addEventListener('click', async () => {
          const ok = await UI.confirm({
            title: 'Delete this food?',
            message: 'Diary entries you already logged keep their numbers.',
            confirmLabel: 'Delete', danger: true
          });
          if (!ok) return;
          await Data.deleteFood(existing.id);
          App.state.customFoods = await Data.customFoods();
          UI.toast('Food deleted');
          s.close();
          if (o.onSaved) o.onSaved(null);
        });
      }
    });
  }

  /* ========================================================== QUICK ADD */

  function openQuickAdd(o, parentSheet) {
    let meal = o.meal || 'snacks';
    const s = UI.sheet({
      title: 'Quick add',
      subtitle: 'For when you only know the numbers',
      body: `
        <div class="field">
          <label for="qa-name">Description</label>
          <input id="qa-name" name="name" type="text" placeholder="Restaurant meal" autocapitalize="sentences">
        </div>
        <div class="field-row">
          <div class="field"><label>Calories</label>
            <div class="input-suffix"><input name="kcal" type="number" inputmode="decimal" placeholder="0"><span>kcal</span></div></div>
          <div class="field"><label>Protein</label>
            <div class="input-suffix"><input name="protein" type="number" inputmode="decimal" placeholder="0"><span>g</span></div></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Carbs</label>
            <div class="input-suffix"><input name="carbs" type="number" inputmode="decimal" placeholder="0"><span>g</span></div></div>
          <div class="field"><label>Fat</label>
            <div class="input-suffix"><input name="fat" type="number" inputmode="decimal" placeholder="0"><span>g</span></div></div>
        </div>
        <div class="field"><label>Fibre</label>
          <div class="input-suffix"><input name="fiber" type="number" inputmode="decimal" placeholder="0"><span>g</span></div></div>
        ${o.mode === 'diary' ? `<div class="field">
          <label>Meal</label>
          <div class="segmented" id="qa-meal">
            ${MEALS.map(m => `<button type="button" data-meal="${m.k}" class="${m.k === meal ? 'on' : ''}">${m.label}</button>`).join('')}
          </div></div>` : ''}
      `,
      footer: `<button class="btn primary block" type="button" id="qa-save">${App.icon('check')}Add</button>`,
      onOpen(el) {
        el.querySelectorAll('[data-meal]').forEach(b => b.addEventListener('click', () => {
          meal = b.dataset.meal;
          el.querySelectorAll('[data-meal]').forEach(x => x.classList.toggle('on', x === b));
        }));
        el.querySelector('#qa-save').addEventListener('click', async () => {
          const f = UI.readForm(el);
          const nn = Nutrition.empty();
          ['kcal', 'protein', 'carbs', 'fat', 'fiber'].forEach(k => nn[k] = Number(f[k]) || 0);
          if (!nn.kcal) nn.kcal = Nutrition.kcalFromMacros(nn);
          if (!nn.kcal) return UI.toast('Enter at least calories', 'err');

          const entry = {
            id: App.uid('e'), type: 'quick', refId: null,
            name: (f.name && String(f.name).trim()) || 'Quick add',
            unit: 'item', qty: 1, servingLabel: 'entry', servingGrams: 0, grams: 0,
            n: nn, hasMicros: false, ts: Date.now()
          };
          if (o.mode === 'diary') {
            entry.date = o.date; entry.meal = meal;
            await Data.saveEntry(entry);
            App.haptic('ok');
            UI.toast('Added', 'ok');
            s.close();
            if (parentSheet) parentSheet.close();
            App.refresh();
          } else {
            s.close();
            if (parentSheet) parentSheet.close();
            if (o.onPick) o.onPick(entry, { kind: 'quick', data: entry });
          }
        });
      }
    });
  }

  window.FoodSheet = { open, openPortion, openCustomFood, openQuickAdd };
})();
