/* ==========================================================================
   onboarding.js — first-run setup
   ========================================================================== */
(function () {
  'use strict';

  const DEFAULTS = {
    name: '', age: 30, sex: 'male', height: 175, weight: 75,
    activity: 'light', goal: 'maintain', targetWeight: null, custom: {}
  };

  function start() {
    const p = Object.assign({}, DEFAULTS);
    let step = 0;

    const host = App.$('#onboard-host');
    host.style.pointerEvents = 'auto';
    const root = document.createElement('div');
    root.className = 'onboard';
    host.appendChild(root);

    const steps = [
      /* ---------------------------------------------------------- 0 */
      {
        render: () => `
          <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:26px">
            <div style="width:88px;height:88px;border-radius:26px;display:grid;place-items:center;
                        background:linear-gradient(150deg,var(--brand),var(--brand-2));color:#fff;
                        box-shadow:0 20px 50px -16px rgba(16,185,129,.75);margin-bottom:22px">
              <svg viewBox="0 0 24 24" width="46" height="46"><use href="#i-leaf"/></svg></div>
            <h2>Welcome to Eaty</h2>
            <p class="lede" style="max-width:32ch">A complete nutrition tracker that runs entirely on your
              iPhone. No account, no server — your food diary never leaves this device.</p>
          </div>
          <div class="stack" style="gap:10px">
            ${[
              ['flame', 'Calories and macros', 'Rings, targets and a daily budget that adapts to your training'],
              ['leaf', 'Vitamins and minerals', '20 micronutrients tracked against your reference intakes'],
              ['recipes', 'Recipes and meal plans', 'Build once, log in a tap, and generate a shopping list']
            ].map(([ic, t, d]) => `<div class="card" style="display:flex;gap:13px;align-items:center;padding:13px 14px">
              <span style="flex:none;width:38px;height:38px;border-radius:12px;background:var(--brand-dim);
                           color:var(--brand);display:grid;place-items:center">${App.icon(ic)}</span>
              <span><b style="font-size:14.5px;display:block">${t}</b>
                <span class="tiny muted" style="line-height:1.45">${d}</span></span>
            </div>`).join('')}
          </div>`,
        next: 'Get started'
      },

      /* ---------------------------------------------------------- 1 */
      {
        render: () => `
          <h2>About you</h2>
          <p class="lede">These four numbers set your calorie and protein targets. You can change them any time.</p>
          <div class="field">
            <label for="ob-name">Name <span class="muted" style="font-weight:400">(optional)</span></label>
            <input id="ob-name" name="name" type="text" value="${App.esc(p.name)}" placeholder="What should we call you?" autocapitalize="words">
          </div>
          <div class="field-row">
            <div class="field"><label>Age</label>
              <div class="input-suffix"><input name="age" type="number" inputmode="numeric" min="13" max="110" value="${p.age}"><span>yrs</span></div></div>
            <div class="field"><label>Sex</label>
              <select name="sex">
                <option value="male"${p.sex === 'male' ? ' selected' : ''}>Male</option>
                <option value="female"${p.sex === 'female' ? ' selected' : ''}>Female</option>
                <option value="other"${p.sex === 'other' ? ' selected' : ''}>Prefer not to say</option>
              </select></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Height</label>
              <div class="input-suffix"><input name="height" type="number" inputmode="decimal" step="0.5" value="${p.height}"><span>cm</span></div></div>
            <div class="field"><label>Weight</label>
              <div class="input-suffix"><input name="weight" type="number" inputmode="decimal" step="0.1" value="${p.weight}"><span>kg</span></div></div>
          </div>
          <p class="tiny muted" style="line-height:1.55">Sex is used only for the metabolic equation and
            reference intakes. Choosing “prefer not to say” uses a midpoint of both.</p>`,
        collect(el) {
          const f = UI.readForm(el);
          Object.assign(p, f);
          if (!p.age || p.age < 13 || p.age > 110) return 'Enter an age between 13 and 110';
          if (!p.height || p.height < 90 || p.height > 250) return 'Enter a height in centimetres';
          if (!p.weight || p.weight < 25 || p.weight > 400) return 'Enter a weight in kilograms';
          return null;
        }
      },

      /* ---------------------------------------------------------- 2 */
      {
        render: () => `
          <h2>How active are you?</h2>
          <p class="lede">Count everything — work, walking and training. Most people sit between lightly and moderately active.</p>
          <div class="pick-grid">
            ${Nutrition.ACTIVITY.map(a => `
              <button type="button" class="pick wide ${p.activity === a.k ? 'on' : ''}" data-pick="activity" data-v="${a.k}">
                <b>${a.label}</b><small>${a.desc}</small></button>`).join('')}
          </div>`
      },

      /* ---------------------------------------------------------- 3 */
      {
        render: () => `
          <h2>What's the goal?</h2>
          <p class="lede">This sets your calorie adjustment and how much protein you aim for.</p>
          <div class="pick-grid">
            ${Nutrition.GOALS.map(g => `
              <button type="button" class="pick ${p.goal === g.k ? 'on' : ''}" data-pick="goal" data-v="${g.k}">
                <b>${g.label}</b><small>${g.desc}</small></button>`).join('')}
          </div>
          <div class="field mt16" id="ob-target" ${p.goal === 'lose' || p.goal === 'gain' ? '' : 'hidden'}>
            <label>Target weight <span class="muted" style="font-weight:400">(optional)</span></label>
            <div class="input-suffix">
              <input name="targetWeight" type="number" inputmode="decimal" step="0.1"
                     value="${p.targetWeight || ''}" placeholder="${p.goal === 'lose' ? App.n(p.weight - 5, 1) : App.n(p.weight + 4, 1)}"><span>kg</span></div>
            <div class="hint">Used to show progress on your weight chart.</div>
          </div>`,
        collect(el) {
          const inp = el.querySelector('[name="targetWeight"]');
          p.targetWeight = inp && inp.value ? Number(inp.value) : null;
          return null;
        }
      },

      /* ---------------------------------------------------------- 4 */
      {
        render() {
          const t = Nutrition.targets(p);
          const goal = Nutrition.GOALS.find(g => g.k === p.goal);
          return `
            <h2>Your daily targets</h2>
            <p class="lede">Calculated from your profile. Fine-tune them any time in Settings.</p>

            <div class="card glow mb14">
              <div class="row" style="gap:16px;align-items:center">
                ${Charts.rings([{ pct: 100, color: 'var(--kcal)' }], {
                  size: 116, stroke: 12,
                  center: `<div class="big">${App.int(t.kcal)}</div><div class="lbl">kcal / day</div>`
                })}
                <div class="grow stack" style="gap:8px">
                  ${[['Protein', t.protein + 'g', 'var(--protein)'],
                     ['Carbs', t.carbs + 'g', 'var(--carbs)'],
                     ['Fat', t.fat + 'g', 'var(--fat)'],
                     ['Fibre', t.fiber + 'g', 'var(--fiber)']].map(([l, v, c]) =>
                    `<div class="row"><span class="grow tiny muted" style="font-weight:600">${l}</span>
                     <b class="num" style="font-size:14.5px;color:${c}">${v}</b></div>`).join('')}
                </div>
              </div>
            </div>

            <div class="stat-row mb14">
              <div class="stat"><span class="v">${App.int(t.bmr)}</span><span class="k">BMR</span></div>
              <div class="stat"><span class="v">${App.int(t.maintenance)}</span><span class="k">Maintenance</span></div>
              <div class="stat hi"><span class="v">${t.kcal > t.maintenance ? '+' : ''}${App.int(t.kcal - t.maintenance)}</span><span class="k">Adjustment</span></div>
            </div>

            <div class="card">
              <div class="row" style="gap:11px;align-items:flex-start">
                <span style="flex:none;color:var(--brand);margin-top:1px">${App.icon('sparkle')}</span>
                <span class="tiny" style="line-height:1.55">
                  <b>${goal.label}</b> — ${App.esc(goal.desc.toLowerCase())}. We'll also track 20 vitamins and
                  minerals, ${App.int(t.water)} ml of water and a daily nutrition score out of 100.
                </span>
              </div>
            </div>

            <p class="tiny muted mt14" style="line-height:1.55">
              Eaty is a tracking tool, not medical advice. Talk to a doctor or dietitian before
              making significant changes to how you eat.
            </p>`;
        },
        next: 'Start tracking'
      }
    ];

    function draw() {
      const cfg = steps[step];
      root.innerHTML = `
        <div class="onboard-progress">
          ${steps.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}
        </div>
        <div class="onboard-body">${cfg.render()}</div>
        <div class="onboard-foot">
          ${step > 0 ? `<button class="btn ghost" type="button" id="ob-back">${App.icon('left')}Back</button>` : ''}
          <button class="btn primary grow" type="button" id="ob-next">${cfg.next || 'Continue'}</button>
        </div>`;

      root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
        const field = b.dataset.pick;
        p[field] = b.dataset.v;
        root.querySelectorAll(`[data-pick="${field}"]`).forEach(x => x.classList.toggle('on', x === b));
        App.haptic('light');
        const tw = root.querySelector('#ob-target');
        if (tw && field === 'goal') tw.hidden = !(p.goal === 'lose' || p.goal === 'gain');
      }));

      const back = root.querySelector('#ob-back');
      if (back) back.addEventListener('click', () => { step--; draw(); });

      root.querySelector('#ob-next').addEventListener('click', async () => {
        if (cfg.collect) {
          const err = cfg.collect(root);
          if (err) { App.haptic('err'); return UI.toast(err, 'err'); }
        }
        if (step === steps.length - 1) return finish();
        step++;
        App.haptic('light');
        draw();
      });

      root.querySelector('.onboard-body').scrollTop = 0;
    }

    async function finish() {
      const btn = root.querySelector('#ob-next');
      btn.disabled = true;
      btn.textContent = 'Setting up…';

      p.startWeight = p.weight;
      p.created = Date.now();
      await Data.saveProfile(p);

      // Seed a starter recipe library and the first weigh-in.
      try {
        const existing = await Data.recipes();
        if (!existing.length) {
          for (const r of App.starterRecipes()) await Data.saveRecipe(r);
        }
        await Data.saveWeight({
          date: App.date.today(), kg: p.weight, bodyFat: null, m: {}, note: 'Starting weight', ts: Date.now()
        });
      } catch (e) { console.warn('seed failed', e); }

      App.haptic('ok');
      root.style.transition = 'opacity .35s ease, transform .35s ease';
      root.style.opacity = '0';
      root.style.transform = 'scale(1.02)';
      setTimeout(() => {
        root.remove();
        App.$('#onboard-host').style.pointerEvents = 'none';
      }, 360);

      await App.boot(true);
      setTimeout(() => UI.toast('You\'re all set — log your first meal', 'ok'), 500);
    }

    draw();
  }

  App.onboarding = { start };
})();
