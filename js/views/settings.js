/* ==========================================================================
   views/settings.js — profile, targets, preferences, data, install, about
   ========================================================================== */
(function () {
  'use strict';

  App.act({
    'open-settings': () => openSettings(),

    'open-profile': () => profileSheet(),
    'open-targets': () => targetSheet(),
    'open-data': () => dataSheet(),
    'open-install': () => installSheet(),
    'open-about': () => aboutSheet(),
    'open-sources': () => sourcesSheet()
  });

  /* ===================================================== FOOD DATABASES */

  function sourcesSheet() {
    const s0 = App.state.settings || {};
    const s = UI.sheet({
      full: true,
      title: 'Food databases',
      body: `
        <div class="card flush mb14">
          <div class="meal-head"><div class="ic">${App.icon('download')}</div><h3>German product pack</h3>
            <span class="kc" id="lp-count">…</span></div>
          <div style="padding:12px var(--pad) 16px">
            <p class="tiny muted mb12" style="line-height:1.55">
              A snapshot of German supermarket products — Rewe, ja!, Kaufland/K-Classic,
              Aldi/Milsani, Lidl/Milbona, Edeka/Gut&amp;Günstig, Penny, Netto, dm, Alnatura and the
              big national brands — bundled with the app so barcodes resolve instantly.
              <b>Signal is usually terrible inside a supermarket</b>, so downloading the whole pack
              once over Wi-Fi is worth it.
            </p>
            <div class="bar mb12" style="color:var(--brand);height:8px" id="lp-bar-wrap" hidden>
              <i id="lp-bar" style="width:0%"></i></div>
            <button class="btn ghost block" type="button" id="lp-dl">
              ${App.icon('download')}Save the whole pack offline</button>
            <div class="hint mt8" id="lp-status"></div>
          </div>
        </div>

        <div class="card flush mb14">
          <div class="meal-head"><div class="ic">${App.icon('barcode')}</div><h3>Open Food Facts</h3>
            <span class="kc" style="color:var(--brand)">On</span></div>
          <div style="padding:12px var(--pad) 16px">
            <p class="tiny muted" style="line-height:1.55">
              Around 4 million packaged products with very strong German coverage — Rewe, Aldi,
              Lidl, Edeka, Kaufland, dm. Used for barcode scans and product search. Free, no key
              needed. Only the barcode or your search words are sent.
            </p>
          </div>
        </div>

        <div class="card flush mb14">
          <div class="meal-head"><div class="ic">${App.icon('leaf')}</div><h3>USDA FoodData Central</h3>
            <span class="kc" style="color:var(--brand)">On</span></div>
          <div style="padding:12px var(--pad) 16px">
            <p class="tiny muted mb12" style="line-height:1.55">
              Analysed generic foods carrying 100+ measured nutrients each — the best source for
              full vitamin and mineral detail on unpackaged food. Also used as a barcode fallback.
            </p>
            <div class="field" style="margin-bottom:8px">
              <label for="fd-key">Your API key <span class="muted" style="font-weight:400">(optional)</span></label>
              <input id="fd-key" type="text" autocomplete="off" autocapitalize="none" spellcheck="false"
                     placeholder="DEMO_KEY" value="${App.esc(s0.fdcKey || '')}">
              <div class="hint">
                The shared demo key is limited to a few lookups an hour. A personal key is free and
                instant from <b>fdc.nal.usda.gov/api-key-signup.html</b> — paste it here to lift the limit.
              </div>
            </div>
            <div class="btn-row">
              <button class="btn ghost sm" type="button" id="fd-test">${App.icon('check')}Test key</button>
              <button class="btn ghost sm" type="button" id="fd-clear">${App.icon('close')}Use demo key</button>
            </div>
            <div class="hint mt8" id="fd-result"></div>
          </div>
        </div>

        <div class="card">
          <div class="row" style="gap:11px;align-items:flex-start">
            <span style="flex:none;color:var(--brand);margin-top:1px">${App.icon('info')}</span>
            <span class="tiny" style="line-height:1.55">
              Both databases are only consulted when you scan or search online. Everything you have
              already logged, plus every product you have scanned before, keeps working with no
              connection at all.
            </span>
          </div>
        </div>
      `,
      onOpen(el) {
        /* ---- bundled German pack ---- */
        const countEl = el.querySelector('#lp-count');
        const statusEl = el.querySelector('#lp-status');
        const dlBtn = el.querySelector('#lp-dl');
        const barWrap = el.querySelector('#lp-bar-wrap');
        const bar = el.querySelector('#lp-bar');

        LocalPack.stats().then(async st => {
          if (!st) {
            countEl.textContent = 'not bundled';
            dlBtn.disabled = true;
            statusEl.textContent = 'This build does not include the product pack.';
            return;
          }
          countEl.textContent = App.int(st.count) + ' products';
          statusEl.innerHTML = `Snapshot from ${App.esc(st.built)} · ${st.shards} parts.`;
          if (await LocalPack.isDownloaded()) {
            dlBtn.innerHTML = App.icon('check') + 'Saved offline';
            dlBtn.classList.add('primary');
          }
        });

        dlBtn.addEventListener('click', async () => {
          dlBtn.disabled = true;
          barWrap.hidden = false;
          try {
            const r = await LocalPack.download((done, total, bytes) => {
              bar.style.width = (done / total * 100) + '%';
              statusEl.textContent = `Saving ${done}/${total} · ${(bytes / 1024 / 1024).toFixed(1)} MB`;
            });
            dlBtn.innerHTML = App.icon('check') + 'Saved offline';
            dlBtn.classList.add('primary');
            statusEl.innerHTML = `<span style="color:var(--brand)">Whole pack saved — ${(r.bytes / 1024 / 1024).toFixed(1)} MB. Barcodes now resolve with no signal.</span>`;
            App.haptic('ok');
          } catch (err) {
            statusEl.innerHTML = `<span style="color:var(--danger)">${App.esc(err.message)}</span>`;
          } finally {
            dlBtn.disabled = false;
            barWrap.hidden = true;
          }
        });

        /* ---- FoodData Central key ---- */
        const key = el.querySelector('#fd-key');
        const result = el.querySelector('#fd-result');

        const persist = App.debounce(async () => {
          App.state.settings = await Data.saveSettings({ fdcKey: key.value.trim() });
        }, 400);
        key.addEventListener('input', persist);

        el.querySelector('#fd-clear').addEventListener('click', async () => {
          key.value = '';
          App.state.settings = await Data.saveSettings({ fdcKey: '' });
          result.innerHTML = '<span class="muted">Using the shared demo key.</span>';
        });

        el.querySelector('#fd-test').addEventListener('click', async () => {
          App.state.settings = await Data.saveSettings({ fdcKey: key.value.trim() });
          result.innerHTML = '<span class="muted">Testing…</span>';
          try {
            const r = await FDC.search('broccoli raw', { limit: 1 });
            result.innerHTML = r.length
              ? `<span style="color:var(--brand)">Working — ${key.value.trim() ? 'your key' : 'the demo key'} returned “${App.esc(r[0].name)}” with ${r[0].declared.length} nutrients.</span>`
              : '<span style="color:var(--warn)">Connected, but no results came back.</span>';
          } catch (err) {
            result.innerHTML = `<span style="color:var(--danger)">${App.esc(FDC.message(err))}</span>`;
          }
        });
      }
    });
    return s;
  }

  /* ============================================================== ROOT */

  function openSettings() {
    const p = App.state.profile;
    const t = App.state.targets;
    const s = App.state.settings;

    const sheet = UI.sheet({
      full: true,
      title: 'Settings',
      body: `
        <button class="card press" type="button" data-act="open-profile" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;margin-bottom:14px">
          <div class="li-ic" style="width:48px;height:48px;border-radius:16px;background:var(--brand-dim);color:var(--brand)">
            ${App.icon('user')}</div>
          <div class="grow">
            <div style="font-size:16px;font-weight:650">${App.esc(p.name || 'Your profile')}</div>
            <div class="tiny muted">${p.age} · ${sexLabel(p.sex)} · ${App.n(p.height, 0)} cm · ${App.n(p.weight, 1)} kg</div>
          </div>
          ${App.icon('right', 'li-chev')}
        </button>

        <div class="card flush mb14">
          <div class="meal-head"><div class="ic">${App.icon('target')}</div><h3>Daily targets</h3>
            <span class="kc">${p.custom && Object.keys(p.custom).length ? 'Custom' : 'Auto'}</span></div>
          <div style="padding:12px var(--pad) 14px">
            <div class="stat-row mb12">
              <div class="stat hi"><span class="v">${App.int(t.kcal)}</span><span class="k">kcal</span></div>
              <div class="stat"><span class="v">${App.int(t.protein)}g</span><span class="k">Protein</span></div>
              <div class="stat"><span class="v">${App.int(t.fiber)}g</span><span class="k">Fibre</span></div>
            </div>
            <div class="row tiny muted wrap" style="gap:12px">
              <span>BMR ${App.int(t.bmr)}</span><span>Maintenance ${App.int(t.maintenance)}</span>
              <span>Carbs ${App.int(t.carbs)}g</span><span>Fat ${App.int(t.fat)}g</span>
            </div>
            <button class="btn ghost block mt12" type="button" data-act="open-targets">
              ${App.icon('edit')}Adjust goal &amp; targets</button>
          </div>
        </div>

        <div class="section-title mb8">Preferences</div>
        <div class="card flush mb14">
          <div class="switch-row">
            <div class="sr-main"><b>Appearance</b><small>Match the system or force a theme</small></div>
          </div>
          <div style="padding:0 var(--pad) 14px">
            <div class="segmented" id="st-theme">
              ${[['system', 'System'], ['dark', 'Dark'], ['light', 'Light']].map(([v, l]) =>
                `<button type="button" data-theme="${v}" class="${(s.theme || 'system') === v ? 'on' : ''}">${l}</button>`).join('')}
            </div>
          </div>
          <div class="switch-row">
            <div class="sr-main"><b>Count exercise calories</b><small>Add burned calories to your daily budget</small></div>
            <button class="switch" type="button" role="switch" id="st-ex"
                    aria-checked="${s.addExercise !== false}"></button>
          </div>
          <div class="switch-row">
            <div class="sr-main"><b>Start week on Monday</b><small>Affects the meal planner and weekly charts</small></div>
            <button class="switch" type="button" role="switch" id="st-mon"
                    aria-checked="${(s.firstDay || 'mon') === 'mon'}"></button>
          </div>
        </div>

        <div class="section-title mb8">App</div>
        <div class="card flush mb14">
          ${navRow('barcode', 'Food databases', 'Barcode sources and API key', 'open-sources')}
          ${navRow('download', 'Data & backup', 'Export, import or reset everything', 'open-data')}
          ${navRow('share', 'Install on your iPhone', 'Add Eaty to the Home Screen', 'open-install')}
          ${navRow('info', 'About Eaty', 'Version, data sources, privacy', 'open-about')}
        </div>

        <p class="tiny muted center" style="line-height:1.6;padding:4px 12px 0">
          Everything you log stays in this browser on this device.<br>
          No account, no server, no analytics.
        </p>
      `,
      onOpen(el) {
        el.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', async () => {
          el.querySelectorAll('[data-theme]').forEach(x => x.classList.toggle('on', x === b));
          App.state.settings = await Data.saveSettings({ theme: b.dataset.theme });
          App.applyTheme();
        }));

        const ex = el.querySelector('#st-ex');
        ex.addEventListener('click', async () => {
          const now = ex.getAttribute('aria-checked') !== 'true';
          ex.setAttribute('aria-checked', String(now));
          App.state.settings = await Data.saveSettings({ addExercise: now });
          App.refresh();
        });

        const mon = el.querySelector('#st-mon');
        mon.addEventListener('click', async () => {
          const now = mon.getAttribute('aria-checked') !== 'true';
          mon.setAttribute('aria-checked', String(now));
          App.state.settings = await Data.saveSettings({ firstDay: now ? 'mon' : 'sun' });
          App.haptic('light');
          App.refresh();
        });
      }
    });
    return sheet;
  }

  function navRow(icon, title, sub, act) {
    return `<button class="list-item" type="button" data-act="${act}">
      <div class="li-ic">${App.icon(icon)}</div>
      <div class="li-main"><div class="li-title">${title}</div><div class="li-sub">${sub}</div></div>
      ${App.icon('right', 'li-chev')}
    </button>`;
  }

  function sexLabel(v) {
    return v === 'female' ? 'Female' : v === 'male' ? 'Male' : 'Not specified';
  }

  /* =========================================================== PROFILE */

  function profileSheet() {
    const p = Object.assign({}, App.state.profile);

    const s = UI.sheet({
      full: true,
      title: 'Your profile',
      subtitle: 'Used to calculate your targets',
      body: `
        <div class="field">
          <label for="pf-name">Name <span class="muted" style="font-weight:400">(optional)</span></label>
          <input id="pf-name" name="name" type="text" value="${App.esc(p.name || '')}" placeholder="Your name" autocapitalize="words">
        </div>

        <div class="field-row">
          <div class="field"><label>Age</label>
            <div class="input-suffix"><input name="age" type="number" inputmode="numeric" min="13" max="110" value="${p.age || ''}"><span>yrs</span></div></div>
          <div class="field"><label>Sex</label>
            <select name="sex">
              <option value="male"${p.sex === 'male' ? ' selected' : ''}>Male</option>
              <option value="female"${p.sex === 'female' ? ' selected' : ''}>Female</option>
              <option value="other"${p.sex === 'other' ? ' selected' : ''}>Prefer not to say</option>
            </select></div>
        </div>

        <div class="field-row">
          <div class="field"><label>Height</label>
            <div class="input-suffix"><input name="height" type="number" inputmode="decimal" step="0.5" value="${p.height || ''}"><span>cm</span></div></div>
          <div class="field"><label>Weight</label>
            <div class="input-suffix"><input name="weight" type="number" inputmode="decimal" step="0.1" value="${p.weight || ''}"><span>kg</span></div></div>
        </div>

        <div class="field">
          <label>Target weight <span class="muted" style="font-weight:400">(optional)</span></label>
          <div class="input-suffix"><input name="targetWeight" type="number" inputmode="decimal" step="0.1" value="${p.targetWeight || ''}" placeholder="Leave blank if none"><span>kg</span></div>
        </div>

        <div class="field">
          <label>Activity level</label>
          <div class="pick-grid">
            ${Nutrition.ACTIVITY.map(a => `
              <button type="button" class="pick wide ${p.activity === a.k ? 'on' : ''}" data-act-k="${a.k}">
                <b>${a.label}</b><small>${a.desc}</small></button>`).join('')}
          </div>
        </div>

        <div class="field">
          <label>Goal</label>
          <div class="pick-grid">
            ${Nutrition.GOALS.map(g => `
              <button type="button" class="pick ${p.goal === g.k ? 'on' : ''}" data-goal-k="${g.k}">
                <b>${g.label}</b><small>${g.desc}</small></button>`).join('')}
          </div>
        </div>

        <div class="card" id="pf-preview"></div>
      `,
      footer: `<button class="btn primary block" type="button" id="pf-save">${App.icon('check')}Save profile</button>`,
      onOpen(el) {
        let activity = p.activity, goal = p.goal;

        function read() {
          const f = UI.readForm(el);
          return Object.assign({}, p, f, { activity, goal });
        }
        function preview() {
          const t = Nutrition.targets(read());
          el.querySelector('#pf-preview').innerHTML = `
            <div class="card-head"><h2>New targets</h2><span class="sub">recalculated live</span></div>
            <div class="stat-row">
              <div class="stat hi"><span class="v">${App.int(t.kcal)}</span><span class="k">kcal/day</span></div>
              <div class="stat"><span class="v">${App.int(t.protein)}g</span><span class="k">Protein</span></div>
              <div class="stat"><span class="v">${App.int(t.carbs)}g</span><span class="k">Carbs</span></div>
            </div>
            <div class="row tiny muted wrap mt8" style="gap:12px">
              <span>Fat ${App.int(t.fat)}g</span><span>Fibre ${App.int(t.fiber)}g</span>
              <span>Water ${App.int(t.water)} ml</span><span>BMI ${App.n(Nutrition.bmi(read()), 1)}</span>
            </div>`;
        }

        el.querySelectorAll('[data-act-k]').forEach(b => b.addEventListener('click', () => {
          activity = b.dataset.actK;
          el.querySelectorAll('[data-act-k]').forEach(x => x.classList.toggle('on', x === b));
          preview();
        }));
        el.querySelectorAll('[data-goal-k]').forEach(b => b.addEventListener('click', () => {
          goal = b.dataset.goalK;
          el.querySelectorAll('[data-goal-k]').forEach(x => x.classList.toggle('on', x === b));
          preview();
        }));
        el.addEventListener('input', App.debounce(preview, 200));
        preview();

        el.querySelector('#pf-save').addEventListener('click', async () => {
          const next = read();
          if (!next.age || next.age < 13 || next.age > 110) return UI.toast('Enter a valid age', 'err');
          if (!next.height || next.height < 90) return UI.toast('Enter a valid height', 'err');
          if (!next.weight || next.weight < 25) return UI.toast('Enter a valid weight', 'err');
          if (!next.startWeight) next.startWeight = next.weight;

          await Data.saveProfile(next);
          App.state.profile = next;
          App.state.targets = Nutrition.targets(next);
          App.haptic('ok');
          UI.toast('Profile saved', 'ok');
          s.close();
          App.refresh();
        });
      }
    });
  }

  /* =========================================================== TARGETS */

  function targetSheet() {
    const p = Object.assign({}, App.state.profile);
    const auto = Nutrition.targets(Object.assign({}, p, { custom: {} }));
    const custom = Object.assign({}, p.custom || {});
    const isCustom = Object.keys(custom).length > 0;

    const fields = [
      ['kcal', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'],
      ['fat', 'Fat', 'g'], ['fiber', 'Fibre', 'g'], ['water', 'Water', 'ml']
    ];

    const s = UI.sheet({
      full: true,
      title: 'Goal & targets',
      body: `
        <div class="field">
          <label>Goal</label>
          <div class="pick-grid">
            ${Nutrition.GOALS.map(g => `
              <button type="button" class="pick ${p.goal === g.k ? 'on' : ''}" data-goal-k="${g.k}">
                <b>${g.label}</b><small>${g.desc}</small></button>`).join('')}
          </div>
        </div>

        <div class="card flush mb14">
          <div class="switch-row">
            <div class="sr-main"><b>Set my own numbers</b><small>Override the calculated targets</small></div>
            <button class="switch" type="button" role="switch" id="tg-custom" aria-checked="${isCustom}"></button>
          </div>
        </div>

        <div id="tg-fields" ${isCustom ? '' : 'hidden'}>
          <div class="form-card">
            ${fields.map(([k, label, unit]) => `
              <div class="field">
                <label>${label}</label>
                <div class="input-suffix">
                  <input name="${k}" type="number" inputmode="decimal"
                         value="${custom[k] !== undefined ? custom[k] : ''}"
                         placeholder="${auto[k]}"><span>${unit}</span>
                </div>
              </div>`).join('')}
            <div class="hint" id="tg-check"></div>
          </div>
        </div>

        <div class="card mt14" id="tg-preview"></div>
        <p class="tiny muted mt12" style="line-height:1.55;padding:0 4px">
          Calculated with the Mifflin-St Jeor equation and your activity multiplier.
          Leave a field blank to keep the automatic value.
        </p>
      `,
      footer: `<button class="btn ghost" type="button" id="tg-reset">${App.icon('refresh')}Reset</button>
               <button class="btn primary" type="button" id="tg-save">${App.icon('check')}Save</button>`,
      onOpen(el) {
        let goal = p.goal;
        const sw = el.querySelector('#tg-custom');

        function read() {
          const useCustom = sw.getAttribute('aria-checked') === 'true';
          const c = {};
          if (useCustom) {
            fields.forEach(([k]) => {
              const v = el.querySelector(`[name="${k}"]`).value;
              if (v !== '') c[k] = Number(v);
            });
          }
          return Object.assign({}, p, { goal, custom: c });
        }

        function preview() {
          const next = read();
          const t = Nutrition.targets(next);
          el.querySelector('#tg-preview').innerHTML = `
            <div class="card-head"><h2>Result</h2><span class="sub">${Object.keys(next.custom).length ? 'custom' : 'automatic'}</span></div>
            <div class="stat-row mb12">
              <div class="stat hi"><span class="v">${App.int(t.kcal)}</span><span class="k">kcal</span></div>
              <div class="stat"><span class="v">${App.int(t.protein)}g</span><span class="k">Protein</span></div>
              <div class="stat"><span class="v">${App.int(t.carbs)}g</span><span class="k">Carbs</span></div>
            </div>
            <div class="row tiny muted wrap" style="gap:12px">
              <span>Fat ${App.int(t.fat)}g</span><span>Fibre ${App.int(t.fiber)}g</span><span>Water ${App.int(t.water)} ml</span>
            </div>`;

          const macroKcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
          const box = el.querySelector('#tg-check');
          if (box) {
            const diff = Math.abs(macroKcal - t.kcal);
            box.innerHTML = diff > t.kcal * 0.06
              ? `<span style="color:var(--warn)">Your macros add up to ${App.int(macroKcal)} kcal — ${App.int(diff)} away from your calorie target.</span>`
              : `<span style="color:var(--brand)">Macros add up to ${App.int(macroKcal)} kcal ✓</span>`;
          }
        }

        el.querySelectorAll('[data-goal-k]').forEach(b => b.addEventListener('click', () => {
          goal = b.dataset.goalK;
          el.querySelectorAll('[data-goal-k]').forEach(x => x.classList.toggle('on', x === b));
          preview();
        }));

        sw.addEventListener('click', () => {
          const now = sw.getAttribute('aria-checked') !== 'true';
          sw.setAttribute('aria-checked', String(now));
          el.querySelector('#tg-fields').hidden = !now;
          if (now) {
            // Seed the fields from the current automatic values so nothing is blank.
            const t = Nutrition.targets(Object.assign({}, p, { goal, custom: {} }));
            fields.forEach(([k]) => {
              const inp = el.querySelector(`[name="${k}"]`);
              if (!inp.value) inp.value = t[k];
            });
          }
          preview();
        });

        el.addEventListener('input', App.debounce(preview, 200));
        preview();

        el.querySelector('#tg-reset').addEventListener('click', () => {
          sw.setAttribute('aria-checked', 'false');
          el.querySelector('#tg-fields').hidden = true;
          fields.forEach(([k]) => el.querySelector(`[name="${k}"]`).value = '');
          preview();
        });

        el.querySelector('#tg-save').addEventListener('click', async () => {
          const next = read();
          await Data.saveProfile(next);
          App.state.profile = next;
          App.state.targets = Nutrition.targets(next);
          App.haptic('ok');
          UI.toast('Targets updated', 'ok');
          s.close();
          App.refresh();
        });
      }
    });
  }

  /* ============================================================== DATA */

  function dataSheet() {
    const s = UI.sheet({
      full: true,
      title: 'Data & backup',
      body: `
        <div class="card mb14" id="dt-stats"><div class="skeleton" style="height:60px"></div></div>

        <div class="card flush mb14">
          <button class="list-item" type="button" id="dt-export">
            <div class="li-ic" style="background:var(--brand-dim);color:var(--brand)">${App.icon('download')}</div>
            <div class="li-main"><div class="li-title">Export a backup</div>
              <div class="li-sub">Download everything as a JSON file</div></div>
            ${App.icon('right', 'li-chev')}
          </button>
          <button class="list-item" type="button" id="dt-share">
            <div class="li-ic">${App.icon('share')}</div>
            <div class="li-main"><div class="li-title">Share backup</div>
              <div class="li-sub">Send to Files, Notes, iCloud Drive…</div></div>
            ${App.icon('right', 'li-chev')}
          </button>
          <button class="list-item" type="button" id="dt-import">
            <div class="li-ic">${App.icon('upload')}</div>
            <div class="li-main"><div class="li-title">Import a backup</div>
              <div class="li-sub">Restore from a previously exported file</div></div>
            ${App.icon('right', 'li-chev')}
          </button>
          <input type="file" id="dt-file" accept="application/json,.json" hidden>
        </div>

        <div class="section-title mb8">Danger zone</div>
        <div class="card flush">
          <button class="list-item" type="button" id="dt-clear-diary">
            <div class="li-ic" style="color:var(--danger)">${App.icon('trash')}</div>
            <div class="li-main"><div class="li-title" style="color:var(--danger)">Clear the food diary</div>
              <div class="li-sub">Keeps recipes, profile and weight history</div></div>
          </button>
          <button class="list-item" type="button" id="dt-reset">
            <div class="li-ic" style="color:var(--danger)">${App.icon('refresh')}</div>
            <div class="li-main"><div class="li-title" style="color:var(--danger)">Reset everything</div>
              <div class="li-sub">Deletes all data and starts over</div></div>
          </button>
        </div>

        <p class="tiny muted mt16" style="line-height:1.6;padding:0 4px">
          Back up regularly. Clearing Safari's website data, or deleting the app from your
          Home Screen, removes everything stored here.
        </p>
      `,
      onOpen(el) {
        Data.stats().then(st => {
          el.querySelector('#dt-stats').innerHTML = `
            <div class="card-head"><h2>Stored on this device</h2>
              <span class="sub">${Data.DB.isFallback ? 'localStorage' : 'IndexedDB'}</span></div>
            <div class="stat-row mb12">
              <div class="stat hi"><span class="v">${st.entries}</span><span class="k">Diary entries</span></div>
              <div class="stat"><span class="v">${st.recipes}</span><span class="k">Recipes</span></div>
              <div class="stat"><span class="v">${st.weights}</span><span class="k">Weigh-ins</span></div>
            </div>
            <div class="row tiny muted wrap" style="gap:12px">
              <span>${st.foods} custom foods</span><span>${st.workouts} workouts</span>
              <span>${st.plans} weekly plans</span><span>${st.favorites} favourites</span>
            </div>`;
        });

        el.querySelector('#dt-export').addEventListener('click', () => doExport(false));
        el.querySelector('#dt-share').addEventListener('click', () => doExport(true));

        const file = el.querySelector('#dt-file');
        el.querySelector('#dt-import').addEventListener('click', () => file.click());
        file.addEventListener('change', async () => {
          const f = file.files && file.files[0];
          file.value = '';
          if (!f) return;
          let payload;
          try {
            payload = JSON.parse(await f.text());
          } catch (e) {
            return UI.toast('That file is not valid JSON', 'err');
          }
          if (!payload || payload.app !== 'eaty' || !payload.data) {
            return UI.toast('Not an Eaty backup file', 'err');
          }
          const counts = Object.keys(payload.data)
            .map(k => `${(payload.data[k] || []).length} ${k}`).join(', ');

          const mode = await new Promise(resolve => {
            const ms = UI.sheet({
              title: 'Import backup',
              subtitle: payload.exportedAt ? 'From ' + new Date(payload.exportedAt).toLocaleString() : '',
              body: `<p class="tiny muted mb12" style="line-height:1.55">This file contains ${App.esc(counts)}.</p>
                     <div class="stack" style="gap:10px">
                       <button class="btn block" type="button" data-mode="merge">${App.icon('plus')}Merge with my data</button>
                       <button class="btn danger block" type="button" data-mode="replace">${App.icon('refresh')}Replace everything</button>
                     </div>`,
              onOpen(m) {
                m.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
                  ms.close(); resolve(b.dataset.mode);
                }));
              },
              onClose() { resolve(null); }
            });
          });
          if (!mode) return;

          try {
            const n = await Data.importAll(payload, mode);
            App.haptic('ok');
            UI.toast(`Imported ${n} records`, 'ok');
            s.close();
            await App.boot(true);
          } catch (e) {
            console.error(e);
            UI.toast('Import failed', 'err');
          }
        });

        el.querySelector('#dt-clear-diary').addEventListener('click', async () => {
          const ok = await UI.confirm({
            title: 'Clear the food diary?',
            message: 'Every logged meal, workout, water and note is deleted. Recipes, custom foods, plans, weigh-ins and your profile are kept.',
            confirmLabel: 'Clear diary', danger: true
          });
          if (!ok) return;
          await Data.DB.clear('entries');
          await Data.DB.clear('workouts');
          await Data.DB.clear('days');
          UI.toast('Diary cleared', 'ok');
          s.close();
          App.refresh();
        });

        el.querySelector('#dt-reset').addEventListener('click', async () => {
          const ok = await UI.confirm({
            title: 'Reset everything?',
            message: 'All of your data is permanently deleted from this device and setup starts again. Export a backup first if you might want it back.',
            confirmLabel: 'Delete everything', danger: true
          });
          if (!ok) return;
          await Data.resetAll();
          UI.closeAll();
          setTimeout(() => location.reload(), 300);
        });
      }
    });
  }

  App.exportBackup = doExport;

  async function doExport(share) {
    try {
      const payload = await Data.exportAll();
      const json = JSON.stringify(payload, null, 2);
      const name = `eaty-backup-${App.date.today()}.json`;

      if (share && navigator.share && navigator.canShare) {
        const file = new File([json], name, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Eaty backup' });
          return;
        }
      }

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      App.state.settings = await Data.saveSettings({ lastBackup: Date.now() });
      UI.toast('Backup downloaded', 'ok');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.error(e);
      UI.toast('Export failed', 'err');
    }
  }

  /* =========================================================== INSTALL */

  function installSheet() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const s = UI.sheet({
      title: standalone ? 'Eaty is installed' : 'Install on your iPhone',
      body: standalone
        ? `<div class="empty"><div class="ic" style="background:var(--brand-dim);color:var(--brand)">${App.icon('check')}</div>
             <h3>Running as an app</h3>
             <p>You're in standalone mode — full screen, offline-ready, with your own icon.</p></div>`
        : `<div class="stack" style="gap:14px">
             ${App.installPrompt ? `<button class="btn primary block" type="button" id="in-native">
               ${App.icon('download')}Install now</button>` : ''}
             <ol class="stack" style="gap:12px">
               ${[
                 [isIOS ? 'Tap the Share button in Safari' : 'Open this page in Safari on your iPhone',
                  isIOS ? 'The square with an arrow pointing up, at the bottom of the screen.' : 'The install option only appears in Safari, not other browsers.'],
                 ['Choose “Add to Home Screen”', 'Scroll down the share sheet if you do not see it right away.'],
                 ['Tap “Add”', 'Eaty appears on your Home Screen with its own icon and launch screen.']
               ].map(([t, d], i) => `
                 <li class="card" style="display:flex;gap:12px;align-items:flex-start;padding:13px 14px">
                   <span style="flex:none;width:26px;height:26px;border-radius:50%;background:var(--brand);color:var(--on-brand);
                                display:grid;place-items:center;font-size:13px;font-weight:700">${i + 1}</span>
                   <span><b style="font-size:14.5px;display:block;margin-bottom:2px">${t}</b>
                     <span class="tiny muted" style="line-height:1.5">${d}</span></span>
                 </li>`).join('')}
             </ol>
             <p class="tiny muted" style="line-height:1.6;padding:0 4px">
               Once installed, Eaty works with no connection at all. Your data lives in the app's own
               storage — keep a backup from Data &amp; backup if it matters to you.
             </p>
           </div>`,
      onOpen(el) {
        const btn = el.querySelector('#in-native');
        if (btn) btn.addEventListener('click', async () => {
          if (!App.installPrompt) return;
          App.installPrompt.prompt();
          const res = await App.installPrompt.userChoice;
          App.installPrompt = null;
          s.close();
          if (res && res.outcome === 'accepted') UI.toast('Installing…', 'ok');
        });
      }
    });
  }

  /* ============================================================= ABOUT */

  function aboutSheet() {
    UI.sheet({
      title: 'About Eaty',
      body: `
        <div class="center" style="padding:8px 0 18px">
          <div style="width:72px;height:72px;border-radius:21px;margin:0 auto 12px;display:grid;place-items:center;
                      background:linear-gradient(150deg,var(--brand),var(--brand-2));color:#fff;
                      box-shadow:0 14px 34px -12px rgba(16,185,129,.7)">
            <svg viewBox="0 0 24 24" width="36" height="36"><use href="#i-leaf"/></svg></div>
          <div style="font-size:19px;font-weight:700;letter-spacing:-.02em">Eaty</div>
          <div class="tiny muted">Version ${App.version}</div>
        </div>

        <div class="card flush mb14">
          ${[
            ['Private by design', 'No account, no server, no analytics. Everything you log is stored in this browser using IndexedDB.'],
            ['Nutrition data', `${FoodDB.count()} built-in foods with full macro and micronutrient profiles, approximated from USDA FoodData Central.`],
            ['Product data', 'The bundled German supermarket pack and all barcode lookups come from Open Food Facts, used under the Open Database License (ODbL) v1.0. Open Food Facts is not affiliated with this app. Retailer and brand names are trademarks of their owners.'],
            ['Reference intakes', 'US RDA/AI values adjusted for your age and sex. Sodium is treated as a ceiling rather than a goal.'],
            ['Energy targets', 'Mifflin-St Jeor basal metabolic rate × activity multiplier, adjusted for your goal.']
          ].map(([t, d]) => `<div style="padding:13px var(--pad);border-bottom:1px solid var(--line)">
            <b style="font-size:14.5px;display:block;margin-bottom:3px">${t}</b>
            <span class="tiny muted" style="line-height:1.55">${d}</span></div>`).join('')}
        </div>

        <p class="tiny muted" style="line-height:1.6;padding:0 4px">
          Eaty is a personal tracking tool, not medical advice. Talk to a doctor or registered
          dietitian before making significant changes to how you eat, especially if you have a
          health condition or are pregnant.
        </p>
      `
    });
  }

  App.openSettings = openSettings;
  App.profileSheet = profileSheet;
})();
