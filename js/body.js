/* ==========================================================================
   body.js — what a food does to your physiology

   Turns a food (or a whole day) into a list of effects on hormones, blood
   sugar, heart, gut, brain, sleep, thyroid and medicines. Every effect carries:

     tone      good | info | caution | warn
     evidence  strong   — consistent trials or meta-analyses, official bodies
               moderate — several studies, some trials, plausible mechanism
               limited  — one trial, animal work or mixed cohorts
     src       keys into SOURCES, so each claim can be checked

   This is education, not medical advice. Thresholds come from EFSA, WHO and the
   cited studies; amounts are per portion eaten (or per day for forDay).
   ========================================================================== */
(function () {
  'use strict';

  const SOURCES = {
    'efsa-caffeine': 'EFSA NDA Panel (2015). Scientific opinion on the safety of caffeine. EFSA Journal 13(5):4102.',
    'drake-2013': 'Drake C et al. (2013). Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. J Clin Sleep Med 9(11):1195–1200.',
    'lovallo-2005': 'Lovallo WR et al. (2005). Caffeine stimulation of cortisol secretion across the waking hours. Psychosom Med 67(5):734–739.',
    'gi-tables': 'Atkinson FS et al. (2021). International tables of glycemic index and glycemic load values 2021. Am J Clin Nutr 114(5):1625–1632.',
    'who-sugar': 'WHO (2015). Guideline: sugars intake for adults and children.',
    'stanhope-2009': 'Stanhope KL et al. (2009). Consuming fructose-sweetened beverages increases visceral adiposity and lipids and decreases insulin sensitivity. J Clin Invest 119(5):1322–1334.',
    'iarc-alcohol': 'IARC Monographs vol. 100E (2012). Consumption of alcoholic beverages — Group 1 carcinogen.',
    'ebrahim-2013': 'Ebrahim IO et al. (2013). Alcohol and sleep I: effects on normal sleep. Alcohol Clin Exp Res 37(4):539–549.',
    'sierksma-2004': 'Sierksma A et al. (2004). Effect of moderate alcohol consumption on plasma DHEAS, testosterone and estradiol. Alcohol Clin Exp Res 28(5):780–785.',
    'hamilton-reeves-2010': 'Hamilton-Reeves JM et al. (2010). Clinical studies show no effects of soy protein or isoflavones on reproductive hormones in men. Fertil Steril 94(3):997–1007.',
    'reed-2021': 'Reed KE et al. (2021). Neither soy nor isoflavone intake affects male reproductive hormones: an expanded and updated meta-analysis. Reprod Toxicol 100:60–67.',
    'scf-2003': 'Scientific Committee on Food (2003). Opinion on glycyrrhizinic acid and its ammonium salt (100 mg/day upper level).',
    'armanini-1999': 'Armanini D et al. (1999). Reduction of serum testosterone in men by licorice. N Engl J Med 341:1158.',
    'siervo-2013': 'Siervo M et al. (2013). Inorganic nitrate and beetroot juice supplementation reduces blood pressure in adults: a meta-analysis. J Nutr 143(6):818–826.',
    'efsa-fats': 'EFSA NDA Panel (2010). Dietary reference values for fats (250 mg EPA+DHA per day). EFSA Journal 8(3):1461.',
    'hall-2019': 'Hall KD et al. (2019). Ultra-processed diets cause excess calorie intake and weight gain: an inpatient randomized controlled trial. Cell Metab 30(1):67–77.',
    'suez-2022': 'Suez J et al. (2022). Personalized microbiome-driven effects of non-nutritive sweeteners on human glucose tolerance. Cell 185(18):3307–3328.',
    'chassaing-2022': 'Chassaing B et al. (2022). Randomized controlled-feeding study of dietary emulsifier carboxymethylcellulose. Gastroenterology 162(3):743–756.',
    'sellem-2023': 'Sellem L et al. (2023). Food additive emulsifiers and risk of cardiovascular disease in the NutriNet-Santé cohort. BMJ 382:e076058.',
    'iarc-meat': 'IARC Monographs vol. 114 (2018). Red meat and processed meat.',
    'wastyk-2021': 'Wastyk HC et al. (2021). Gut-microbiota-targeted diets modulate human immune status. Cell 184(16):4137–4153.',
    'ritz-2012': 'Ritz E et al. (2012). Phosphate additives in food — a health risk. Dtsch Arztebl Int 109(4):49–55.',
    'tucker-2006': 'Tucker KL et al. (2006). Colas, but not other carbonated beverages, are associated with low bone mineral density in older women. Am J Clin Nutr 84(4):936–942.',
    'reynolds-2019': 'Reynolds A et al. (2019). Carbohydrate quality and human health: systematic reviews and meta-analyses. Lancet 393:434–445.',
    'moore-2009': 'Moore DR et al. (2009). Ingested protein dose response of muscle and albumin protein synthesis after resistance exercise. Am J Clin Nutr 89(1):161–168.',
    'mensink-2016': 'Mensink RP (2016). Effects of saturated fatty acids on serum lipids and lipoproteins. World Health Organization.',
    'hooper-2020': 'Hooper L et al. (2020). Reduction in saturated fat intake for cardiovascular disease. Cochrane Database Syst Rev 5:CD011737.',
    'who-sodium': 'WHO (2012). Guideline: sodium intake for adults and children (< 2 g sodium / 5 g salt per day).',
    'mozaffarian-2006': 'Mozaffarian D et al. (2006). Trans fatty acids and cardiovascular disease. N Engl J Med 354:1601–1613.',
    'aburto-2013': 'Aburto NJ et al. (2013). Effect of increased potassium intake on cardiovascular risk factors and disease. BMJ 346:f1378.',
    'efsa-iodine': 'EFSA NDA Panel (2014). Dietary reference values for iodine (150 µg/day). EFSA Journal 12(5):3660.',
    'prasad-1996': 'Prasad AS et al. (1996). Zinc status and serum testosterone levels of healthy adults. Nutrition 12(5):344–348.',
    'efsa-vitd': 'EFSA NDA Panel (2016). Dietary reference values for vitamin D. EFSA Journal 14(10):4547.',
    'efsa-selenium': 'EFSA NDA Panel (2023). Scientific opinion on the tolerable upper intake level for selenium (255 µg/day). EFSA Journal 21(1):7704.',
    'holbrook-2005': 'Holbrook AM et al. (2005). Systematic overview of warfarin and its drug and food interactions. Arch Intern Med 165:1095–1106.',
    'bailey-2013': 'Bailey DG et al. (2013). Grapefruit–medication interactions: forbidden fruit or avoidable consequences? CMAJ 185(4):309–316.',
    'efsa-betaglucan': 'EFSA NDA Panel (2011). Health claim: oat and barley beta-glucan and lowering of blood LDL cholesterol. EFSA Journal 9(12):2470.',
    'farvid-2014': 'Farvid MS et al. (2014). Dietary linoleic acid and risk of coronary heart disease: a meta-analysis of prospective cohort studies. Circulation 130:1568–1578.',
    'sun-2015': 'Sun Y et al. (2015). Palm oil consumption increases LDL cholesterol compared with vegetable oils low in saturated fat. Am J Clin Nutr 101(6):1297–1308.',
    'witkowski-2023': 'Witkowski M et al. (2023). The artificial sweetener erythritol and cardiovascular event risk. Nat Med 29:710–718.',
    'efsa-tio2': 'EFSA FAF Panel (2021). Safety assessment of titanium dioxide (E171) as a food additive. EFSA Journal 19(5):6585.',
    'mccann-2007': 'McCann D et al. (2007). Food additives and hyperactive behaviour in 3-year-old and 8/9-year-old children. Lancet 370:1560–1567.',
    'batterham-2006': 'Batterham RL et al. (2006). Critical role for peptide YY in protein-mediated satiation and body-weight regulation. Cell Metab 4(3):223–233.'
  };

  const SYSTEMS = {
    hormones:  { label: 'Hormones',        icon: 'hormone' },
    sugar:     { label: 'Blood sugar',     icon: 'drop' },
    heart:     { label: 'Heart & vessels', icon: 'heart' },
    gut:       { label: 'Gut',             icon: 'gut' },
    brain:     { label: 'Brain & sleep',   icon: 'brain' },
    liver:     { label: 'Liver',           icon: 'liver' },
    muscle:    { label: 'Muscle',          icon: 'muscle' },
    bones:     { label: 'Bones',           icon: 'bone' },
    thyroid:   { label: 'Thyroid',         icon: 'thyroid' },
    cancer:    { label: 'Long-term risk',  icon: 'shield' },
    meds:      { label: 'Medicines',       icon: 'pill' }
  };

  const EVIDENCE = {
    strong: 'Strong evidence',
    moderate: 'Moderate evidence',
    limited: 'Limited evidence'
  };

  const TONE_RANK = { warn: 0, caution: 1, good: 2, info: 3 };

  const r0 = v => Math.round(v);
  const r1 = v => Math.round(v * 10) / 10;
  const fmt = (v, unit) => (v >= 10 ? r0(v) : r1(v)) + ' ' + unit;

  const EMULSIFIERS = { '466': 1, '433': 1, '435': 1, '436': 1, '407': 1, '407a': 1, '471': 1, '472e': 1, '473': 1, '475': 1, '476': 1, '481': 1 };
  const PHOSPHATES = /^(338|339|340|341|343|450|451|452)/;
  const AZO = { '102': 1, '104': 1, '110': 1, '122': 1, '124': 1, '129': 1 };
  const POLYOLS = { '420': 1, '421': 1, '953': 1, '965': 1, '966': 1, '967': 1, '968': 1 };
  const NITRITES = { '249': 1, '250': 1, '251': 1, '252': 1 };

  const PROCESSED_MEAT = /wurst|salami|schinken|\bham\b|bacon|speck|chorizo|mortadella|leberk|hot ?dog|frankfurter|wiener|pastrami|corned|pepperoni|jerky|aufschnitt|cervelat|mettwurst|kassler|kasseler/i;
  const RED_MEAT = /beef|\brind|pork|schwein|lamb|lamm|steak|veal|kalb|hackfleisch|mince|goulash|gulasch|venison|hirsch|wild/i;
  const FERMENTED = /kefir|joghurt|jogurt|yogurt|yoghurt|skyr|sauerkraut|kimchi|kombucha|miso|tempeh|buttermilch|buttermilk|ayran|lassi/i;

  function codeList(food) {
    return (food.additiveCodes || []).map(c => String(c).toLowerCase().replace(/^e/, ''));
  }
  function additiveNames(codes, pick) {
    const out = [];
    codes.forEach(c => {
      if (!pick(c)) return;
      const a = window.Additives && Additives.get(c);
      const label = a ? a.name + ' (' + a.e + ')' : 'E' + c.toUpperCase();
      if (out.indexOf(label) === -1) out.push(label);
    });
    return out;
  }

  /**
   * Effects of eating `grams` of `food`.
   * Returns [{ id, system, title, text, tone, evidence, src[], amount, estimated }]
   * sorted warnings first.
   */
  function forFood(food, grams) {
    if (!food || !food.n) return [];
    const g = grams > 0 ? grams : 100;
    const n = food.n;
    const amt = k => (Number(n[k]) || 0) * g / 100;
    const est = new Set((food.estimate && food.estimate.keys) || []);
    const F = (window.OffMap && OffMap.FLAG) || {};
    const flags = typeof food.flags === 'number' ? food.flags : 0;
    const codes = codeList(food);
    const name = String(food.name || '') + ' ' + String(food.search || '');
    const out = [];
    const add = e => out.push(Object.assign({ estimated: false, src: [] }, e));
    const isSupplement = food.kind === 'supplement';

    /* ---------------- stimulants, alcohol, sugars --------------- */
    const caf = amt('caffeine');
    if (caf >= 30) add({
      id: 'caffeine', system: 'brain', amount: fmt(caf, 'mg'), tone: caf > 200 ? 'warn' : 'info', evidence: 'strong',
      title: 'Caffeine · ' + fmt(caf, 'mg'),
      text: 'Blocks adenosine, the "sleep pressure" signal, for 3–5 hours and briefly raises cortisol and adrenaline. ' +
        'Its half-life is about 5 hours: a cup 6 hours before bed still cut sleep by an hour in a controlled trial. ' +
        (caf > 200 ? 'More than EFSA’s 200 mg single-dose guide. ' : '') + 'EFSA: up to 400 mg a day is safe for adults (200 mg in pregnancy).',
      src: ['efsa-caffeine', 'drake-2013', 'lovallo-2005'], estimated: est.has('caffeine')
    });

    const avail = Math.max(0, amt('carbs') - amt('fiber'));
    const gl = amt('gl');
    if (food.gi > 0 && avail >= 10) {
      if (gl >= 20) add({ id: 'gl', system: 'sugar', tone: 'caution', evidence: 'strong', amount: 'GL ' + r0(gl),
        title: 'Big blood-sugar spike · glycemic load ' + r0(gl),
        text: 'Glucose rises fast and insulin follows; a rebound dip 2–3 hours later often brings hunger and low energy. ' +
          'Pairing it with protein, fat or fibre, or eating it after vegetables, blunts the spike.',
        src: ['gi-tables'], estimated: !!food.giEstimated || est.has('gl') });
      else if (gl >= 11) add({ id: 'gl', system: 'sugar', tone: 'info', evidence: 'strong', amount: 'GL ' + r0(gl),
        title: 'Moderate blood-sugar rise · glycemic load ' + r0(gl),
        text: 'A medium glucose and insulin response for this portion.',
        src: ['gi-tables'], estimated: !!food.giEstimated || est.has('gl') });
      else if (avail >= 15) add({ id: 'gl', system: 'sugar', tone: 'good', evidence: 'strong', amount: 'GL ' + r0(gl),
        title: 'Steady blood sugar · glycemic load ' + r0(gl),
        text: 'Carbohydrate that is absorbed slowly: a gentle glucose curve and a smaller insulin response.',
        src: ['gi-tables'], estimated: !!food.giEstimated || est.has('gl') });
    }

    const free = amt('freesugar');
    if (free >= 10) add({
      id: 'freesugar', system: 'liver', tone: free >= 25 ? 'warn' : 'caution', evidence: 'strong', amount: fmt(free, 'g'),
      title: 'Free sugar · ' + fmt(free, 'g') + ' (' + r0(free / 50 * 100) + '% of the WHO limit)',
      text: 'Half of table sugar is fructose, which only the liver processes. Large amounts, especially in drinks, raise liver fat, ' +
        'triglycerides and insulin resistance. WHO: under 50 g a day, ideally under 25 g.',
      src: ['who-sugar', 'stanhope-2009'], estimated: est.has('freesugar')
    });

    const alc = amt('alcohol');
    if (alc >= 3 || (flags & F.ALCOHOL && alc > 0)) add({
      id: 'alcohol', system: 'hormones', tone: 'warn', evidence: 'strong', amount: fmt(alc, 'g'),
      title: 'Alcohol · ' + fmt(alc, 'g') + ' (' + r1(alc / 10) + ' standard drinks)',
      text: 'Ethanol is a Group 1 carcinogen with no safe threshold for cancer risk. It fragments the second half of the night’s sleep, ' +
        'raises cortisol, and even moderate daily drinking lowered testosterone slightly in a controlled trial.',
      src: ['iarc-alcohol', 'ebrahim-2013', 'sierksma-2004']
    });

    /* ---------------- plant compounds ---------------- */
    const iso = amt('isoflavones');
    if (iso >= 10) add({
      id: 'isoflavones', system: 'hormones', tone: 'info', evidence: 'strong', amount: fmt(iso, 'mg'),
      title: 'Soy isoflavones · ' + fmt(iso, 'mg'),
      text: 'Plant compounds that bind estrogen receptors weakly. Meta-analyses of dozens of clinical trials found no effect on ' +
        'testosterone, free testosterone or estrogen in men at dietary or supplement intakes.',
      src: ['hamilton-reeves-2010', 'reed-2021'], estimated: est.has('isoflavones')
    });

    const gly = amt('glycyrrhizin');
    if (gly >= 20 || (flags & F.LICORICE && !gly)) add({
      id: 'licorice', system: 'hormones', tone: gly >= 100 ? 'warn' : 'caution', evidence: 'moderate', amount: gly ? fmt(gly, 'mg') : '',
      title: 'Licorice' + (gly ? ' · ' + fmt(gly, 'mg') + ' glycyrrhizin' : ''),
      text: 'Glycyrrhizin blocks the enzyme 11β-HSD2, so cortisol starts acting like aldosterone: the body keeps sodium, loses potassium ' +
        'and blood pressure rises. The advised upper limit is 100 mg a day; daily licorice also lowered testosterone in a small study.',
      src: ['scf-2003', 'armanini-1999'], estimated: est.has('glycyrrhizin')
    });

    const nit = amt('nitrate');
    if (nit >= 100) add({
      id: 'nitrate', system: 'heart', tone: 'good', evidence: 'moderate', amount: fmt(nit, 'mg'),
      title: 'Dietary nitrate · ' + fmt(nit, 'mg'),
      text: 'Mouth bacteria turn vegetable nitrate into nitric oxide, which relaxes blood vessels: lower blood pressure (about 4/2 mmHg in trials) ' +
        'and slightly better endurance. Not the same as the nitrite added to cured meat.',
      src: ['siervo-2013'], estimated: est.has('nitrate')
    });

    const epa = amt('epadha'), ala = amt('omega3');
    if (epa >= 200) add({
      id: 'omega3', system: 'heart', tone: 'good', evidence: 'strong', amount: fmt(epa, 'mg'),
      title: 'Omega-3 EPA + DHA · ' + fmt(epa, 'mg'),
      text: 'Long-chain omega-3s lower triglycerides, damp inflammation and are built into brain and retina cell membranes. ' +
        'EFSA advises 250 mg a day — about two portions of oily fish a week.',
      src: ['efsa-fats'], estimated: est.has('epadha')
    });
    else if (ala >= 1.5) add({
      id: 'omega3', system: 'heart', tone: 'good', evidence: 'moderate', amount: fmt(ala, 'g'),
      title: 'Plant omega-3 (ALA) · ' + fmt(ala, 'g'),
      text: 'ALA is an essential fat linked to lower heart-disease risk. The body converts only around 5% of it into EPA and DHA.',
      src: ['efsa-fats'], estimated: est.has('omega3')
    });

    /* ---------------- processing and additives ---------------- */
    const nova = window.Quality ? Quality.processing(food).nova : food.nova;
    if (nova === 4 && !isSupplement) add({
      id: 'upf', system: 'hormones', tone: 'caution', evidence: 'moderate',
      title: 'Ultra-processed',
      text: 'In a controlled NIH trial, people ate about 500 kcal a day more on an ultra-processed diet than on an unprocessed one with ' +
        'the same sugar, fat, fibre and salt on offer — and gained weight, with appetite hormones shifting accordingly.',
      src: ['hall-2019']
    });

    const sweet = additiveNames(codes, c => {
      const a = window.Additives && Additives.get(c);
      return a && /sweetener/i.test(a.fn || '') && !POLYOLS[c.replace(/[a-z]+$/, '')];
    });
    if (sweet.length || (flags & F.SWEETENER)) add({
      id: 'sweeteners', system: 'gut', tone: 'caution', evidence: 'limited',
      title: 'Non-sugar sweeteners' + (sweet.length ? ' · ' + sweet.join(', ') : ''),
      text: 'In a 2022 controlled trial, saccharin and sucralose changed gut bacteria and worsened blood-sugar responses in some people; ' +
        'effects differed between sweeteners and between people. WHO (2023) advises against relying on them for weight control.',
      src: ['suez-2022']
    });

    const polyol = additiveNames(codes, c => POLYOLS[c.replace(/[a-z]+$/, '')]);
    if (polyol.length) add({
      id: 'polyols', system: 'gut', tone: 'caution', evidence: 'limited',
      title: 'Sugar alcohols · ' + polyol.join(', '),
      text: 'Partly undigested: large amounts cause bloating and a laxative effect. High blood erythritol was linked to clotting and ' +
        'cardiovascular events in a 2023 study.',
      src: ['witkowski-2023']
    });

    const emul = additiveNames(codes, c => EMULSIFIERS[c]);
    if (emul.length) add({
      id: 'emulsifiers', system: 'gut', tone: 'caution', evidence: 'limited',
      title: 'Emulsifiers · ' + emul.join(', '),
      text: 'Carboxymethylcellulose (E466) thinned the gut’s protective mucus and changed gut bacteria in a controlled feeding trial; ' +
        'in a French cohort of 95,000 adults, higher emulsifier intake (incl. E471) tracked with more heart disease.',
      src: ['chassaing-2022', 'sellem-2023']
    });

    const nitrite = codes.some(c => NITRITES[c]);
    const processedMeat = nitrite || (food.cat === 'Meat & Poultry' && PROCESSED_MEAT.test(name));
    if (processedMeat) add({
      id: 'processed-meat', system: 'cancer', tone: 'warn', evidence: 'strong',
      title: 'Processed meat' + (nitrite ? ' with nitrite' : ''),
      text: 'Classified as carcinogenic to humans (IARC Group 1): every 50 g eaten daily raises colorectal cancer risk by about 18%. ' +
        'Nitrite and nitrate curing salts form N-nitroso compounds in the gut.',
      src: ['iarc-meat']
    });
    else if (food.cat === 'Meat & Poultry' && RED_MEAT.test(name)) add({
      id: 'red-meat', system: 'cancer', tone: 'info', evidence: 'moderate',
      title: 'Red meat',
      text: 'Probably carcinogenic at high intakes (IARC Group 2A), and also one of the best sources of iron, zinc and B12. ' +
        'German guidelines suggest at most 300 g of meat a week.',
      src: ['iarc-meat']
    });

    const phos = additiveNames(codes, c => PHOSPHATES.test(c));
    if (phos.length) add({
      id: 'phosphates', system: 'bones', tone: 'caution', evidence: 'moderate',
      title: 'Phosphate additives · ' + phos.join(', '),
      text: 'Phosphate from additives is absorbed almost completely, unlike the phosphate in whole foods. High intakes are linked to ' +
        'vascular calcification and poorer kidney health' + (codes.indexOf('338') !== -1 ? '; cola drinking was linked to lower hip bone density in women (Framingham).' : '.'),
      src: codes.indexOf('338') !== -1 ? ['ritz-2012', 'tucker-2006'] : ['ritz-2012']
    });

    const azo = additiveNames(codes, c => AZO[c]);
    if (azo.length) add({
      id: 'azo', system: 'brain', tone: 'caution', evidence: 'moderate',
      title: 'Azo colours · ' + azo.join(', '),
      text: 'Linked to hyperactivity in children in a randomised placebo-controlled trial; EU labels must warn that they "may have an ' +
        'adverse effect on activity and attention in children".',
      src: ['mccann-2007']
    });

    if (codes.indexOf('171') !== -1) add({
      id: 'tio2', system: 'cancer', tone: 'warn', evidence: 'moderate',
      title: 'Titanium dioxide (E171)',
      text: 'EFSA could no longer rule out damage to DNA and stopped considering it safe in 2021; it has been banned in EU food since 2022.',
      src: ['efsa-tio2']
    });

    if (flags & F.HYDROGENATED) add({
      id: 'trans', system: 'heart', tone: 'warn', evidence: 'strong',
      title: 'Partially hydrogenated fat',
      text: 'The main source of industrial trans fats: they raise LDL, lower HDL and, gram for gram, are the dietary fat most strongly ' +
        'tied to heart disease. The EU caps them at 2 g per 100 g of fat.',
      src: ['mozaffarian-2006']
    });

    if (flags & F.PALM) add({
      id: 'palm', system: 'heart', tone: 'caution', evidence: 'moderate',
      title: 'Palm oil',
      text: 'About half saturated fat (palmitic acid); raises LDL cholesterol compared with liquid vegetable oils.',
      src: ['sun-2015']
    });

    if (flags & F.SEED_OIL) add({
      id: 'seed-oil', system: 'heart', tone: 'info', evidence: 'strong',
      title: 'Seed oils',
      text: 'Rich in linoleic acid (omega-6). Despite claims online, trials and large cohorts link replacing saturated fat with these oils ' +
        'to lower LDL and fewer heart attacks; there is no good human evidence that they cause inflammation at normal intakes.',
      src: ['farvid-2014', 'hooper-2020']
    });

    if ((flags & F.LIVE_CULTURES) || (FERMENTED.test(name) && !isSupplement && nova !== 4)) add({
      id: 'fermented', system: 'gut', tone: 'good', evidence: 'moderate',
      title: 'Fermented food',
      text: 'In a Stanford trial, six servings of fermented food a day raised gut microbiome diversity and lowered 19 inflammatory markers.',
      src: ['wastyk-2021']
    });

    /* ---------------- nutrients with hormone or organ effects ---------------- */
    const fib = amt('fiber');
    if (fib >= 5) add({
      id: 'fiber', system: 'gut', tone: 'good', evidence: 'strong', amount: fmt(fib, 'g'),
      title: 'Fibre · ' + fmt(fib, 'g'),
      text: 'Gut bacteria ferment it into short-chain fatty acids; it slows glucose absorption and releases the satiety hormones GLP-1 and PYY. ' +
        'Eating 25–30 g a day cut heart disease, diabetes and bowel cancer risk by 15–30%.',
      src: ['reynolds-2019']
    });

    if (food.cat === 'Grains & Bread' && /oat|hafer|barley|gerste|porridge/i.test(name) && g >= 30) add({
      id: 'betaglucan', system: 'heart', tone: 'good', evidence: 'strong',
      title: 'Beta-glucan',
      text: 'Soluble oat and barley fibre that binds bile acids and lowers LDL cholesterol; 3 g a day (about 75 g of oats) carries an approved EU health claim.',
      src: ['efsa-betaglucan']
    });

    const pro = amt('protein');
    if (pro >= 20) add({
      id: 'protein', system: 'muscle', tone: 'good', evidence: 'strong', amount: fmt(pro, 'g'),
      title: 'Protein · ' + fmt(pro, 'g'),
      text: 'About 20–25 g in one sitting maximally switches on muscle protein synthesis. Protein also raises the satiety hormones ' +
        'PYY and GLP-1 and suppresses ghrelin more than carbs or fat do.',
      src: ['moore-2009', 'batterham-2006']
    });

    const sat = amt('satfat');
    if (sat >= 8) add({
      id: 'satfat', system: 'heart', tone: 'caution', evidence: 'strong', amount: fmt(sat, 'g'),
      title: 'Saturated fat · ' + fmt(sat, 'g'),
      text: 'Raises LDL cholesterol. Swapping it for unsaturated fat (olive or rapeseed oil, nuts) lowered cardiovascular events by about 17% in trials.',
      src: ['mensink-2016', 'hooper-2020']
    });

    const na = amt('na');
    if (na >= 600) add({
      id: 'salt', system: 'heart', tone: na >= 1200 ? 'warn' : 'caution', evidence: 'strong', amount: fmt(na * 2.5 / 1000, 'g'),
      title: 'Salt · ' + fmt(na * 2.5 / 1000, 'g') + ' (' + r0(na / 2000 * 100) + '% of the WHO limit)',
      text: 'Raises blood pressure, especially in salt-sensitive people and with age. WHO: under 5 g of salt a day.',
      src: ['who-sodium']
    });

    const k = amt('k');
    if (k >= 400) add({
      id: 'potassium', system: 'heart', tone: 'good', evidence: 'moderate', amount: fmt(k, 'mg'),
      title: 'Potassium · ' + fmt(k, 'mg'),
      text: 'Counteracts sodium: higher potassium intake lowered blood pressure and stroke risk in meta-analyses.',
      src: ['aburto-2013'], estimated: est.has('k')
    });

    const iod = amt('iodine');
    if (iod >= 40) add({
      id: 'iodine', system: 'thyroid', tone: 'good', evidence: 'strong', amount: fmt(iod, 'µg'),
      title: 'Iodine · ' + fmt(iod, 'µg'),
      text: 'The building block of the thyroid hormones T3 and T4, which set your metabolic rate. Germany is still a mild iodine-deficiency area.',
      src: ['efsa-iodine'], estimated: est.has('iodine')
    });

    const se = amt('se');
    if (se >= 255) add({
      id: 'selenium-high', system: 'thyroid', tone: 'warn', evidence: 'strong', amount: fmt(se, 'µg'),
      title: 'Very high selenium · ' + fmt(se, 'µg'),
      text: 'Above EFSA’s 255 µg daily upper limit in one portion; long-term excess causes hair and nail loss. One or two Brazil nuts are plenty.',
      src: ['efsa-selenium'], estimated: est.has('se')
    });
    else if (se >= 20) add({
      id: 'selenium', system: 'thyroid', tone: 'good', evidence: 'strong', amount: fmt(se, 'µg'),
      title: 'Selenium · ' + fmt(se, 'µg'),
      text: 'Needed to activate thyroid hormone (T4 to T3) and for antioxidant enzymes.',
      src: ['efsa-selenium'], estimated: est.has('se')
    });

    const zn = amt('zn');
    if (zn >= 3) add({
      id: 'zinc', system: 'hormones', tone: 'good', evidence: 'limited', amount: fmt(zn, 'mg'),
      title: 'Zinc · ' + fmt(zn, 'mg'),
      text: 'Needed to make testosterone and for immunity. Low zinc lowers testosterone and topping it up restores it — there is no extra boost when levels are normal.',
      src: ['prasad-1996'], estimated: est.has('zn')
    });

    const vd = amt('vitD');
    if (vd >= 2.5) add({
      id: 'vitd', system: 'hormones', tone: 'good', evidence: 'strong', amount: fmt(vd, 'µg'),
      title: 'Vitamin D · ' + fmt(vd, 'µg'),
      text: 'Converted by liver and kidneys into calcitriol, a steroid hormone that controls calcium absorption, bone and muscle. ' +
        'Few foods have much; in German winters sunlight makes almost none.',
      src: ['efsa-vitd'], estimated: est.has('vitD')
    });

    const vk = amt('vitK');
    if (vk >= 100) add({
      id: 'vitk', system: 'meds', tone: 'info', evidence: 'strong', amount: fmt(vk, 'µg'),
      title: 'Vitamin K · ' + fmt(vk, 'µg'),
      text: 'Activates clotting factors and bone proteins. If you take warfarin or phenprocoumon (Marcumar), keep your intake steady from day to day.',
      src: ['holbrook-2005'], estimated: est.has('vitK')
    });

    if (/grapefruit|pampelmuse|pomelo/i.test(name)) add({
      id: 'grapefruit', system: 'meds', tone: 'warn', evidence: 'strong',
      title: 'Grapefruit and medicines',
      text: 'Blocks the gut enzyme CYP3A4 for up to a day, raising blood levels of many drugs — some statins, calcium-channel blockers, ' +
        'immunosuppressants. Check your medicines’ leaflet.',
      src: ['bailey-2013']
    });

    return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
  }

  /* ================================================================== day */

  /**
   * Daily physiology summary from logged entries.
   *   entries  diary entries ({ n, name, refId, t? })
   *   resolve  entry -> food (for processing and additives), may return null
   *   profile  { weight, sex, ... } for protein per kg
   * Returns { items: [...], totals, upfShare }
   */
  function forDay(entries, resolve, profile) {
    const T = Nutrition.sum((entries || []).map(e => e.n || {}));
    const items = [];
    const add = (o) => items.push(Object.assign({ src: [] }, o));
    const kcal = T.kcal || 0;
    if (!entries || !entries.length) return { items, totals: T, upfShare: null };

    // Calories from ultra-processed food, and the latest caffeine of the day.
    let upfKcal = 0, ratedKcal = 0, lastCaf = null;
    entries.forEach(e => {
      const f = resolve ? resolve(e) : null;
      const k = (e.n && e.n.kcal) || 0;
      if (f && k > 0) {
        const nova = Quality.processing(f).nova;
        if (nova) { ratedKcal += k; if (nova === 4) upfKcal += k; }
      }
      const ts = e.t || e.ts || e.time;
      if (e.n && e.n.caffeine >= 30 && ts) {
        const d = new Date(ts);
        if (!isNaN(d)) { const h = d.getHours() + d.getMinutes() / 60; if (lastCaf === null || h > lastCaf) lastCaf = h; }
      }
    });
    const upfShare = ratedKcal > 0 ? upfKcal / ratedKcal : null;

    const caf = T.caffeine || 0;
    if (caf > 0) add({
      id: 'caffeine', system: 'brain', label: 'Caffeine', value: caf, unit: 'mg', target: 400, limit: true,
      tone: caf > 400 ? 'warn' : lastCaf !== null && lastCaf >= 15 ? 'caution' : 'info',
      text: caf > 400 ? 'Above the 400 mg EFSA considers safe in a day.' :
        lastCaf !== null && lastCaf >= 15 ? 'Your last caffeine was after 3 pm — with a 5-hour half-life, part of it is still active at bedtime.' :
          'Within the 400 mg EFSA considers safe in a day.',
      src: ['efsa-caffeine', 'drake-2013']
    });

    const free = T.freesugar || 0;
    add({
      id: 'freesugar', system: 'liver', label: 'Free sugar', value: free, unit: 'g', target: 50, limit: true,
      tone: free > 50 ? 'warn' : free > 25 ? 'caution' : 'good',
      text: free > 50 ? 'Over the WHO limit of 50 g (10% of energy).' : free > 25 ? 'Under the WHO limit, above the 25 g ideal.' : 'Within the WHO’s ideal of under 25 g.',
      src: ['who-sugar']
    });

    const fib = T.fiber || 0;
    add({
      id: 'fiber', system: 'gut', label: 'Fibre', value: fib, unit: 'g', target: 30,
      tone: fib >= 30 ? 'good' : fib >= 20 ? 'info' : 'caution',
      text: fib >= 30 ? 'At the 30 g the German Nutrition Society recommends.' : 'The German Nutrition Society recommends at least 30 g.',
      src: ['reynolds-2019']
    });

    const na = T.na || 0;
    add({
      id: 'salt', system: 'heart', label: 'Salt', value: na * 2.5 / 1000, unit: 'g', target: 5, limit: true,
      tone: na > 2000 ? (na > 3000 ? 'warn' : 'caution') : 'good',
      text: na > 2000 ? 'Above the WHO limit of 5 g salt.' : 'Within the WHO limit of 5 g salt.',
      src: ['who-sodium']
    });

    if (kcal > 0) {
      const satPct = (T.satfat || 0) * 9 / kcal * 100;
      add({
        id: 'satfat', system: 'heart', label: 'Saturated fat', value: satPct, unit: '% kcal', target: 10, limit: true,
        tone: satPct > 13 ? 'caution' : 'good',
        text: satPct > 10 ? 'Above the 10% of energy most guidelines advise.' : 'Within the advised 10% of energy.',
        src: ['mensink-2016']
      });
    }

    const epa = T.epadha || 0;
    add({
      id: 'omega3', system: 'heart', label: 'EPA + DHA', value: epa, unit: 'mg', target: 250,
      tone: epa >= 250 ? 'good' : 'info',
      text: epa >= 250 ? 'At EFSA’s 250 mg reference.' : 'EFSA suggests 250 mg a day on average — oily fish twice a week covers it.',
      src: ['efsa-fats']
    });

    const nit = T.nitrate || 0;
    if (nit > 0) add({
      id: 'nitrate', system: 'heart', label: 'Dietary nitrate', value: nit, unit: 'mg', target: 300,
      tone: nit >= 300 ? 'good' : 'info',
      text: nit >= 300 ? 'Enough to measurably lower blood pressure in trials.' : 'Leafy greens and beetroot are the richest sources.',
      src: ['siervo-2013']
    });

    const iod = T.iodine || 0;
    add({
      id: 'iodine', system: 'thyroid', label: 'Iodine', value: iod, unit: 'µg', target: 150,
      tone: iod >= 150 ? 'good' : 'info',
      text: iod >= 150 ? 'Meets EFSA’s 150 µg reference.' : 'Iodised salt, dairy, eggs and sea fish are the main sources in Germany.',
      src: ['efsa-iodine']
    });

    if (T.alcohol > 0) add({
      id: 'alcohol', system: 'hormones', label: 'Alcohol', value: T.alcohol, unit: 'g', target: 0, limit: true,
      tone: T.alcohol > 20 ? 'warn' : 'caution',
      text: 'The German Nutrition Society (2024) says no amount of alcohol is safe; less is better for sleep, hormones and cancer risk.',
      src: ['iarc-alcohol', 'ebrahim-2013']
    });

    if (T.glycyrrhizin > 0) add({
      id: 'licorice', system: 'hormones', label: 'Glycyrrhizin', value: T.glycyrrhizin, unit: 'mg', target: 100, limit: true,
      tone: T.glycyrrhizin > 100 ? 'warn' : 'info',
      text: T.glycyrrhizin > 100 ? 'Over the 100 mg a day advised upper limit — blood pressure and potassium are affected.' : 'Under the 100 mg advised upper limit.',
      src: ['scf-2003']
    });

    if (T.isoflavones >= 5) add({
      id: 'isoflavones', system: 'hormones', label: 'Soy isoflavones', value: T.isoflavones, unit: 'mg', target: null,
      tone: 'info', text: 'No measurable effect on male or female reproductive hormones at food intakes.',
      src: ['reed-2021']
    });

    const gl = T.gl || 0;
    if (gl > 0) add({
      id: 'gl', system: 'sugar', label: 'Glycemic load', value: gl, unit: '', target: 100, limit: true,
      tone: gl > 120 ? 'caution' : gl < 80 ? 'good' : 'info',
      text: gl > 120 ? 'A high-glycemic day: many fast carbohydrates.' : gl < 80 ? 'A low-glycemic day.' : 'A moderate glycemic day.',
      src: ['gi-tables']
    });

    const weight = profile && profile.weight;
    if (weight > 0) {
      const perKg = (T.protein || 0) / weight;
      add({
        id: 'protein', system: 'muscle', label: 'Protein', value: perKg, unit: 'g/kg', target: 1.6,
        tone: perKg >= 1.2 ? 'good' : perKg >= 0.8 ? 'info' : 'caution',
        text: perKg >= 1.6 ? 'Enough to maximise muscle gain with training.' : perKg >= 0.8 ? 'Above the 0.8 g/kg minimum; 1.2–1.6 g/kg supports muscle and satiety.' : 'Below the 0.8 g/kg minimum.',
        src: ['moore-2009']
      });
    }

    if (upfShare !== null) add({
      id: 'upf', system: 'hormones', label: 'Ultra-processed', value: upfShare * 100, unit: '% kcal', target: 20, limit: true,
      tone: upfShare > 0.5 ? 'warn' : upfShare > 0.25 ? 'caution' : 'good',
      text: upfShare > 0.25 ? 'A large share of today’s calories came from ultra-processed food.' : 'Mostly whole and minimally processed food today.',
      src: ['hall-2019']
    });

    if ((T.k || 0) > 0 && na > 0) {
      const ratio = T.k / na;
      add({
        id: 'kna', system: 'heart', label: 'Potassium : sodium', value: ratio, unit: '', target: 1,
        tone: ratio >= 1 ? 'good' : 'caution',
        text: ratio >= 1 ? 'More potassium than sodium — good for blood pressure.' : 'More sodium than potassium; vegetables, fruit and legumes shift the balance.',
        src: ['aburto-2013']
      });
    }

    return { items, totals: T, upfShare };
  }

  window.Body = { forFood, forDay, SOURCES, SYSTEMS, EVIDENCE };
})();
