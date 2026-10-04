/* ==========================================================================
   product.js — the product page

   What a scan or a search result opens: the Eaty Score and why, what the food
   does in the body, every nutrient (declared or estimated), the additives and
   allergens, better alternatives — and the portion controls to log it.
   ========================================================================== */
(function () {
  'use strict';

  const PANES = [['overview', 'Overview'], ['nutrients', 'Nutrients'], ['body', 'Body'], ['ingredients', 'Ingredients']];
  const NOVA_DESC = {
    1: 'Unprocessed or minimally processed',
    2: 'Processed culinary ingredient',
    3: 'Processed food',
    4: 'Ultra-processed food'
  };

  const fmtAmount = (v, unit) => {
    if (!(v > 0)) return '0 ' + unit;
    const d = v >= 100 ? 0 : v >= 10 ? 1 : v >= 1 ? 1 : 2;
    return App.n(v, d) + ' ' + unit;
  };

  /**
   * Product.open(food, opts, parentSheet)
   *   opts: the FoodSheet options — { mode: 'diary'|'pick', date, meal, batch, onPick }
   */
  async function open(food, opts, parentSheet) {
    const o = Object.assign({ mode: 'diary' }, opts);
    const refId = 'food:' + food.id;
    const fav = await Data.isFav(refId);

    // What the label says, plus estimates for what it leaves out.
    const shown = (window.Estimate && Estimate.enabled()) ? Estimate.apply(food) : food;
    const rating = Quality.rate(food);
    const servings = (food.servings && food.servings.length) ? food.servings.slice() : [{ label: '100 ' + (food.unit || 'g'), g: 100 }];
    const unit = food.unit || 'g';

    // Start on a real serving. A whole 400 g jar is a pack size, not a portion
    // (a 330 ml can is both), so big packs default to 100 g instead.
    let defServ = 0;
    if (/^Whole pack/.test(servings[0].label) && servings[0].g > 350) {
      const i100 = servings.findIndex(sv => sv.g === 100);
      if (i100 >= 0) defServ = i100;
    }
    const st = { pane: 'overview', serv: defServ, qty: 1, meal: o.meal || App.guessMeal(), per100: false, alts: null };
    const grams = () => st.qty * (servings[st.serv] ? servings[st.serv].g : 100);

    const s = UI.sheet({
      full: true,
      cls: 'product',
      title: food.name,
      subtitle: [food.brand, food.cat].filter(Boolean).join(' · '),
      headerRight: `<button class="icon-btn${fav ? ' accent' : ''}" type="button" id="pp-fav" aria-label="Favourite">${App.icon('star')}</button>`,
      body: heroHtml(food, rating) + `
        <div class="seg-sticky">
          <div class="segmented" id="pp-tabs" role="tablist">
            ${PANES.map(([k, l]) => `<button type="button" role="tab" data-pane="${k}" class="${k === st.pane ? 'on' : ''}">${l}</button>`).join('')}
          </div>
        </div>
        <div id="pp-pane"></div>`,
      footer: footHtml(servings, unit, o, st),
      onOpen(el) {
        const pane = el.querySelector('#pp-pane');
        const foot = el.querySelector('.sheet-foot');
        foot.classList.add('pp-foot');

        const draw = () => {
          pane.innerHTML = paneHtml(st.pane, food, shown, rating, st, grams(), unit);
          wirePane(el, pane);
          updateFoot();
        };

        function updateFoot() {
          const n = Nutrition.scale(shown.n, grams());
          const lbl = el.querySelector('#pp-add-label');
          if (lbl) lbl.textContent = `${o.mode === 'diary' ? 'Log' : 'Add'} ${App.int(n.kcal)} kcal · ${App.n(grams(), grams() < 10 ? 1 : 0)} ${unit}`;
          const ml = el.querySelector('#pp-meal-label');
          if (ml) ml.textContent = App.mealLabel(st.meal);
        }

        function wirePane(root, box) {
          box.querySelectorAll('[data-fx]').forEach(b => b.addEventListener('click', () => {
            const fx = currentEffects()[Number(b.dataset.fx)];
            if (fx) openEffect(fx);
          }));
          box.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => setPane(b.dataset.goto)));
          box.querySelectorAll('[data-per]').forEach(b => b.addEventListener('click', () => {
            st.per100 = b.dataset.per === '100'; draw();
          }));
          const more = box.querySelector('#pp-score-more');
          if (more) more.addEventListener('click', () => {
            const d = box.querySelector('#pp-score-detail');
            d.hidden = !d.hidden;
            more.textContent = d.hidden ? 'How this score works' : 'Hide details';
          });
          if (st.pane === 'overview') showAlternatives(box);
        }

        const currentEffects = () => Body.forFood(shown, grams());

        function setPane(k) {
          st.pane = k;
          el.querySelectorAll('[data-pane]').forEach(x => x.classList.toggle('on', x.dataset.pane === k));
          draw();
          const body = el.querySelector('.sheet-body');
          const tabs = el.querySelector('.seg-sticky');
          if (body && tabs && body.scrollTop > tabs.offsetTop) body.scrollTop = tabs.offsetTop;
        }
        el.querySelectorAll('[data-pane]').forEach(b => b.addEventListener('click', () => { setPane(b.dataset.pane); App.haptic('light'); }));

        /* portion controls */
        el.querySelectorAll('[data-serv]').forEach(b => b.addEventListener('click', () => {
          st.serv = Number(b.dataset.serv);
          el.querySelectorAll('[data-serv]').forEach(x => x.classList.toggle('on', x === b));
          App.haptic('light');
          draw();
        }));
        const qtyEl = el.querySelector('#pp-qty');
        const setQty = v => {
          st.qty = Math.max(0, App.round(v, 2));
          qtyEl.value = st.qty;
          draw();
        };
        qtyEl.addEventListener('input', () => { st.qty = Math.max(0, Number(qtyEl.value) || 0); draw(); });
        el.querySelector('#pp-minus').addEventListener('click', () => { setQty((Number(qtyEl.value) || 0) - (st.qty > 1 ? 0.5 : 0.25)); App.haptic('light'); });
        el.querySelector('#pp-plus').addEventListener('click', () => { setQty((Number(qtyEl.value) || 0) + (st.qty >= 1 ? 0.5 : 0.25)); App.haptic('light'); });
        const mealBtn = el.querySelector('#pp-meal');
        if (mealBtn) mealBtn.addEventListener('click', () => UI.actions({
          title: 'Log to',
          items: App.MEALS.map(m => ({
            label: m.label + (m.k === st.meal ? '  ✓' : ''), icon: m.icon,
            onClick: () => { st.meal = m.k; updateFoot(); }
          }))
        }));

        el.querySelector('#pp-fav').addEventListener('click', async function () {
          const now = await Data.toggleFav(refId, { kind: 'food', name: food.name });
          this.classList.toggle('accent', now);
          App.haptic('light');
          UI.toast(now ? 'Added to favourites' : 'Removed from favourites');
        });

        async function showAlternatives(box) {
          const slot = box.querySelector('#pp-alts');
          if (!slot || !food.barcode || !rating) return;
          if (st.alts === null) {
            try { st.alts = await LocalPack.alternatives(food, 4); } catch (_) { st.alts = []; }
          }
          const alts = st.alts;
          if (!alts.length || !slot.isConnected) return;
          slot.innerHTML = `
            <div class="section-title mt16 mb8">Better choices · ${App.esc(alts[0].basis)}</div>
            <div class="card flush"><div class="list">${alts.map((a, i) => `
              <button class="list-item" type="button" data-alt="${i}">
                ${UI.gradePill(a.rating)}
                <div class="li-main">
                  <div class="li-title">${App.esc(a.food.name)}</div>
                  <div class="li-sub">Eaty Score ${a.rating.score} · ${UI.macroLine(Nutrition.scale(a.food.n, 100))} per 100 ${App.esc(a.food.unit)}</div>
                </div>
                ${App.icon('right', 'li-chev')}
              </button>`).join('')}</div></div>`;
          slot.querySelectorAll('[data-alt]').forEach(btn => btn.addEventListener('click', async () => {
            const alt = alts[Number(btn.dataset.alt)].food;
            try { await OFF.save(alt); } catch (_) {}
            s.close();
            setTimeout(() => open(alt, o, parentSheet), 240);
          }));
        }

        async function commit(scanAgain) {
          const sv = servings[st.serv];
          if (st.qty <= 0) return UI.toast('Enter an amount above zero', 'err');
          const entry = App.entryFromFood(shown, st.qty, sv);
          if (shown.estimate) {
            entry.estimated = true;
            entry.hasMicros = true;      // estimated micronutrients still count towards the day
          }
          await Data.pushRecent({ id: refId, name: food.name, kind: 'food' });

          if (o.mode === 'diary') {
            entry.date = o.date || App.date.today();
            entry.meal = st.meal;
            await Data.saveEntry(entry);
            App.haptic('ok');
            UI.toast(`${food.name} logged`, 'ok');
            s.close();
            if (scanAgain) {
              setTimeout(() => Scanner.scanAndAdd({
                mode: 'diary', date: entry.date, meal: st.meal, batch: true, parent: parentSheet || null
              }), 260);
            } else if (parentSheet) {
              parentSheet.close();
            }
            App.refresh();
          } else {
            s.close();
            if (parentSheet) parentSheet.close();
            if (o.onPick) o.onPick(entry, { kind: 'food', data: food });
          }
        }
        el.querySelector('#pp-add').addEventListener('click', () => commit(false));
        const nextBtn = el.querySelector('#pp-add-next');
        if (nextBtn) nextBtn.addEventListener('click', () => commit(true));

        // Where it ranks among its own kind, from the pack's category index.
        if (rating && window.LocalPack) {
          LocalPack.rank(food).then(rk => {
            const box = el.querySelector('#pp-rank');
            if (box && rk) box.innerHTML = rankHtml(rk);
          }).catch(() => {});
        }

        draw();
      }
    });
    return s;
  }

  /* ------------------------------------------------------------------ hero */

  function heroHtml(food, r) {
    const color = r ? r.color : 'var(--tx-3)';
    // Product photos come from Open Food Facts' image host; anything else is dropped.
    const img = /^https:\/\/(images|static)\.openfoodfacts\.(org|net)\//.test(food.image || '')
      ? food.image : App.safeImg(food.image);
    const sub = [food.brand, food.typical ? 'Typical recipe' : (food.builtin ? 'Reference food' : (food.source === 'pack' || food.source === 'off' ? 'Open Food Facts' : food.source === 'fdc' ? 'USDA' : 'My food'))]
      .filter(Boolean).join(' · ');

    if (!r) {
      return `<div class="pp-hero" style="--grade:var(--tx-3)">
        ${img ? `<img class="pp-photo" src="${App.esc(img)}" alt="" onerror="this.remove()">` : ''}
        <div class="pp-id"><h3>${App.esc(food.name)}</h3><p>${App.esc(sub)}</p>
          <p class="tiny mt8">${food.kind === 'supplement' ? 'Supplements are not given a food score.' : 'Not enough data to score this product.'}</p></div>
      </div>`;
    }
    const good = r.good.slice(0, 4), bad = r.bad.slice(0, 5);
    return `
      <div class="pp-hero" style="--grade:${color}">
        ${img ? `<img class="pp-photo" src="${App.esc(img)}" alt="" onerror="this.remove()">` : ''}
        <div class="pp-id"><h3>${App.esc(food.name)}</h3><p>${App.esc(sub)}</p></div>
        <div class="score-orb" aria-label="Eaty Score ${r.score} out of 100">
          ${Charts.rings([{ pct: r.score, color }], { size: 96, stroke: 9 })}
          <div class="so-c"><b>${r.score}</b><span>/ 100</span></div>
        </div>
      </div>
      <div class="pp-verdict" style="--grade:${color}">
        <span class="pp-grade">${r.grade}</span>
        <div class="grow"><h4>${App.esc(r.label)}</h4>
          <small>Eaty Score · based on ${r.confidence}% of the criteria</small></div>
      </div>
      <div id="pp-rank"></div>
      ${r.cap ? `<div class="pp-cap">${App.icon('warn')}<span>${App.esc(r.cap)} — the score is capped at ${Quality.CAP}.</span></div>` : ''}
      ${bad.length || good.length ? `<div class="hl mt12">
        ${bad.map(h => `<span class="bad">${App.esc(h.text)}</span>`).join('')}
        ${good.map(h => `<span class="good">${App.esc(h.text)}</span>`).join('')}
      </div>` : ''}`;
  }

  function rankHtml(rk) {
    const color = rk.better >= 60 ? 'var(--grade-a)' : rk.better >= 35 ? 'var(--grade-c)' : 'var(--grade-e)';
    const text = rk.better >= 99 ? 'Top of' : rk.better <= 1 ? 'Bottom of' : `Better than ${rk.better}% of`;
    return `<div class="pp-rank">
      <div class="between"><span><b style="color:${color}">${text}</b> ${App.esc(rk.basis)}</span>
        <span class="tiny muted">${App.int(rk.n)} rated</span></div>
      <div class="rank-track"><i style="left:${App.clamp(rk.better, 1, 99)}%;background:${color}"></i></div>
    </div>`;
  }

  /* ---------------------------------------------------------------- footer */

  function footHtml(servings, unit, o, st) {
    return `
      <div class="row1">
        <div class="serv-chips" role="radiogroup" aria-label="Serving">
          ${servings.map((sv, i) => `<button type="button" role="radio" data-serv="${i}" class="${i === st.serv ? 'on' : ''}"
             aria-checked="${i === st.serv}">${App.esc(sv.label)}</button>`).join('')}
        </div>
        <div class="mini-step">
          <button type="button" id="pp-minus" aria-label="Less">${App.icon('close')}</button>
          <input type="number" id="pp-qty" value="1" min="0" step="0.25" inputmode="decimal" aria-label="Amount">
          <button type="button" id="pp-plus" aria-label="More">${App.icon('plus')}</button>
        </div>
      </div>
      <div class="row2">
        ${o.mode === 'diary' ? `<button class="btn ghost meal-pick" type="button" id="pp-meal" aria-label="Meal">
          <span id="pp-meal-label">${App.mealLabel(st.meal)}</span>${App.icon('down')}</button>` : ''}
        ${o.batch ? `<button class="btn ghost" type="button" id="pp-add-next" style="flex:0 0 auto;padding:0 14px" aria-label="Log and scan the next product">${App.icon('barcode')}</button>` : ''}
        <button class="btn primary" type="button" id="pp-add">${App.icon('plus')}<span id="pp-add-label">Log</span></button>
      </div>`;
  }

  /* ----------------------------------------------------------------- panes */

  function paneHtml(pane, food, shown, r, st, g, unit) {
    if (pane === 'nutrients') return nutrientsPane(food, shown, st, g, unit);
    if (pane === 'body') return bodyPane(shown, g, unit);
    if (pane === 'ingredients') return ingredientsPane(food, r);
    return overviewPane(food, shown, r, g, unit);
  }

  function overviewPane(food, shown, r, g, unit) {
    const n = Nutrition.scale(shown.n, g);
    const tot = n.protein * 4 + n.carbs * 4 + n.fat * 9;
    const fx = Body.forFood(shown, g);
    return `
      <div class="card">
        <div class="between mb12">
          <div><div class="num" style="font-size:30px;font-weight:760;line-height:1">${App.int(n.kcal)}</div>
            <div class="tiny muted" style="font-weight:600">kcal in ${App.n(g, g < 10 ? 1 : 0)} ${unit}</div></div>
          <div style="text-align:right"><div class="num" style="font-size:17px;font-weight:720">${App.n(n.fiber, 1)} g</div>
            <div class="tiny muted" style="font-weight:600">fibre</div></div>
        </div>
        <div class="macro-grid">
          ${[['protein', 'Protein', 'p', 4], ['carbs', 'Carbs', 'c', 4], ['fat', 'Fat', 'f', 9]].map(([k, l, c, f]) => {
            const share = tot > 0 ? n[k] * f / tot * 100 : 0;
            return `<div class="macro ${c}">
              <div class="top"><span class="name">${l}</span><span class="num">${App.n(n[k], 1)}<small>g</small></span></div>
              <div class="bar"><i style="width:${share}%"></i></div>
              <div class="tiny muted">${Math.round(share)}% of energy</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      ${fx.length ? `<div class="section-title mt16 mb8">What it does in your body</div>
        ${fx.slice(0, 3).map((e, i) => fxHtml(e, i)).join('')}
        ${fx.length > 3 ? `<button class="btn ghost block sm" type="button" data-goto="body">See all ${fx.length} effects</button>` : ''}` : ''}

      ${r ? `<div class="section-title mt16 mb8">Eaty Score breakdown</div>
        <div class="card">
          <div class="pillars">${r.pillars.map(p => pillarHtml(p)).join('')}</div>
          <button class="btn subtle sm block mt8" type="button" id="pp-score-more">How this score works</button>
          <div id="pp-score-detail" hidden>
            <div class="q-bars">${r.parts.map(p => `
              <div class="q-row">
                <span class="q-name">${App.esc(p.label)}</span>
                <div class="bar" style="color:${pctColor(p.pct)}"><i style="width:${Math.round(p.pct)}%"></i></div>
                <span class="q-note">${App.esc(p.note || Math.round(p.pct) + '%')}</span>
              </div>`).join('')}</div>
            <p class="tiny muted mt12" style="line-height:1.55">
              Nutrition ${Quality.PILLARS.nutrition}%, additives ${Quality.PILLARS.additives}%, processing ${Quality.PILLARS.processing}%,
              ingredients ${Quality.PILLARS.ingredients}%. Missing data is left out and the rest reweighted, never counted as zero.
              A high-risk additive or hydrogenated fat caps the score at ${Quality.CAP}.
              ${shown.estimate ? 'Estimated nutrients are never used for the score.' : ''}</p>
          </div>
        </div>` : ''}

      <div id="pp-alts"></div>`;
  }

  function pillarHtml(p) {
    if (p.pct === null) {
      return `<div class="pillar unknown"><div class="top"><b>${App.esc(p.label)}</b><span class="v">No data</span></div>
        <div class="bar"></div></div>`;
    }
    return `<div class="pillar"><div class="top"><b>${App.esc(p.label)}</b>
        <span class="v" style="color:${pctColor(p.pct)}">${Math.round(p.pct)}<small>/100</small></span></div>
      <div class="bar" style="color:${pctColor(p.pct)}"><i style="width:${Math.round(p.pct)}%"></i></div></div>`;
  }

  const pctColor = p => p >= 75 ? 'var(--grade-a)' : p >= 55 ? 'var(--grade-b)' : p >= 40 ? 'var(--grade-c)' : p >= 25 ? 'var(--grade-d)' : 'var(--grade-e)';

  /* ---- nutrients ---- */
  function nutrientsPane(food, shown, st, g, unit) {
    const amount = st.per100 ? 100 : g;
    const n = Nutrition.scale(shown.n, amount);
    const t = App.state.targets || { micros: {} };
    const est = new Set((shown.estimate && shown.estimate.keys) || []);
    const declared = food.declared ? new Set(food.declared) : null;
    const known = k => !declared || declared.has(k) || est.has(k);
    const tag = k => est.has(k) ? '<small>est.</small>' : '';

    const row = (label, k, u, opts) => {
      const o = opts || {};
      if (!known(k) && !o.always) return '';
      const v = n[k] || 0;
      return `<div class="nt-row${o.sub ? ' sub' : ''}"><span class="n">${label}${tag(k)}</span>
        <span class="a">${known(k) ? fmtAmount(v, u) : '—'}</span></div>`;
    };
    const microRow = m => {
      const v = n[m.k] || 0;
      if (!(v > 0) || !known(m.k)) return '';
      const pct = App.pct(v, t.micros[m.k] || 0);
      return `<div class="nt-row"><span class="n">${m.label}${tag(m.k)}</span>
        <span class="a">${fmtAmount(v, m.unit)}</span>
        <span class="p"><div class="bar" style="color:${est.has(m.k) ? 'var(--info)' : 'var(--brand)'}"><i style="width:${App.clamp(pct, 0, 100)}%"></i></div></span>
        <span class="pv">${Math.round(pct)}%</span></div>`;
    };
    const vit = Nutrition.MICROS.filter(m => m.group === 'vitamin').map(microRow).join('');
    const min = Nutrition.MICROS.filter(m => m.group === 'mineral' && m.k !== 'na').map(microRow).join('');
    const comp = (Nutrition.COMPOUNDS || []).map(c => {
      const v = n[c.k] || 0;
      if (!(v > 0)) return '';
      if (c.k === 'freesugar') return '';
      return `<div class="nt-row"><span class="n">${c.label}${tag(c.k)}${c.k === 'gl' && shown.gi ? `<small>GI ${shown.gi}${shown.giEstimated ? ' est.' : ''}</small>` : ''}</span>
        <span class="a">${c.unit ? fmtAmount(v, c.unit) : App.n(v, 1)}</span></div>`;
    }).join('');

    return `
      <div class="between mb8">
        <div class="section-title" style="padding:0 4px">${st.per100 ? 'Per 100 ' + unit : 'Per portion · ' + App.n(g, g < 10 ? 1 : 0) + ' ' + unit}</div>
        <div class="segmented" style="width:auto">
          <button type="button" data-per="portion" class="${st.per100 ? '' : 'on'}">Portion</button>
          <button type="button" data-per="100" class="${st.per100 ? 'on' : ''}">100 ${unit}</button>
        </div>
      </div>
      ${shown.estimate ? `<div class="est-note mb12">${App.icon('info')}<span>
        The label lists no ${shown.estimate.keys.some(k => Nutrition.MICROS.some(m => m.k === k)) ? 'vitamins or minerals' : 'compounds like these'},
        so values marked <b>est.</b> are estimated from <b>${App.esc(shown.estimate.refName)}</b>, scaled by calories
        (${shown.estimate.quality === 'close' ? 'close match' : 'rough match'}). Turn estimates off in Settings.</span></div>` : ''}
      <div class="card">
        <div class="nt">
          <div class="nt-row"><span class="n"><b>Energy</b></span><span class="a">${App.int(n.kcal)} kcal</span></div>
          ${row('Fat', 'fat', 'g', { always: true })}
          ${row('of which saturated', 'satfat', 'g', { sub: true })}
          ${n.transfat > 0 ? row('of which trans', 'transfat', 'g', { sub: true, always: true }) : ''}
          ${row('Carbohydrate', 'carbs', 'g', { always: true })}
          ${row('of which sugars', 'sugar', 'g', { sub: true })}
          ${(food.builtin || est.has('freesugar')) && n.sugar > 0 ? `<div class="nt-row sub"><span class="n">of which free sugars${tag('freesugar')}</span><span class="a">${fmtAmount(n.freesugar || 0, 'g')}</span></div>` : ''}
          ${row('Fibre', 'fiber', 'g')}
          ${row('Protein', 'protein', 'g', { always: true })}
          ${known('na') ? `<div class="nt-row"><span class="n">Salt</span><span class="a">${fmtAmount((n.na || 0) * 2.5 / 1000, 'g')}</span></div>` : ''}
          ${n.chol > 0 && known('chol') ? row('Cholesterol', 'chol', 'mg') : ''}
        </div>
      </div>
      ${vit ? `<div class="section-title mt16 mb8">Vitamins · % of your daily target</div><div class="card"><div class="nt">${vit}</div></div>` : ''}
      ${min ? `<div class="section-title mt16 mb8">Minerals · % of your daily target</div><div class="card"><div class="nt">${min}</div></div>` : ''}
      ${!vit && !min ? `<div class="card mt16 tiny muted" style="line-height:1.55">This label lists no vitamins or minerals${
        window.Estimate && !Estimate.enabled() ? ' and estimates are turned off in Settings' : ', and no close reference food was found to estimate them from'}.</div>` : ''}
      ${comp ? `<div class="section-title mt16 mb8">Active compounds</div><div class="card"><div class="nt">${comp}</div></div>` : ''}`;
  }

  /* ---- body ---- */
  function bodyPane(shown, g, unit) {
    const fx = Body.forFood(shown, g);
    if (!fx.length) {
      return `<div class="card">${UI.emptyState('pulse', 'Nothing notable at this portion',
        'No hormone, blood-sugar or organ effects stand out for ' + App.n(g, 0) + ' ' + unit + '. Try a bigger portion to see what changes.')}</div>` + disclaimer();
    }
    const groups = {};
    fx.forEach((e, i) => { (groups[e.system] = groups[e.system] || []).push([e, i]); });
    return Object.keys(groups).map(sys => {
      const meta = Body.SYSTEMS[sys] || { label: sys, icon: 'info' };
      return `<div class="fx-group"><h5>${App.icon(meta.icon)}${App.esc(meta.label)}</h5>
        ${groups[sys].map(([e, i]) => fxHtml(e, i)).join('')}</div>`;
    }).join('') + disclaimer();
  }

  function fxHtml(e, i) {
    const meta = Body.SYSTEMS[e.system] || { icon: 'info' };
    return `<button class="fx tone-${e.tone}" type="button" data-fx="${i}">
      <span class="fx-ic">${App.icon(meta.icon)}</span>
      <span class="fx-main">
        <b>${App.esc(e.title)}</b>
        <p>${App.esc(e.text)}</p>
        <span class="fx-meta">
          ${evidenceBadge(e.evidence)}
          ${e.estimated ? '<span class="ev est">Estimated amount</span>' : ''}
        </span>
      </span>
    </button>`;
  }

  function evidenceBadge(level) {
    return `<span class="ev ${level}"><i><b></b></i>${App.esc(Body.EVIDENCE[level] || level)}</span>`;
  }

  function disclaimer() {
    return `<p class="disclaimer">${App.icon('info')}<span>Effects summarise published research and official guidance for an average adult.
      They are education, not medical advice — talk to a doctor about your own health, medicines or pregnancy.</span></p>`;
  }

  function openEffect(e) {
    UI.sheet({
      title: e.title,
      subtitle: (Body.SYSTEMS[e.system] || {}).label,
      body: `
        <p style="font-size:15px;line-height:1.6">${App.esc(e.text)}</p>
        <div class="fx-meta mt12">${evidenceBadge(e.evidence)}${e.estimated ? '<span class="ev est">Estimated amount</span>' : ''}</div>
        ${e.src && e.src.length ? `<div class="section-title mt16 mb8">Sources</div>
          <ul class="src-list">${e.src.map(k => `<li>${App.esc(Body.SOURCES[k] || k)}</li>`).join('')}</ul>` : ''}
        ${disclaimer()}`
    });
  }

  /* ---- ingredients ---- */
  function ingredientsPane(food, r) {
    const F = OffMap.FLAG;
    const flags = typeof food.flags === 'number' ? food.flags : 0;
    const chips = [];
    if (food.vegan || flags & F.VEGAN) chips.push(['good', 'Vegan']);
    else if (food.vegetarian || flags & F.VEGETARIAN) chips.push(['good', 'Vegetarian']);
    if (flags & F.PALM) chips.push(['bad', 'Palm oil']);
    else if (food.palmOilFree || flags & F.PALM_FREE) chips.push(['good', 'Palm-oil free']);
    if (flags & F.HYDROGENATED) chips.push(['bad', 'Hydrogenated fat']);
    if (flags & F.SWEETENER) chips.push(['bad', 'Sweeteners']);
    if (flags & F.ADDED_SUGAR) chips.push(['bad', 'Added sugar']);
    if (flags & F.FLAVOURING) chips.push(['bad', 'Flavourings']);
    if (flags & F.WHOLEGRAIN) chips.push(['good', 'Whole grain']);
    if (flags & F.LIVE_CULTURES) chips.push(['good', 'Live cultures']);
    if (flags & F.SEED_OIL) chips.push(['', 'Seed oil']);
    if (flags & F.CAFFEINE) chips.push(['', 'Caffeine']);

    const adds = r && r.additives && r.additives.length ? r.additives
      : (food.additiveCodes || []).map(c => Additives.get(c)).filter(Boolean);
    const allergens = food.allergens ? OffMap.allergenNames(food.allergens) : [];
    const nova = r ? r.nova : Quality.processing(food).nova;

    return `
      ${chips.length ? `<div class="hl mb12">${chips.map(([c, t]) => `<span class="${c}">${App.esc(t)}</span>`).join('')}</div>` : ''}

      <div class="section-title mb8">Additives${adds.length ? ' · ' + adds.length : ''}</div>
      <div class="card">
        ${adds.length ? adds.map(a => {
          const risk = Additives.RISK[a.risk || 0] || Additives.RISK[1];
          return `<div class="add-row">
            <span class="risk-dot" style="color:${risk.color}"></span>
            <span class="add-main"><b>${App.esc(a.name)}<small>${App.esc(a.e || ('E' + a.code))}</small></b>
              <p>${App.esc(cap(a.fn || 'additive'))}${a.note ? ' — ' + App.esc(a.note) : ''}</p></span>
            <span class="add-risk" style="color:${risk.color}">${App.esc(risk.short)}</span>
          </div>`;
        }).join('') : `<p class="tiny muted" style="line-height:1.55">${
          typeof food.additives === 'number' && food.additives === 0 ? 'No additives listed.'
            : food.builtin && nova === 1 ? 'A whole food — no additives.'
            : 'No additive information for this product.'}</p>`}
        ${food.typical && adds.length ? `<p class="tiny muted mt8" style="line-height:1.5">Typical for this kind of product in German supermarkets — scan a specific product for its own list.</p>` : ''}
      </div>

      <div class="section-title mt16 mb8">Allergens</div>
      <div class="card">${allergens.length
        ? `<div class="hl">${allergens.map(a => `<span class="bad">${App.esc(a)}</span>`).join('')}</div>`
        : `<p class="tiny muted">${food.builtin ? 'Not tracked for reference foods.' : 'None declared.'}</p>`}</div>

      ${food.ingredientsText ? `<div class="section-title mt16 mb8">Ingredients${food.ingredientsN ? ' · ' + food.ingredientsN : ''}</div>
        <div class="card"><p class="ingredients-text">${App.esc(food.ingredientsText)}</p></div>`
        : food.ingredientsN ? `<p class="tiny muted mt12">${food.ingredientsN} ingredients listed.</p>` : ''}

      <div class="section-title mt16 mb8">Processing</div>
      <div class="card">
        <div class="between"><span style="font-weight:600">${nova ? 'NOVA ' + nova : 'Unknown'}</span>
          ${food.nutriscore ? `<span class="badge">Nutri-Score ${App.esc(food.nutriscore)}</span>` : ''}</div>
        <p class="tiny muted mt8" style="line-height:1.5">${nova ? NOVA_DESC[nova] + (r && r.estimatedNova ? ' (estimated from the name).' : '.') : 'Open Food Facts has not classified this product yet.'}</p>
      </div>
      ${food.barcode ? `<p class="tiny muted center mt16">Barcode ${App.esc(food.barcode)} · ${food.source === 'fdc' ? 'USDA FoodData Central' : 'Open Food Facts (ODbL)'}</p>` : ''}`;
  }

  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  window.Product = { open, fxHtml, openEffect, evidenceBadge, disclaimer };
})();
