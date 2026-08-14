/* ==========================================================================
   views/recipes.js — recipe library, editor, and detail view
   ========================================================================== */
(function () {
  'use strict';

  const CATS = App.RECIPE_CATS = [
    'Breakfast', 'Lunch', 'Dinner', 'Snacks',
    'High protein', 'Low calorie', 'Muscle gain', 'Weight loss',
    'Vegetarian', 'Vegan'
  ];

  let filter = 'all';
  let query = '';

  App.views.recipes = {
    title: () => 'Recipes',
    sub: () => null,
    actions: () => `<button class="appbar-btn accent" type="button" data-act="new-recipe" aria-label="New recipe">${App.icon('plus')}</button>`,

    async render(el) {
      const [recipes, favs] = await Promise.all([Data.recipes(), Data.favorites()]);
      App.state.recipesCache = recipes;
      const favIds = new Set(favs.filter(f => f.id.startsWith('recipe:')).map(f => f.id.slice(7)));

      let list = recipes.slice();
      if (filter === 'fav') list = list.filter(r => favIds.has(r.id));
      else if (filter !== 'all') list = list.filter(r => (r.cats || []).includes(filter));
      if (query) {
        const q = query.toLowerCase();
        list = list.filter(r => (r.name + ' ' + (r.cats || []).join(' ') +
          ' ' + (r.ingredients || []).map(i => i.name).join(' ')).toLowerCase().includes(q));
      }
      list.sort((a, b) => (b.updated || 0) - (a.updated || 0));

      el.innerHTML = `
      <div class="stack">
        <div class="searchbar">
          ${App.icon('search')}
          <input type="search" id="rc-q" placeholder="Search recipes and ingredients" value="${App.esc(query)}"
                 autocomplete="off" autocapitalize="none" spellcheck="false">
          ${query ? `<button class="clr" type="button" data-act="rc-clear">${App.icon('close')}</button>` : ''}
        </div>

        <div class="chips bleed">
          <button class="chip ${filter === 'all' ? 'on' : ''}" data-act="rc-filter" data-f="all">All ${recipes.length ? `<span class="muted">${recipes.length}</span>` : ''}</button>
          <button class="chip ${filter === 'fav' ? 'on' : ''}" data-act="rc-filter" data-f="fav">${App.icon('star')}Favourites</button>
          ${CATS.map(c => `<button class="chip ${filter === c ? 'on' : ''}" data-act="rc-filter" data-f="${c}">${c}</button>`).join('')}
        </div>

        ${list.length ? `<div class="recipe-grid">${list.map(r => cardHtml(r, favIds.has(r.id))).join('')}</div>`
          : UI.emptyState('recipes',
              recipes.length ? 'No recipes match' : 'No recipes yet',
              recipes.length ? 'Try a different filter or search term.'
                : 'Build a recipe once and log it in a single tap — nutrition is calculated from the ingredients.',
              `<button class="btn primary mt8" type="button" data-act="new-recipe">${App.icon('plus')}Create a recipe</button>`)}

        ${recipes.length ? `<button class="btn ghost block" type="button" data-act="new-recipe">
          ${App.icon('plus')}New recipe</button>` : ''}
      </div>`;

      const q = el.querySelector('#rc-q');
      q.addEventListener('input', App.debounce(() => {
        query = q.value;
        App.refresh().then(() => {
          const nq = App.$('#rc-q');
          if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }
        });
      }, 260));
    }
  };

  function cardHtml(r, isFav) {
    const rn = App.recipeNutrition(r);
    return `<div class="recipe-card-wrap">
      <button class="recipe-card" type="button" data-act="open-recipe" data-id="${r.id}" style="width:100%">
        ${r.image
          ? `<img class="recipe-thumb" src="${r.image}" alt="" loading="lazy">`
          : `<div class="recipe-thumb ph">${App.icon('recipes')}</div>`}
        <div class="recipe-body">
          <h3>${App.esc(r.name)}</h3>
          <div class="recipe-meta">
            <span>${App.icon('flame')}${App.int(rn.perServing.kcal)} kcal</span>
            <span style="color:var(--protein)">${App.n(rn.perServing.protein, 0)}g P</span>
            ${r.minutes ? `<span>${App.icon('clock')}${r.minutes}m</span>` : ''}
          </div>
        </div>
      </button>
      <button class="recipe-fav${isFav ? ' on' : ''}" type="button" data-act="fav-recipe" data-id="${r.id}" aria-label="Favourite">
        ${App.icon('star')}</button>
    </div>`;
  }

  /* =========================================================== ACTIONS */

  App.act({
    'rc-filter': el => { filter = el.dataset.f; App.refresh(); },
    'rc-clear': () => { query = ''; App.refresh(); },
    'new-recipe': () => editor(null),

    async 'fav-recipe'(el) {
      const now = await Data.toggleFav('recipe:' + el.dataset.id, { kind: 'recipe' });
      el.classList.toggle('on', now);
      App.haptic('light');
    },

    async 'open-recipe'(el) {
      const r = await Data.recipe(el.dataset.id);
      if (r) detail(r);
    }
  });

  /* ============================================================ DETAIL */

  async function detail(r) {
    const rn = App.recipeNutrition(r);
    const t = App.state.targets;
    const isFav = await Data.isFav('recipe:' + r.id);

    const s = UI.sheet({
      full: true,
      title: r.name,
      subtitle: `${r.servings} serving${r.servings === 1 ? '' : 's'}${r.minutes ? ' · ' + r.minutes + ' min' : ''}`,
      headerRight: `<button class="icon-btn${isFav ? ' accent' : ''}" type="button" id="rd-fav" aria-label="Favourite">${App.icon('star')}</button>
                    <button class="icon-btn" type="button" id="rd-more" aria-label="More">${App.icon('more')}</button>`,
      body: `
        ${r.image ? `<img class="hero-img mb12" src="${r.image}" alt="">` : ''}

        ${(r.cats || []).length ? `<div class="chips mb12">${r.cats.map(c => `<span class="chip on">${App.esc(c)}</span>`).join('')}</div>` : ''}

        <div class="card mb12">
          <div class="card-head"><h2>Per serving</h2>
            <span class="sub">${App.n(rn.gramsPerServing, 0)} g</span></div>
          <div class="between mb12">
            <div><div class="num" style="font-size:30px;font-weight:750;line-height:1">${App.int(rn.perServing.kcal)}</div>
              <div class="tiny muted" style="font-weight:600">calories</div></div>
            <div class="tiny muted" style="text-align:right;line-height:1.6">
              Fibre ${App.n(rn.perServing.fiber, 1)}g<br>
              Sugars ${App.n(rn.perServing.sugar, 1)}g<br>
              Sat. fat ${App.n(rn.perServing.satfat, 1)}g
            </div>
          </div>
          <div class="macro-grid">
            ${UI.macroCell('p', 'Protein', rn.perServing.protein, t.protein)}
            ${UI.macroCell('c', 'Carbs', rn.perServing.carbs, t.carbs)}
            ${UI.macroCell('f', 'Fat', rn.perServing.fat, t.fat)}
          </div>
          <div class="tiny muted mt8">Bars show this serving against your daily target.</div>
        </div>

        <div class="card mb12">
          <div class="card-head"><h2>Ingredients</h2>
            <span class="sub">${(r.ingredients || []).length}</span></div>
          ${(r.ingredients || []).map(i => {
            const n = Nutrition.scale(i.n100 || {}, i.grams);
            return `<div class="ing-row">
              <div class="ing-main"><b>${App.esc(i.name)}</b>
                <small>${App.n(i.grams, 0)} g${i.servingLabel && i.qty ? ` · ${App.n(i.qty, 2)} × ${App.esc(i.servingLabel)}` : ''}</small></div>
              <div class="li-right"><div class="li-kcal">${App.int(n.kcal)}</div><div class="li-macros">kcal</div></div>
            </div>`;
          }).join('') || '<p class="tiny muted">No ingredients yet.</p>'}
        </div>

        ${(r.instructions || []).length ? `<div class="card mb12">
          <div class="card-head"><h2>Method</h2></div>
          <ol style="display:flex;flex-direction:column;gap:12px;counter-reset:step">
            ${r.instructions.map((step, i) => `<li class="row" style="align-items:flex-start;gap:11px">
              <span style="flex:none;width:24px;height:24px;border-radius:50%;background:var(--brand-dim);color:var(--brand);
                           display:grid;place-items:center;font-size:12px;font-weight:700">${i + 1}</span>
              <span style="font-size:14.5px;line-height:1.5">${App.esc(step)}</span>
            </li>`).join('')}
          </ol>
        </div>` : ''}

        <div class="section-title mb8">Vitamins per serving</div>
        <div class="card mb12">${UI.microGrid(rn.perServing, t, 'vitamin')}</div>
        <div class="section-title mb8">Minerals per serving</div>
        <div class="card">${UI.microGrid(rn.perServing, t, 'mineral')}</div>
      `,
      footer: `<button class="btn ghost" type="button" id="rd-edit">${App.icon('edit')}Edit</button>
               <button class="btn primary" type="button" id="rd-add">${App.icon('plus')}Add to diary</button>`,
      onOpen(el) {
        el.querySelector('#rd-fav').addEventListener('click', async function () {
          const now = await Data.toggleFav('recipe:' + r.id, { kind: 'recipe', name: r.name });
          this.classList.toggle('accent', now);
          App.haptic('light');
        });
        el.querySelector('#rd-edit').addEventListener('click', () => { s.close(); setTimeout(() => editor(r), 200); });
        el.querySelector('#rd-add').addEventListener('click', () => {
          FoodSheet.openPortion({ kind: 'recipe', data: r }, { mode: 'diary', date: App.state.date, meal: guessMeal(r) }, s);
        });
        el.querySelector('#rd-more').addEventListener('click', () => {
          UI.actions({
            title: r.name,
            items: [
              { label: 'Add to meal plan', icon: 'plan', onClick: () => { s.close(); App.addRecipeToPlan && App.addRecipeToPlan(r); } },
              { label: 'Duplicate', icon: 'copy', onClick: async () => {
                  const copy = Object.assign({}, r, {
                    id: App.uid('r'), name: r.name + ' (copy)', created: Date.now(), updated: Date.now()
                  });
                  await Data.saveRecipe(copy);
                  App.state.recipesCache = await Data.recipes();
                  UI.toast('Duplicated', 'ok'); s.close(); App.refresh();
                } },
              '-',
              { label: 'Delete recipe', icon: 'trash', danger: true, onClick: async () => {
                  const ok = await UI.confirm({
                    title: 'Delete recipe?',
                    message: `“${r.name}” will be removed. Diary entries already logged keep their numbers.`,
                    confirmLabel: 'Delete', danger: true
                  });
                  if (!ok) return;
                  await Data.deleteRecipe(r.id);
                  App.state.recipesCache = await Data.recipes();
                  UI.toast('Recipe deleted');
                  s.close(); App.refresh();
                } }
            ]
          });
        });
      }
    });
  }

  function guessMeal(r) {
    const c = (r.cats || []).map(x => x.toLowerCase());
    if (c.includes('breakfast')) return 'breakfast';
    if (c.includes('lunch')) return 'lunch';
    if (c.includes('dinner')) return 'dinner';
    if (c.includes('snacks')) return 'snacks';
    return 'dinner';
  }

  /* ============================================================ EDITOR */

  function editor(existing) {
    const r = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: App.uid('r'), name: '', image: '', servings: 2, minutes: 20,
      cats: [], ingredients: [], instructions: [''], created: Date.now()
    };
    if (!r.instructions || !r.instructions.length) r.instructions = [''];

    const s = UI.sheet({
      full: true,
      title: existing ? 'Edit recipe' : 'New recipe',
      body: `
        <div class="field">
          <label>Photo</label>
          <div id="re-img">${imgHtml(r.image)}</div>
          <input type="file" id="re-file" accept="image/*" hidden>
        </div>

        <div class="field">
          <label for="re-name">Name</label>
          <input id="re-name" type="text" value="${App.esc(r.name)}" placeholder="Chicken rice bowl" autocapitalize="sentences">
        </div>

        <div class="field-row">
          <div class="field"><label>Servings</label>
            <input id="re-serv" type="number" min="1" step="1" inputmode="numeric" value="${r.servings}"></div>
          <div class="field"><label>Time</label>
            <div class="input-suffix"><input id="re-min" type="number" min="0" step="5" inputmode="numeric" value="${r.minutes}"><span>min</span></div></div>
        </div>

        <div class="field">
          <label>Categories</label>
          <div class="chips" style="flex-wrap:wrap;overflow:visible" id="re-cats">
            ${App.RECIPE_CATS.map(c => `<button type="button" class="chip ${r.cats.includes(c) ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('')}
          </div>
        </div>

        <div class="section-title mb8">Ingredients</div>
        <div class="card flush mb12">
          <div id="re-ings"></div>
          <button class="meal-add" type="button" id="re-add-ing">${App.icon('plus')}Add ingredient</button>
        </div>
        <div class="card mb16" id="re-nutri"></div>

        <div class="section-title mb8">Method</div>
        <div class="card flush">
          <div id="re-steps"></div>
          <button class="meal-add" type="button" id="re-add-step">${App.icon('plus')}Add step</button>
        </div>
      `,
      footer: `${existing ? `<button class="btn danger" type="button" id="re-del">${App.icon('trash')}</button>` : ''}
               <button class="btn primary" type="button" id="re-save">${App.icon('check')}Save recipe</button>`,
      onOpen(el) {
        /* ---- image ---- */
        const fileInput = el.querySelector('#re-file');
        el.querySelector('#re-img').addEventListener('click', e => {
          if (e.target.closest('[data-rm-img]')) {
            r.image = '';
            el.querySelector('#re-img').innerHTML = imgHtml('');
            return;
          }
          fileInput.click();
        });
        fileInput.addEventListener('change', async () => {
          const f = fileInput.files && fileInput.files[0];
          if (!f) return;
          try {
            r.image = await UI.imageToDataURL(f, 900, 0.72);
            el.querySelector('#re-img').innerHTML = imgHtml(r.image);
          } catch (err) {
            UI.toast('Could not read that image', 'err');
          }
          fileInput.value = '';
        });

        /* ---- categories ---- */
        el.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
          const c = b.dataset.cat;
          const i = r.cats.indexOf(c);
          if (i === -1) r.cats.push(c); else r.cats.splice(i, 1);
          b.classList.toggle('on', i === -1);
        }));

        /* ---- ingredients ---- */
        function drawIngs() {
          const box = el.querySelector('#re-ings');
          box.innerHTML = r.ingredients.length ? r.ingredients.map((i, idx) => {
            const n = Nutrition.scale(i.n100 || {}, i.grams);
            return `<div class="list-item" style="padding-left:var(--pad)">
              <div class="li-main">
                <div class="li-title">${App.esc(i.name)}</div>
                <div class="li-sub">${App.n(i.grams, 0)} g · ${App.int(n.kcal)} kcal</div>
              </div>
              <button class="icon-btn danger" type="button" data-rm-ing="${idx}" aria-label="Remove">${App.icon('trash')}</button>
            </div>`;
          }).join('') : '<p class="tiny muted" style="padding:14px var(--pad)">No ingredients yet — nutrition is calculated from what you add here.</p>';

          box.querySelectorAll('[data-rm-ing]').forEach(b => b.addEventListener('click', () => {
            r.ingredients.splice(Number(b.dataset.rmIng), 1);
            drawIngs(); drawNutri();
          }));
        }

        function drawNutri() {
          const rn = App.recipeNutrition(r);
          const servings = Math.max(1, Number(el.querySelector('#re-serv').value) || 1);
          const per = Nutrition.mul(rn.total, 1 / servings);
          el.querySelector('#re-nutri').innerHTML = `
            <div class="card-head"><h2>Calculated</h2><span class="sub">per serving</span></div>
            <div class="between">
              <div><div class="num" style="font-size:26px;font-weight:750;line-height:1">${App.int(per.kcal)}</div>
                   <div class="tiny muted">kcal</div></div>
              <div class="tiny muted" style="text-align:right;line-height:1.6">
                ${UI.macroLine(per)}<br>Fibre ${App.n(per.fiber, 1)}g<br>
                Total batch ${App.int(rn.total.kcal)} kcal · ${App.n(rn.grams, 0)} g</div>
            </div>`;
        }

        el.querySelector('#re-serv').addEventListener('input', drawNutri);

        el.querySelector('#re-add-ing').addEventListener('click', () => {
          FoodSheet.open({
            mode: 'pick',
            title: 'Add ingredient',
            allowRecipes: false,
            onPick(entry) {
              const src = entry.refId ? App.food(entry.refId) : null;
              r.ingredients.push({
                refId: entry.refId,
                name: entry.name,
                grams: entry.grams || 0,
                qty: entry.qty,
                servingLabel: entry.servingLabel,
                n100: src ? src.n : (entry.grams ? Nutrition.mul(entry.n, 100 / entry.grams) : entry.n)
              });
              drawIngs(); drawNutri();
            }
          });
        });

        /* ---- instructions ---- */
        function drawSteps() {
          const box = el.querySelector('#re-steps');
          box.innerHTML = r.instructions.map((step, i) => `
            <div class="row" style="padding:10px var(--pad);gap:10px;border-bottom:1px solid var(--line)">
              <span style="flex:none;width:24px;height:24px;border-radius:50%;background:var(--card-2);
                           display:grid;place-items:center;font-size:12px;font-weight:700;color:var(--tx-2)">${i + 1}</span>
              <textarea data-step="${i}" rows="1" placeholder="Describe this step"
                        style="min-height:44px;padding:10px 12px">${App.esc(step)}</textarea>
              <button class="icon-btn danger" type="button" data-rm-step="${i}" aria-label="Remove step">${App.icon('trash')}</button>
            </div>`).join('');

          box.querySelectorAll('[data-step]').forEach(ta => {
            ta.addEventListener('input', () => { r.instructions[Number(ta.dataset.step)] = ta.value; });
          });
          box.querySelectorAll('[data-rm-step]').forEach(b => b.addEventListener('click', () => {
            r.instructions.splice(Number(b.dataset.rmStep), 1);
            if (!r.instructions.length) r.instructions = [''];
            drawSteps();
          }));
        }
        el.querySelector('#re-add-step').addEventListener('click', () => { r.instructions.push(''); drawSteps(); });

        drawIngs(); drawNutri(); drawSteps();

        /* ---- save / delete ---- */
        el.querySelector('#re-save').addEventListener('click', async () => {
          const name = el.querySelector('#re-name').value.trim();
          if (!name) return UI.toast('Give the recipe a name', 'err');
          if (!r.ingredients.length) return UI.toast('Add at least one ingredient', 'err');

          r.name = name;
          r.servings = Math.max(1, Number(el.querySelector('#re-serv').value) || 1);
          r.minutes = Math.max(0, Number(el.querySelector('#re-min').value) || 0);
          r.instructions = r.instructions.map(x => x.trim()).filter(Boolean);
          r.updated = Date.now();

          await Data.saveRecipe(r);
          App.state.recipesCache = await Data.recipes();
          App.haptic('ok');
          UI.toast('Recipe saved', 'ok');
          s.close();
          App.refresh();
        });

        const del = el.querySelector('#re-del');
        if (del) del.addEventListener('click', async () => {
          const ok = await UI.confirm({
            title: 'Delete recipe?', message: `“${r.name}” will be removed.`,
            confirmLabel: 'Delete', danger: true
          });
          if (!ok) return;
          await Data.deleteRecipe(r.id);
          App.state.recipesCache = await Data.recipes();
          UI.toast('Recipe deleted');
          s.close(); App.refresh();
        });
      }
    });
  }

  function imgHtml(src) {
    return src
      ? `<div style="position:relative">
           <img class="hero-img" src="${src}" alt="">
           <button class="recipe-fav" type="button" data-rm-img style="top:10px;right:10px">${App.icon('trash')}</button>
         </div>`
      : `<div class="hero-img" style="display:grid;place-items:center;color:var(--tx-3);border:1.5px dashed var(--line-strong)">
           <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
             ${App.icon('camera')}<span class="tiny">Add a photo</span></div>
         </div>`;
  }

  App.recipeEditor = editor;

  /* ================================================== starter recipes */

  /** A small starter library so the app is useful from minute one. */
  App.starterRecipes = function () {
    const mk = (name, servings, minutes, cats, ings, steps) => {
      const ingredients = ings.map(([id, grams]) => {
        const f = FoodDB.byId(id);
        return f ? { refId: f.id, name: f.name, grams, qty: null, servingLabel: '', n100: f.n } : null;
      }).filter(Boolean);
      return {
        id: App.uid('r'), name, servings, minutes, cats, image: '',
        ingredients, instructions: steps, created: Date.now(), updated: Date.now(), starter: true
      };
    };

    return [
      mk('High-protein overnight oats', 1, 5, ['Breakfast', 'High protein', 'Vegetarian'],
        [['f-oats-rolled-dry', 60], ['f-greek-yogurt-plain-0', 150], ['f-milk-semi-skimmed-2', 100],
         ['f-blueberries', 60], ['f-chia-seeds', 12], ['f-honey', 10]],
        ['Stir the oats, yogurt, milk and chia together in a jar.',
         'Fold through the honey, then top with the blueberries.',
         'Cover and refrigerate overnight — it keeps for two days.']),

      mk('Chicken, rice and broccoli bowl', 2, 25, ['Lunch', 'Dinner', 'High protein', 'Muscle gain'],
        [['f-chicken-breast-raw', 300], ['f-rice-brown-cooked', 320], ['f-broccoli-raw', 200],
         ['f-olive-oil', 14], ['f-soy-sauce', 16], ['f-garlic-raw', 6]],
        ['Season the chicken and sear in half the olive oil, 5–6 minutes per side, until cooked through.',
         'Steam the broccoli for 4 minutes so it keeps some bite.',
         'Toss the cooked rice with the remaining oil, crushed garlic and soy sauce.',
         'Slice the chicken and build the bowls.']),

      mk('Salmon with sweet potato and greens', 2, 35, ['Dinner', 'High protein'],
        [['f-salmon-atlantic-cooked', 280], ['f-sweet-potato-baked', 340], ['f-spinach-raw', 120],
         ['f-olive-oil', 14], ['f-garlic-raw', 6]],
        ['Roast the sweet potato wedges at 200°C for 25–30 minutes.',
         'Pan-fry the salmon skin-side down for 4 minutes, then 2 minutes on the flesh side.',
         'Wilt the spinach with the garlic in the same pan.',
         'Plate and finish with a squeeze of lemon if you have one.']),

      mk('Lentil and chickpea curry', 4, 40, ['Dinner', 'Vegan', 'Vegetarian', 'Weight loss'],
        [['f-lentils-cooked', 400], ['f-chickpeas-cooked', 300], ['f-tomato-passata', 400],
         ['f-onion-raw', 150], ['f-garlic-raw', 12], ['f-olive-oil', 20], ['f-spinach-raw', 100]],
        ['Soften the onion in the oil for 8 minutes, then add the garlic and your curry spices.',
         'Add the passata and simmer for 10 minutes to thicken.',
         'Stir through the lentils and chickpeas and cook another 10 minutes.',
         'Fold in the spinach right at the end so it just wilts.']),

      mk('Greek yogurt protein pot', 1, 3, ['Snacks', 'High protein', 'Low calorie', 'Vegetarian'],
        [['f-greek-yogurt-plain-0', 200], ['f-raspberries', 80], ['f-almonds', 15], ['f-honey', 7]],
        ['Spoon the yogurt into a bowl.',
         'Top with raspberries, chopped almonds and a drizzle of honey.']),

      mk('Egg and avocado toast', 1, 10, ['Breakfast', 'Vegetarian'],
        [['f-egg-whole-raw', 100], ['f-bread-wholemeal', 64], ['f-avocado', 68], ['f-tomato-raw', 60]],
        ['Toast the bread.', 'Fry or poach the eggs to your liking.',
         'Mash the avocado over the toast, add sliced tomato, then the eggs. Season well.'])
    ];
  };
})();
