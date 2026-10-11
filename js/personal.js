/* ==========================================================================
   personal.js — what a food means for *you*

   The health profile (Settings → Health profile) holds allergens, diet,
   things to avoid, pregnancy and medicines. `check(food, grams)` turns that
   into warnings for a product page, a scan or the Log button:

     stop     contains an allergen you avoid, breaks your diet, or is a
              well-documented medicine interaction (grapefruit + statins)
     caution  worth knowing: timing, amounts, intake to keep steady
     info     reassurance or a nudge ("not confirmed vegan")

   Packaged products use their declared allergens and ingredient analysis;
   whole foods are matched by name and marked "likely". This is a safety net,
   not a substitute for reading the label or asking a pharmacist.
   ========================================================================== */
(function () {
  'use strict';

  const SOURCES = {
    'bfr-pregnancy': 'German Federal Institute for Risk Assessment, BfR (2017). Consumer tips: protection against food-borne infections during pregnancy (listeria, toxoplasma).',
    'efsa-retinol': 'EFSA Scientific Committee on Food (2006). Tolerable upper intake level of preformed vitamin A (retinol): 3,000 µg/day.',
    'efsa-mercury': 'EFSA CONTAM Panel (2012). Risk for public health related to mercury and methylmercury in food. EFSA Journal 10(12):2985.',
    'raikkonen-2017': 'Räikkönen K et al. (2017). Maternal licorice consumption during pregnancy and pubertal, cognitive, and psychiatric outcomes in children. Am J Epidemiol 185(5):317–328.',
    'dge-alcohol-2024': 'German Nutrition Society, DGE (2024). Position statement on alcohol consumption: no amount is safe.',
    'benvenga-2008': 'Benvenga S et al. (2008). Altered intestinal absorption of L-thyroxine caused by coffee. Thyroid 18(3):293–301.',
    'gillman-2018': 'Gillman PK (2018). A reassessment of the safety profile of monoamine oxidase inhibitors: elucidating tired old tyramine myths. J Neural Transm 125(11):1707–1717.',
    'raebel-2012': 'Raebel MA (2012). Hyperkalemia associated with use of angiotensin-converting enzyme inhibitors and angiotensin receptor blockers. Cardiovasc Ther 30(3):e156–e166.',
    'neuvonen-1976': 'Neuvonen PJ (1976). Interactions with the absorption of tetracyclines. Drugs 11(1):45–54.',
    'hallberg-1991': 'Hallberg L et al. (1991). Calcium: effect of different amounts on nonheme- and heme-iron absorption in humans. Am J Clin Nutr 53(1):112–119.'
  };

  const MEDICINES = [
    { k: 'thyroid', label: 'Thyroid hormone (levothyroxine, L-Thyroxin)' },
    { k: 'vka', label: 'Blood thinner: warfarin or phenprocoumon (Marcumar)' },
    { k: 'statin', label: 'Statin (simvastatin, atorvastatin, lovastatin)' },
    { k: 'ccb', label: 'Calcium-channel blocker (amlodipine, felodipine, nifedipine)' },
    { k: 'acei', label: 'ACE inhibitor, sartan or spironolactone' },
    { k: 'maoi', label: 'MAO inhibitor (tranylcypromine, moclobemide, high-dose selegiline)' },
    { k: 'diabetes', label: 'Insulin or sulfonylurea (glibenclamide, glimepiride)' },
    { k: 'antibiotic', label: 'Tetracycline or quinolone antibiotic (doxycycline, ciprofloxacin)' },
    { k: 'iron', label: 'Iron tablets' }
  ];
  const DIETS = [['any', 'Everything'], ['pescatarian', 'Pescatarian'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan']];

  /* Name patterns for whole foods (and products without allergen data). */
  const ALLERGEN_RX = {
    gluten: /wheat|weizen|\bbread|brot\b|brötchen|pasta|noodle|nudel|spätzle|couscous|bulgur|barley|gerste|\brye\b|roggen|spelt|dinkel|\boats?\b|hafer|flour|mehl|cracker|biscuit|keks|\bcake|kuchen|pizza|\bbeer|\bbier|croissant|bagel|pretzel|brezel|schnitzel|breaded|paniert|muesli|müsli|granola|cereal|semolina|grieß|seitan|maultaschen|gnocchi|\bwrap|lebkuchen|gingerbread|zwieback|rusk|pumpernickel|baguette|ciabatta|doughnut|muffin|brownie|cookie|waffle|pancake|crepe|lasagne|ramen|udon|soy sauce/,
    milk: /\bmilk|milch|cheese|käse|kase\b|quark|yogh?urt|joghurt|skyr|kefir|cream\b|sahne|\bbutter\b|buttermilk|buttermilch|whey|casein|molke|ghee|schmand|mozzarella|parmesan|feta|gouda|emmental|camembert|ricotta|mascarpone|ice cream|\beis\b|latte|cappuccino|milk chocolate|vollmilch|white chocolate|nuss-nougat|nutella|pudding|tzatziki|ranch|cheesecake|lasagne|macaroni cheese|quiche|pizza/,
    eggs: /\beggs?\b|\beier\b|omelet|mayonnaise|\bmayo\b|spätzle|egg noodle|pancake|waffle|crepe|quiche|meringue|tiramisu|brownie|muffin|cake\b|kuchen|carbonara|aioli/,
    fish: /\bfish|fisch|salmon|lachs|tuna|thunfisch|\bcod\b|kabeljau|herring|hering|mackerel|makrele|sardine|anchov|sardelle|trout|forelle|pollock|seelachs|tilapia|haddock|sea bass|caesar|sushi|surimi|worcester/,
    crustaceans: /shrimp|prawn|garnele|\bcrab|krabbe|lobster|hummer|krebs|scampi|surimi/,
    molluscs: /mussel|muschel|squid|calamari|tintenfisch|octopus|oyster|auster|scallop|jakobsmuschel/,
    peanuts: /peanut|erdnuss/,
    nuts: /almond|mandel|hazelnut|haselnuss|walnut|walnuss|cashew|pistachio|pistazie|pecan|macadamia|brazil nut|paranuss|nougat|marzipan|praline|nutella|pesto|trail mix|studentenfutter|\bnuts\b|nüsse|nussmix|granola/,
    soybeans: /\bsoy|soja|tofu|tempeh|edamame|\bmiso/,
    celery: /celery|sellerie|celeriac/,
    mustard: /mustard|\bsenf/,
    'sesame-seeds': /sesame|sesam|tahini|hummus|falafel/,
    'sulphur-dioxide-and-sulphites': /\bwine\b|\bwein|\bsekt|prosecco|glühwein|dried apricot|apricots?, dried|raisin|rosine|dried fruit|trockenfr/,
    lupin: /lupin/
  };
  const MEAT_RX = /\bmeat|fleisch|beef|\brind|pork|schwein|chicken|hähnchen|huhn|turkey|pute|lamb|lamm|veal|kalb|duck|ente|goose|gans|bacon|speck|\bham\b|schinken|salami|wurst|sausage|chorizo|pepperoni|mortadella|leberk|hackfleisch|mince|steak|schnitzel|gelatin|gelatine|kebab|döner|doner|gyros|jerky|burger(?!.*(vegan|veggie|plant))|nugget|currywurst|frankfurter|bratwurst|liver|leber/;
  const FISH_RX = /\bfish|fisch|salmon|lachs|tuna|thunfisch|\bcod\b|herring|hering|mackerel|makrele|sardine|anchov|trout|forelle|shrimp|prawn|garnele|mussel|muschel|squid|calamari|octopus|crab|krabbe|scallop|sushi|surimi/;
  const ANIMAL_RX = /honey|honig|\begg|\beier|milk|milch|cheese|käse|quark|yogh?urt|joghurt|skyr|butter\b|cream\b|sahne|whey|casein|ghee|mayonnaise/;
  const NON_VEG_CODES = { '120': 'carmine (E120)', '428': 'gelatine (E428)', '441': 'gelatine (E441)', '542': 'bone phosphate (E542)', '904': 'shellac (E904)', '901': 'beeswax (E901)', '913': 'lanolin (E913)', '1105': 'egg lysozyme (E1105)' };
  const NON_VEGETARIAN_CODES = { '120': 1, '428': 1, '441': 1, '542': 1 };

  const PREG_LISTERIA = /rohmilch|raw milk|camembert|brie|gorgonzola|blue cheese|roquefort|smoked salmon|räucherlachs|graved|gravlax|\bmett\b|tartar|tatar|carpaccio|sushi|sashimi|rohwurst|salami|teewurst|parma|prosciutto|serrano|schinken, roh|tiramisu|raw egg/;
  const PREG_MERCURY = /swordfish|schwertfisch|\bshark|\bhai\b|king mackerel|marlin|tuna steak|thunfischsteak|pike|hecht/;
  const TYRAMINE = /parmesan|cheddar|gouda|emmental|gorgonzola|blue cheese|roquefort|camembert|brie|aged cheese|salami|chorizo|pepperoni|soy sauce|sojasauce|\bmiso|tempeh|natto|sauerkraut|kimchi|marmite|vegemite|hefeextrakt|yeast extract|broad bean|fava|draft beer|fassbier/;
  const GRAPEFRUIT = /grapefruit|pampelmuse|pomelo|bitter orange|seville orange/;
  const SALT_SUBSTITUTE = /potassium chloride|kaliumchlorid|salt substitute|diätsalz|diaetsalz|lo salt/;

  const ALLERGEN_NAMES = () => (window.OffMap ? OffMap.ALLERGENS : []);

  function profile() {
    const s = App.state.settings || {};
    return Object.assign({ allergens: [], diet: 'any', avoidAlcohol: false, avoidCaffeine: false,
      pregnant: false, breastfeeding: false, meds: [] }, s.health || {});
  }
  const isSet = h => !!(h.allergens.length || h.diet !== 'any' || h.avoidAlcohol || h.avoidCaffeine ||
    h.pregnant || h.breastfeeding || h.meds.length);

  /** Which EU allergens this food contains: { declared: [keys], likely: [keys], known }. */
  function allergensOf(food) {
    const list = ALLERGEN_NAMES();
    const declared = [];
    if (food.allergens > 0) list.forEach(([k], i) => { if (food.allergens & (1 << i)) declared.push(k); });
    const text = [food.name, food.search, food.ingredientsText].filter(Boolean).join(' ').toLowerCase();
    const likely = [];
    // Whole foods, and products whose label data has no allergen list, are matched by name.
    const knowsLabel = food.allergens > 0 || (food.ingredientsN || 0) > 0;
    if (!knowsLabel) Object.keys(ALLERGEN_RX).forEach(k => { if (ALLERGEN_RX[k].test(text)) likely.push(k); });
    // Sulphite additives (E220–E228) are an allergen whatever the list says.
    if ((food.additiveCodes || []).some(c => /^22[0-8]/.test(String(c))) && declared.indexOf('sulphur-dioxide-and-sulphites') === -1) {
      declared.push('sulphur-dioxide-and-sulphites');
    }
    return { declared, likely, known: knowsLabel };
  }
  const allergenLabel = k => { const a = ALLERGEN_NAMES().find(x => x[0] === k); return a ? a[1] : k; };

  /**
   * Warnings for `grams` of `food` against the health profile.
   * Returns [{ level: 'stop'|'caution'|'info', kind, title, text, src[] }], most severe first.
   */
  function check(food, grams, health) {
    const h = health || profile();
    if (!food || !food.n || !isSet(h)) return [];
    const g = grams > 0 ? grams : 100;
    const n = food.n;
    const amt = k => (Number(n[k]) || 0) * g / 100;
    const F = (window.OffMap && OffMap.FLAG) || {};
    const flags = typeof food.flags === 'number' ? food.flags : 0;
    const text = [food.name, food.search, food.ingredientsText].filter(Boolean).join(' ').toLowerCase();
    const codes = (food.additiveCodes || []).map(c => String(c).toLowerCase().replace(/^e/, ''));
    const supplement = food.kind === 'supplement';
    const out = [];
    const add = (level, kind, title, txt, src) => out.push({ level, kind, title, text: txt, src: src || [] });

    /* ---- allergens ---- */
    if (h.allergens.length && !supplement) {
      const a = allergensOf(food);
      h.allergens.forEach(k => {
        if (a.declared.indexOf(k) !== -1) add('stop', 'allergen', 'Contains ' + allergenLabel(k).toLowerCase(), 'Declared on the label — it is on your allergen list.');
        else if (a.likely.indexOf(k) !== -1) add('stop', 'allergen', 'Likely contains ' + allergenLabel(k).toLowerCase(), 'Foods like this usually contain it. Check the packet to be sure.');
      });
      if (!a.known && !food.builtin && !a.likely.some(k => h.allergens.indexOf(k) !== -1)) {
        add('info', 'allergen', 'No allergen list for this product', 'Open Food Facts has no allergen data for it yet — read the packet before eating.');
      }
    }

    /* ---- diet ---- */
    const meatCat = food.cat === 'Meat & Poultry', fishCat = food.cat === 'Fish & Seafood';
    const meat = meatCat || (!fishCat && MEAT_RX.test(text) && !/vegan|veggie|vegetar|plant-based|pflanzlich|fleischfrei|meat-free/.test(text));
    const fish = fishCat || FISH_RX.test(text);
    if (h.diet === 'vegan' && !food.vegan && !(flags & F.VEGAN)) {
      const a = allergensOf(food);
      const animalAllergen = a.declared.concat(a.likely).find(k => ['milk', 'eggs', 'fish', 'crustaceans', 'molluscs'].indexOf(k) !== -1);
      const code = codes.find(c => NON_VEG_CODES[c]);
      if (meat || fish || food.cat === 'Dairy & Eggs' || animalAllergen || code || (food.builtin && ANIMAL_RX.test(text))) {
        add('stop', 'diet', 'Not vegan', code ? 'Contains ' + NON_VEG_CODES[code] + '.' : animalAllergen ? 'Contains ' + allergenLabel(animalAllergen).toLowerCase() + '.' : 'Contains animal products.');
      } else if (!supplement && !food.builtin) {   // whole plant foods are simply vegan
        add('info', 'diet', 'Not confirmed vegan', 'Nothing animal-based was found, but the product is not labelled vegan.');
      }
    }
    if (h.diet === 'vegetarian' && !food.vegetarian && !(flags & F.VEGETARIAN)) {
      const code = codes.find(c => NON_VEGETARIAN_CODES[c]);
      if (meat || fish || code) add('stop', 'diet', 'Not vegetarian', code ? 'Contains ' + NON_VEG_CODES[code] + '.' : 'Contains meat or fish.');
    }
    if (h.diet === 'pescatarian' && !food.vegetarian && !(flags & F.VEGETARIAN)) {
      const code = codes.find(c => c === '428' || c === '441' || c === '542');
      if (meat || code) add('stop', 'diet', 'Contains meat', code ? 'Contains ' + NON_VEG_CODES[code] + '.' : 'This is not fish or vegetarian.');
    }

    /* ---- things to avoid ---- */
    const alc = amt('alcohol');
    if (h.avoidAlcohol && (alc > 0.05 || (flags & F.ALCOHOL))) add('stop', 'avoid', 'Contains alcohol', alc > 0.05 ? Math.round(alc * 10) / 10 + ' g of alcohol in this portion.' : 'Alcohol is in the ingredient list.');
    const caf = amt('caffeine');
    if (h.avoidCaffeine && (caf >= 5 || (flags & F.CAFFEINE))) add('stop', 'avoid', 'Contains caffeine', caf >= 5 ? Math.round(caf) + ' mg of caffeine in this portion.' : 'Coffee, tea, guarana or caffeine is in the ingredients.');

    /* ---- pregnancy and breastfeeding ---- */
    if (h.pregnant) {
      if (alc > 0.05 || (flags & F.ALCOHOL)) add('stop', 'pregnancy', 'Alcohol in pregnancy', 'There is no known safe amount of alcohol during pregnancy.', ['dge-alcohol-2024']);
      if (caf >= 100) add('caution', 'pregnancy', Math.round(caf) + ' mg caffeine', 'In pregnancy, EFSA advises at most 200 mg of caffeine a day from all sources.', ['efsa-caffeine']);
      if (amt('glycyrrhizin') > 0 || (flags & F.LICORICE)) add('caution', 'pregnancy', 'Licorice in pregnancy', 'Large amounts of licorice in pregnancy were linked to earlier birth and to effects on the child’s development; keep it occasional.', ['raikkonen-2017']);
      if (/\bliver\b|leber(?!käse)/.test(text) || amt('vitA') >= 1500) add('stop', 'pregnancy', 'Very high vitamin A', 'Liver and large doses of retinol can harm the baby’s development; the upper limit is 3,000 µg a day.', ['efsa-retinol']);
      if (PREG_LISTERIA.test(text)) add('caution', 'pregnancy', 'Raw or cold-smoked food', 'Raw-milk and soft mould cheeses, raw or cured meat, raw or cold-smoked fish and raw egg can carry listeria or toxoplasma. Heat it until steaming, or choose another product.', ['bfr-pregnancy']);
      if (PREG_MERCURY.test(text)) add('caution', 'pregnancy', 'Large predatory fish', 'Swordfish, shark, marlin, pike and fresh tuna can be high in mercury; choose salmon, herring or pollock instead.', ['efsa-mercury']);
      if (/ashwagandha|withania/.test(text) || (flags & F.ADAPTOGEN)) add('stop', 'pregnancy', 'Herbal extract', 'Ashwagandha and similar herbal extracts are not considered safe in pregnancy.', ['livertox-ashwagandha']);
    } else if (h.breastfeeding) {
      if (alc > 0.05) add('caution', 'pregnancy', 'Alcohol while breastfeeding', 'Alcohol passes into breast milk; wait at least 2 hours per drink before feeding.', ['dge-alcohol-2024']);
      if (caf >= 200) add('caution', 'pregnancy', Math.round(caf) + ' mg caffeine', 'While breastfeeding, EFSA considers up to 200 mg in one go safe for the baby.', ['efsa-caffeine']);
    }

    /* ---- medicines ---- */
    const med = k => h.meds.indexOf(k) !== -1;
    const grapefruit = GRAPEFRUIT.test(text);
    if (med('statin') && grapefruit) add('stop', 'medicine', 'Grapefruit and your statin', 'Grapefruit blocks the enzyme (CYP3A4) that breaks down simvastatin, atorvastatin and lovastatin, raising the risk of muscle damage. Avoid it.', ['bailey-2013']);
    if (med('ccb') && grapefruit) add('stop', 'medicine', 'Grapefruit and your blood-pressure tablet', 'Grapefruit can multiply blood levels of felodipine, nifedipine and similar drugs, dropping blood pressure too far.', ['bailey-2013']);
    if (med('vka')) {
      const vk = amt('vitK');
      if (vk >= 60) add('caution', 'medicine', Math.round(vk) + ' µg vitamin K', 'Vitamin K counteracts warfarin and phenprocoumon. You do not need to avoid it — keep your daily intake steady so your INR stays stable.', ['holbrook-2005']);
      if (alc >= 20) add('caution', 'medicine', 'Alcohol with a blood thinner', 'More than a drink or two changes how warfarin works and raises bleeding risk.', ['holbrook-2005']);
    }
    if (med('thyroid')) {
      const why = [];
      if (amt('isoflavones') >= 5 || (flags & F.SOY)) why.push('soy');
      if (caf >= 30 || /coffee|kaffee|espresso/.test(text)) why.push('coffee');
      if (amt('ca') >= 200) why.push('calcium');
      if (amt('fe') >= 3) why.push('iron');
      if (amt('fiber') >= 8) why.push('lots of fibre');
      if (why.length) add('caution', 'medicine', 'Timing with your thyroid tablet', 'This contains ' + why.join(', ') + ', which reduces levothyroxine absorption. Take the tablet 30–60 minutes before breakfast, and calcium, iron or soy about 4 hours apart.', ['benvenga-2008', 'messina-2006']);
    }
    if (med('acei')) {
      if (SALT_SUBSTITUTE.test(text)) add('stop', 'medicine', 'Potassium salt substitute', 'With an ACE inhibitor, sartan or spironolactone, potassium-based salt substitutes can push blood potassium dangerously high.', ['raebel-2012']);
      else if (amt('k') >= 600) add('caution', 'medicine', Math.round(amt('k')) + ' mg potassium', 'Your medicine keeps potassium in the body. Normal food is usually fine, but very potassium-rich portions add up — your doctor checks your levels.', ['raebel-2012']);
    }
    if (med('maoi') && TYRAMINE.test(text)) add('stop', 'medicine', 'Tyramine and your MAO inhibitor', 'Aged cheese, cured sausage, fermented soy, sauerkraut and yeast extract are rich in tyramine, which can trigger a dangerous rise in blood pressure with MAO inhibitors.', ['gillman-2018']);
    if (med('diabetes')) {
      const gl = amt('gl');
      if (gl >= 20) add('caution', 'medicine', 'Big glucose load (GL ' + Math.round(gl) + ')', 'Check your blood sugar and dose for this one; pairing it with protein or fibre softens the rise.', ['gi-tables']);
      if (alc >= 10) add('caution', 'medicine', 'Alcohol with insulin or sulfonylureas', 'Alcohol blocks the liver’s glucose release, so blood sugar can fall hours later. Eat with it and check before bed.', ['iarc-alcohol']);
    }
    if (med('antibiotic') && (amt('ca') >= 100 || amt('fe') >= 2 || amt('mg') >= 100 || (food.cat === 'Dairy & Eggs' && !/egg/i.test(food.name || '')))) {
      add('caution', 'medicine', 'Dairy, calcium or iron with your antibiotic', 'Calcium, iron and magnesium bind tetracyclines and quinolones so less is absorbed. Take the antibiotic 2 hours before or 4–6 hours after.', ['neuvonen-1976']);
    }
    if (med('iron') && (caf >= 30 || /coffee|kaffee|\btea\b|\btee\b/.test(text) || amt('ca') >= 200)) {
      add('info', 'medicine', 'Iron tablet timing', 'Coffee, tea and calcium-rich food cut iron absorption. Take the iron tablet 1–2 hours apart, ideally with vitamin C.', ['hallberg-1991']);
    }

    const RANK = { stop: 0, caution: 1, info: 2 };
    return out.sort((a, b) => RANK[a.level] - RANK[b.level]);
  }

  /** Banner HTML for the product page (empty string when nothing to say). */
  function bannerHtml(list) {
    if (!list.length) return '';
    const icon = { stop: 'warn', caution: 'info', info: 'check' };
    return `<div class="you-card">
      <div class="you-head">${App.icon('user')}<b>For you</b></div>
      ${list.map(w => `<div class="you-row lvl-${w.level}">
        <span class="you-ic">${App.icon(icon[w.level])}</span>
        <span><b>${App.esc(w.title)}</b><small>${App.esc(w.text)}</small></span>
      </div>`).join('')}
    </div>`;
  }

  /** "Gluten, Milk · Vegetarian · 2 medicines", or '' when nothing is set. */
  function summary(health) {
    const h = health || profile();
    const names = Object.fromEntries(ALLERGEN_NAMES());
    const parts = [];
    if (h.allergens.length) parts.push(h.allergens.map(k => names[k] || k).join(', '));
    if (h.diet !== 'any') parts.push((DIETS.find(d => d[0] === h.diet) || [0, h.diet])[1]);
    if (h.pregnant) parts.push('Pregnant');
    else if (h.breastfeeding) parts.push('Breastfeeding');
    if (h.avoidAlcohol) parts.push('No alcohol');
    if (h.avoidCaffeine) parts.push('No caffeine');
    if (h.meds.length) parts.push(h.meds.length === 1 ? '1 medicine' : h.meds.length + ' medicines');
    return parts.join(' · ');
  }

  /* ------------------------------------------------------------- editor */
  function editor() {
    const h = profile();
    const s = UI.sheet({
      full: true,
      title: 'Health profile',
      subtitle: 'Personal warnings when you scan',
      body: `
        <p class="tiny muted mb12" style="line-height:1.55">Eaty checks every product against this and warns you on
          the product page, when you scan, and before you log. It stays on this device.</p>

        <div class="section-title mb8">Allergens and intolerances</div>
        <div class="card mb14"><div class="hl" id="hp-allergens">${ALLERGEN_NAMES().map(([k, label]) =>
          `<button type="button" class="chip${h.allergens.indexOf(k) !== -1 ? ' on' : ''}" data-allergen="${k}">${App.esc(label)}</button>`).join('')}</div></div>

        <div class="section-title mb8">Diet</div>
        <div class="segmented mb14" id="hp-diet">${DIETS.map(([k, l]) =>
          `<button type="button" data-diet="${k}" class="${h.diet === k ? 'on' : ''}">${l}</button>`).join('')}</div>

        <div class="card flush mb14">
          ${switchRow('avoidAlcohol', 'Avoid alcohol', 'Warn when a product contains alcohol', h.avoidAlcohol)}
          ${switchRow('avoidCaffeine', 'Avoid caffeine', 'Warn for coffee, tea, cola, energy drinks, guarana', h.avoidCaffeine)}
          ${switchRow('pregnant', 'Pregnant', 'Alcohol, caffeine, listeria, mercury, vitamin A, herbal extracts', h.pregnant)}
          ${switchRow('breastfeeding', 'Breastfeeding', 'Alcohol and caffeine timing', h.breastfeeding)}
        </div>

        <div class="section-title mb8">Medicines with food interactions</div>
        <div class="card flush mb14">${MEDICINES.map(m => switchRow('med:' + m.k, m.label, '', h.meds.indexOf(m.k) !== -1)).join('')}</div>

        <p class="disclaimer">${App.icon('info')}<span>A safety net, not medical advice. Always read the label, and ask your
          pharmacist about your own medicines.</span></p>`,
      footer: `<button class="btn primary block" type="button" id="hp-save">${App.icon('check')}Save profile</button>`,
      onOpen(el) {
        el.querySelectorAll('[data-allergen]').forEach(b => b.addEventListener('click', () => { b.classList.toggle('on'); App.haptic('light'); }));
        el.querySelectorAll('[data-diet]').forEach(b => b.addEventListener('click', () => {
          el.querySelectorAll('[data-diet]').forEach(x => x.classList.toggle('on', x === b));
        }));
        el.querySelectorAll('.switch[data-key]').forEach(sw => sw.addEventListener('click', () => {
          sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true'));
          App.haptic('light');
        }));
        el.querySelector('#hp-save').addEventListener('click', async () => {
          const on = k => { const sw = el.querySelector(`.switch[data-key="${k}"]`); return sw && sw.getAttribute('aria-checked') === 'true'; };
          const health = {
            allergens: Array.from(el.querySelectorAll('[data-allergen].on')).map(b => b.dataset.allergen),
            diet: (el.querySelector('[data-diet].on') || {}).dataset ? el.querySelector('[data-diet].on').dataset.diet : 'any',
            avoidAlcohol: on('avoidAlcohol'), avoidCaffeine: on('avoidCaffeine'),
            pregnant: on('pregnant'), breastfeeding: on('breastfeeding'),
            meds: MEDICINES.filter(m => on('med:' + m.k)).map(m => m.k)
          };
          App.state.settings = await Data.saveSettings({ health });
          App.haptic('ok');
          UI.toast('Health profile saved', 'ok');
          s.close();
          App.refresh();
        });
      }
    });
    return s;
  }
  function switchRow(key, title, sub, on) {
    return `<div class="switch-row"><div class="sr-main"><b>${App.esc(title)}</b>${sub ? `<small>${App.esc(sub)}</small>` : ''}</div>
      <button class="switch" type="button" role="switch" data-key="${key}" aria-checked="${!!on}" aria-label="${App.esc(title)}"></button></div>`;
  }

  if (window.Body) Object.assign(Body.SOURCES, SOURCES);
  window.Personal = { profile, isSet, summary, check, allergensOf, bannerHtml, editor, MEDICINES, DIETS, SOURCES };
})();
