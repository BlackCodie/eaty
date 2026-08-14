/* ==========================================================================
   supplements.js — vitamins, minerals and other supplements

   Supplement labels are written per capsule/tablet/scoop, not per 100 g, and
   they state vitamins A, D and E in IU as often as in µg. Making someone weigh
   a capsule and convert IU by hand would guarantee wrong data, so supplements
   get their own editor that speaks the language printed on the tub.

   Storage reuses the ordinary food store so search, favourites, the portion
   picker and diary entries all keep working untouched. The trick is that one
   "gram" is one dose: nutrients are held per 100 doses, so the existing
   `Nutrition.scale(n, grams)` maths gives per-dose amounts for free.
   ========================================================================== */
(function () {
  'use strict';

  const MEAL = App.SUPP_MEAL = 'supplements';

  const UNITS = [
    { k: 'capsule', one: 'capsule', many: 'capsules' },
    { k: 'tablet',  one: 'tablet',  many: 'tablets' },
    { k: 'softgel', one: 'softgel', many: 'softgels' },
    { k: 'gummy',   one: 'gummy',   many: 'gummies' },
    { k: 'scoop',   one: 'scoop',   many: 'scoops' },
    { k: 'sachet',  one: 'sachet',  many: 'sachets' },
    { k: 'ml',      one: 'ml',      many: 'ml' },
    { k: 'drop',    one: 'drop',    many: 'drops' },
    { k: 'spray',   one: 'spray',   many: 'sprays' }
  ];
  const unitOf = k => UNITS.find(u => u.k === k) || UNITS[0];
  const doseLabel = (n, k) => {
    const u = unitOf(k);
    return App.n(n, 2) + ' ' + (n === 1 ? u.one : u.many);
  };

  /* International Units appear on most vitamin D and E labels. Conversion
     depends on the chemical form; these are the standard factors for the forms
     normally sold (retinol, cholecalciferol, natural d-alpha-tocopherol). */
  const IU = {
    vitA: { factor: 0.3,   unit: 'µg' },   // 1 IU retinol        = 0.3 µg RAE
    vitD: { factor: 0.025, unit: 'µg' },   // 1 IU cholecalciferol = 0.025 µg
    vitE: { factor: 0.67,  unit: 'mg' }    // 1 IU d-alpha-tocopherol = 0.67 mg
  };

  const isSupplement = f => !!(f && f.kind === 'supplement');
  App.isSupplement = isSupplement;

  /* ------------------------------------------------------------- storage */

  async function all() {
    const foods = await Data.customFoods();
    return foods.filter(isSupplement).sort((a, b) => a.name.localeCompare(b.name));
  }
  async function stack() {
    return (await all()).filter(s => s.daily);
  }

  /** Build the stored food record from per-dose amounts. */
  function build(form, existing) {
    const per100 = Nutrition.empty();
    Nutrition.KEYS.forEach(k => {
      const v = Number(form.per[k]) || 0;
      per100[k] = v * 100;                       // per dose -> per 100 doses
    });

    const u = unitOf(form.unitKey);
    const barcode = String(form.barcode || '').replace(/\D/g, '');
    const declared = Nutrition.KEYS.filter(k => per100[k] > 0);

    return {
      id: existing ? existing.id
        : (barcode ? 'supp-' + barcode : App.uid('supp')),
      kind: 'supplement',
      name: form.name.trim(),
      brand: (form.brand || '').trim(),
      cat: 'Supplements',
      unit: 'dose',
      unitKey: u.k,
      unitLabel: u.one,
      barcode: barcode || null,
      daily: !!form.daily,
      note: (form.note || '').trim(),
      n: per100,
      declared,
      partialMicros: false,
      servings: [
        { label: '1 ' + u.one, g: 1 },
        { label: '2 ' + u.many, g: 2 },
        { label: '3 ' + u.many, g: 3 },
        { label: '½ ' + u.one, g: 0.5 }
      ],
      search: (form.name + ' ' + (form.brand || '') + ' supplement ' + barcode).toLowerCase(),
      builtin: false,
      source: 'supplement',
      updated: Date.now()
    };
  }

  /** Per-dose value of a nutrient, for display. */
  const perDose = (supp, key) => (supp.n[key] || 0) / 100;

  /* -------------------------------------------------------------- editor */

  function editor(opts) {
    const o = opts || {};
    const existing = o.supplement || null;
    const micros = Nutrition.MICROS;

    const seedPer = {};
    Nutrition.KEYS.forEach(k => { seedPer[k] = existing ? perDose(existing, k) : 0; });

    const field = (key, label, unit, value, extra) => `
      <div class="field" style="margin-bottom:10px">
        <label>${label}</label>
        <div class="row" style="gap:8px">
          <div class="input-suffix grow">
            <input name="p_${key}" type="number" inputmode="decimal" step="any"
                   value="${value || ''}" placeholder="0"><span>${unit}</span>
          </div>
          ${extra || ''}
        </div>
      </div>`;

    const iuToggle = key => `
      <select name="u_${key}" style="width:84px;flex:none">
        <option value="native">${IU[key].unit}</option>
        <option value="iu">IU</option>
      </select>`;

    const s = UI.sheet({
      full: true,
      title: existing ? 'Edit supplement' : 'Add supplement',
      subtitle: 'Enter the label exactly as printed, per dose',
      body: `
        <div class="field">
          <label for="sp-name">Name</label>
          <input id="sp-name" name="name" type="text" autocapitalize="sentences"
                 placeholder="Vitamin D3 2000 IU" value="${App.esc(existing ? existing.name : (o.name || ''))}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Brand <span class="muted" style="font-weight:400">(optional)</span></label>
            <input name="brand" type="text" value="${App.esc(existing ? existing.brand : (o.brand || ''))}" placeholder="Doppelherz">
          </div>
          <div class="field" style="max-width:130px">
            <label>Dose unit</label>
            <select name="unitKey">
              ${UNITS.map(u => `<option value="${u.k}"${(existing ? existing.unitKey : 'capsule') === u.k ? ' selected' : ''}>${u.one}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="field">
          <label>Barcode <span class="muted" style="font-weight:400">(optional)</span></label>
          <div class="searchbar with-scan">
            <span style="position:absolute;left:13px;width:18px;color:var(--tx-3)">${App.icon('barcode')}</span>
            <input name="barcode" type="text" inputmode="numeric" style="padding-left:40px"
                   placeholder="Scan or type" value="${App.esc((o.barcode || (existing && existing.barcode)) || '')}">
            <button class="scan-btn" type="button" id="sp-scan" aria-label="Scan barcode">${App.icon('camera')}</button>
          </div>
          <div class="hint">With a barcode attached, scanning the tub logs it straight away.</div>
        </div>

        <div class="card flush mb14">
          <div class="switch-row">
            <div class="sr-main"><b>Part of my daily stack</b>
              <small>Shows on Today with a one-tap “Take all”</small></div>
            <button class="switch" type="button" role="switch" id="sp-daily"
                    aria-checked="${existing ? !!existing.daily : true}"></button>
          </div>
        </div>

        <div class="section-title mb8">Per <span id="sp-unit-word">${existing ? unitOf(existing.unitKey).one : 'capsule'}</span></div>
        <div class="form-card">
          <div class="section-title mb8" style="padding:0">Vitamins</div>
          ${micros.filter(m => m.group === 'vitamin').map(m =>
            field(m.k, m.label, m.unit, seedPer[m.k], IU[m.k] ? iuToggle(m.k) : '')).join('')}

          <div class="section-title mt16 mb8" style="padding:0">Minerals</div>
          ${micros.filter(m => m.group === 'mineral').map(m =>
            field(m.k, m.label, m.unit, seedPer[m.k])).join('')}

          <div class="section-title mt16 mb8" style="padding:0">Other</div>
          ${field('kcal', 'Energy', 'kcal', seedPer.kcal)}
          ${field('protein', 'Protein', 'g', seedPer.protein)}
          ${field('fiber', 'Fibre', 'g', seedPer.fiber)}
        </div>

        <div class="field mt14">
          <label>Note <span class="muted" style="font-weight:400">(optional)</span></label>
          <input name="note" type="text" placeholder="With breakfast" value="${App.esc(existing ? existing.note || '' : '')}">
        </div>

        <p class="tiny muted mt12" style="line-height:1.55">
          IU conversions use the standard factors for the forms normally sold —
          retinol, cholecalciferol (D3) and natural d-alpha-tocopherol. Supplements count
          towards your micronutrient targets but are not given a food-quality grade.
        </p>
      `,
      footer: `${existing ? `<button class="btn danger" type="button" id="sp-del">${App.icon('trash')}</button>` : ''}
               <button class="btn primary" type="button" id="sp-save">${App.icon('check')}Save supplement</button>`,
      onOpen(el) {
        const unitSel = el.querySelector('[name="unitKey"]');
        unitSel.addEventListener('change', () => {
          el.querySelector('#sp-unit-word').textContent = unitOf(unitSel.value).one;
        });

        const dailySw = el.querySelector('#sp-daily');
        dailySw.addEventListener('click', () => {
          dailySw.setAttribute('aria-checked', String(dailySw.getAttribute('aria-checked') !== 'true'));
        });

        el.querySelector('#sp-scan').addEventListener('click', async () => {
          const code = await Scanner.scan();
          if (code) {
            el.querySelector('[name="barcode"]').value = code;
            UI.toast('Barcode captured', 'ok');
          }
        });

        // Pre-set the IU selectors when editing something stored in IU.
        if (existing && existing.iuFields) {
          Object.keys(existing.iuFields).forEach(k => {
            const sel = el.querySelector(`[name="u_${k}"]`);
            if (sel) sel.value = 'iu';
          });
        }

        el.querySelector('#sp-save').addEventListener('click', async () => {
          const raw = UI.readForm(el);
          const name = String(raw.name || '').trim();
          if (!name) return UI.toast('Give the supplement a name', 'err');

          const per = {};
          const iuFields = {};
          Nutrition.KEYS.forEach(k => {
            let v = Number(raw['p_' + k]) || 0;
            if (IU[k] && raw['u_' + k] === 'iu' && v > 0) {
              iuFields[k] = v;                     // remember what was typed
              v = v * IU[k].factor;
            }
            per[k] = v;
          });

          const anything = Nutrition.KEYS.some(k => per[k] > 0);
          if (!anything) {
            const ok = await UI.confirm({
              title: 'No nutrients entered',
              message: 'Save it anyway? It will be logged as taken but will not add to any target — which is right for things like creatine or probiotics.',
              confirmLabel: 'Save anyway'
            });
            if (!ok) return;
          }

          const rec = build({
            name, brand: raw.brand, unitKey: raw.unitKey, barcode: raw.barcode,
            daily: dailySw.getAttribute('aria-checked') === 'true',
            note: raw.note, per
          }, existing);
          if (Object.keys(iuFields).length) rec.iuFields = iuFields;

          await Data.saveFood(rec);
          App.state.customFoods = await Data.customFoods();
          App.haptic('ok');
          UI.toast(existing ? 'Supplement updated' : 'Supplement added', 'ok');
          s.close();
          if (o.onSaved) o.onSaved(rec);
          App.refresh();
        });

        const del = el.querySelector('#sp-del');
        if (del) del.addEventListener('click', async () => {
          const ok = await UI.confirm({
            title: 'Delete this supplement?',
            message: 'Entries you have already logged keep their numbers.',
            confirmLabel: 'Delete', danger: true
          });
          if (!ok) return;
          await Data.deleteFood(existing.id);
          App.state.customFoods = await Data.customFoods();
          UI.toast('Deleted');
          s.close();
          App.refresh();
        });
      }
    });
    return s;
  }

  /* ------------------------------------------------------------- logging */

  /** Log one supplement for a date. `doses` defaults to a single dose. */
  async function take(supp, date, doses) {
    const q = Number(doses) || 1;
    const u = unitOf(supp.unitKey);
    const entry = {
      id: App.uid('e'),
      type: 'supplement',
      refId: supp.id,
      name: supp.name,
      unit: u.one,
      qty: q,
      servingLabel: q === 1 ? u.one : u.many,
      servingGrams: 1,
      grams: q,
      n: Nutrition.scale(supp.n, q),
      hasMicros: true,
      date,
      meal: MEAL,
      ts: Date.now()
    };
    await Data.saveEntry(entry);
    return entry;
  }

  /** Which of the daily stack are already logged for a date. */
  async function takenOn(date) {
    const entries = await Data.entriesFor(date);
    const ids = new Set(entries.filter(e => e.type === 'supplement').map(e => e.refId));
    return ids;
  }

  async function takeAll(date) {
    const list = await stack();
    const taken = await takenOn(date);
    const todo = list.filter(s => !taken.has(s.id));
    for (const s of todo) await take(s, date, 1);
    return todo.length;
  }

  /** Remove today's log of one supplement (toggle off). */
  async function untake(suppId, date) {
    const entries = await Data.entriesFor(date);
    const mine = entries.filter(e => e.type === 'supplement' && e.refId === suppId);
    for (const e of mine) await Data.deleteEntry(e.id);
    return mine.length;
  }

  /** Split a day's micronutrients into what came from food vs supplements. */
  function split(entries) {
    const food = Nutrition.empty(), supp = Nutrition.empty();
    (entries || []).forEach(e => {
      const target = e.type === 'supplement' ? supp : food;
      Nutrition.KEYS.forEach(k => { target[k] += Number(e.n[k]) || 0; });
    });
    return { food, supp };
  }

  window.Supplements = {
    UNITS, IU, MEAL,
    all, stack, editor, take, takeAll, untake, takenOn, split,
    isSupplement, unitOf, doseLabel, perDose, build
  };

  /* ------------------------------------------------------------- actions */
  App.act({
    'supp-add': () => editor({}),
    async 'supp-edit'(el) {
      const list = await all();
      const s = list.find(x => x.id === el.dataset.id);
      if (s) editor({ supplement: s });
    },
    async 'supp-toggle'(el) {
      const date = App.state.date || App.date.today();
      const list = await all();
      const supp = list.find(x => x.id === el.dataset.id);
      if (!supp) return;
      const taken = await takenOn(date);
      if (taken.has(supp.id)) {
        await untake(supp.id, date);
        App.haptic('light');
      } else {
        await take(supp, date, 1);
        App.haptic('ok');
      }
      App.refresh();
    },
    async 'supp-take-all'() {
      const date = App.state.date || App.date.today();
      const n = await takeAll(date);
      if (!n) return UI.toast('Whole stack already logged today');
      App.haptic('ok');
      UI.toast(n === 1 ? '1 supplement logged' : n + ' supplements logged', 'ok');
      App.refresh();
    },
    async 'supp-manage'() {
      const list = await all();
      UI.sheet({
        full: true,
        title: 'My supplements',
        subtitle: list.length ? list.length + ' saved' : '',
        body: list.length
          ? `<div class="card flush">${list.map(sp => {
              const doses = Nutrition.MICROS
                .filter(m => perDose(sp, m.k) > 0)
                .slice(0, 3)
                .map(m => m.label + ' ' + App.amt(perDose(sp, m.k), m.unit))
                .join(' · ');
              return `<button class="list-item" type="button" data-act="supp-edit" data-id="${sp.id}">
                <div class="li-ic" style="background:var(--brand-dim);color:var(--brand)">${App.icon('sparkle')}</div>
                <div class="li-main">
                  <div class="li-title">${App.esc(sp.name)}${sp.daily ? ' <span class="badge brand">Daily</span>' : ''}</div>
                  <div class="li-sub">${App.esc(doses || 'no nutrients recorded')}</div>
                </div>
                ${App.icon('right', 'li-chev')}
              </button>`;
            }).join('')}</div>`
          : UI.emptyState('sparkle', 'No supplements yet',
              'Add what you take and it appears on Today as a daily stack you can log in one tap.'),
        footer: `<button class="btn primary block" type="button" data-act="supp-add">${App.icon('plus')}Add supplement</button>`
      });
    }
  });
})();
