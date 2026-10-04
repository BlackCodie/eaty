/* ==========================================================================
   additives.js — E-number database with evidence-based risk levels

   Risk levels
     0  No known risk     Natural substance, nutrient, or very well established.
     1  Limited risk      Safe at permitted levels; caveats for some people or
                          large amounts (laxative effect, rare allergy).
     2  Moderate risk     Real evidence of adverse effects in humans or animals,
                          a mandatory warning, or an open regulatory question.
     3  High risk         Banned in the EU, or tied to a classified carcinogen
                          in the way it is used.

   Notes cite regulators (EFSA, IARC, JECFA, FDA) and named studies only where
   the finding is well documented. Observational associations are labelled as
   such: they suggest, they do not prove. A moderate rating means "worth
   limiting", not "dangerous at the levels in one product".

   Shared by the app and the pack builder (UMD).
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  // Browsers (and the Node test loader, which defines window) get a global.
  if (typeof window !== 'undefined') root.Additives = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIX = 'One of the "Southampton six" colours: EU law requires the warning "may have an adverse effect on activity and attention in children".';
  const SULPHITE = 'Sulphites can trigger asthma attacks in sensitive people and must be declared as an allergen above 10 mg/kg. They also destroy vitamin B1.';
  const NITRITE = 'Nitrites in cured meat can form carcinogenic nitrosamines. Processed meat is classified by IARC as carcinogenic to humans (Group 1), mainly for bowel cancer.';
  const NITRATE = 'Converted to nitrite in cured meat, with the same nitrosamine concern. (Nitrate in vegetables behaves differently and lowers blood pressure.)';
  const BENZOATE = 'Can trigger reactions in asthmatics and aspirin-sensitive people, and can form traces of benzene alongside vitamin C in drinks. Sodium benzoate was part of the Southampton hyperactivity study.';
  const PARABEN = 'Paraben preservative; weakly oestrogenic in laboratory studies, which is why EFSA withdrew propyl paraben from food use.';
  const PHOSPHATE = 'Phosphate additives are absorbed far more completely than phosphorus in whole foods. EFSA set a group intake limit in 2019 that heavy consumers of processed food can exceed. A particular concern with kidney disease.';
  const POLYSORBATE = 'Synthetic emulsifier. In mice, polysorbate 80 thins the protective gut mucus and promotes low-grade inflammation; human evidence is still limited.';
  const ALUMINIUM = 'Aluminium-containing additive. EFSA advises that aluminium intake from food can exceed its tolerable weekly level in some people.';
  const STARCH = 'Chemically modified starch for texture. Considered safe; adds energy but no nutrients, and marks a more processed product.';
  const POLYOL = 'Sugar alcohol: fewer calories and gentler on teeth, but laxative and can cause bloating in larger amounts.';
  const RIBO = 'Purine-based flavour enhancer, usually paired with glutamate. Best avoided with gout.';
  const GLUTAMATE = 'Glutamate flavour enhancer. EFSA (2017) set a group intake limit that high consumers can exceed. "Chinese restaurant syndrome" has not held up in blinded trials.';

  /* [code, name, function, risk, note?] */
  const ROWS = [
    // ---- colours
    ['100', 'Curcumin', 'colour', 0, 'Turmeric pigment.'],
    ['101', 'Riboflavin', 'colour', 0, 'Vitamin B2.'],
    ['102', 'Tartrazine', 'colour', 2, SIX + ' Can also provoke reactions in aspirin-sensitive people.'],
    ['104', 'Quinoline yellow', 'colour', 2, SIX],
    ['110', 'Sunset yellow FCF', 'colour', 2, SIX],
    ['120', 'Carmine (cochineal)', 'colour', 1, 'Made from insects, so not vegetarian. Rare allergic reactions.'],
    ['122', 'Azorubine', 'colour', 2, SIX],
    ['123', 'Amaranth', 'colour', 2, 'Azo dye banned in the US; restricted in the EU to a few uses.'],
    ['124', 'Ponceau 4R', 'colour', 2, SIX],
    ['127', 'Erythrosine', 'colour', 2, 'Iodine-containing dye linked to thyroid tumours in rats. The US FDA moved to revoke its food authorisation in 2025; the EU allows it only in cocktail cherries.'],
    ['129', 'Allura red AC', 'colour', 2, SIX],
    ['131', 'Patent blue V', 'colour', 1, 'Synthetic dye; rare allergic reactions.'],
    ['132', 'Indigotine', 'colour', 1, 'Synthetic dye.'],
    ['133', 'Brilliant blue FCF', 'colour', 1, 'Synthetic dye.'],
    ['140', 'Chlorophylls', 'colour', 0, 'Natural green plant pigment.'],
    ['141', 'Copper chlorophyllins', 'colour', 0, 'Stabilised chlorophyll.'],
    ['142', 'Green S', 'colour', 1, 'Synthetic dye.'],
    ['150a', 'Plain caramel', 'colour', 0, 'Heated sugar.'],
    ['150b', 'Caustic sulphite caramel', 'colour', 1, 'Industrial caramel colour.'],
    ['150c', 'Ammonia caramel', 'colour', 1, 'May contain 4-MEI, which EFSA limits.'],
    ['150d', 'Sulphite ammonia caramel', 'colour', 1, 'The colour in colas. Contains traces of 4-MEI, which EFSA limits; reassessed as safe at current use.'],
    ['151', 'Brilliant black BN', 'colour', 2, 'Azo dye; EFSA lowered its intake limit in 2010.'],
    ['153', 'Vegetable carbon', 'colour', 1, 'Charcoal black.'],
    ['155', 'Brown HT', 'colour', 2, 'Azo dye with a low intake limit.'],
    ['160a', 'Carotenes', 'colour', 0, 'Provitamin A, as in carrots.'],
    ['160b', 'Annatto', 'colour', 1, 'Seed extract; occasional allergic reactions.'],
    ['160c', 'Paprika extract', 'colour', 0, 'From paprika.'],
    ['160d', 'Lycopene', 'colour', 0, 'Tomato pigment.'],
    ['160e', 'Beta-apo-8-carotenal', 'colour', 0, 'Carotenoid.'],
    ['161b', 'Lutein', 'colour', 0, 'Carotenoid found in leafy greens.'],
    ['162', 'Beetroot red', 'colour', 0, 'From beetroot.'],
    ['163', 'Anthocyanins', 'colour', 0, 'Berry and grape pigments.'],
    ['170', 'Calcium carbonate', 'colour', 0, 'Chalk; also a calcium source.'],
    ['171', 'Titanium dioxide', 'colour', 3, 'Banned as a food additive in the EU since 2022 after EFSA could not rule out damage to DNA.'],
    ['172', 'Iron oxides', 'colour', 1, 'Mineral pigment.'],
    ['173', 'Aluminium', 'colour', 2, ALUMINIUM],
    ['174', 'Silver', 'colour', 1, 'Decoration only.'],
    ['175', 'Gold', 'colour', 1, 'Decoration only.'],
    ['180', 'Litholrubine BK', 'colour', 1, 'Cheese rind only.'],

    // ---- preservatives
    ['200', 'Sorbic acid', 'preservative', 1, 'Well tolerated; rare skin sensitivity.'],
    ['202', 'Potassium sorbate', 'preservative', 1, 'Well tolerated; rare skin sensitivity.'],
    ['210', 'Benzoic acid', 'preservative', 2, BENZOATE],
    ['211', 'Sodium benzoate', 'preservative', 2, BENZOATE],
    ['212', 'Potassium benzoate', 'preservative', 2, BENZOATE],
    ['213', 'Calcium benzoate', 'preservative', 2, BENZOATE],
    ['214', 'Ethylparaben', 'preservative', 2, PARABEN],
    ['215', 'Sodium ethylparaben', 'preservative', 2, PARABEN],
    ['218', 'Methylparaben', 'preservative', 2, PARABEN],
    ['219', 'Sodium methylparaben', 'preservative', 2, PARABEN],
    ['220', 'Sulphur dioxide', 'preservative', 2, SULPHITE],
    ['221', 'Sodium sulphite', 'preservative', 2, SULPHITE],
    ['222', 'Sodium bisulphite', 'preservative', 2, SULPHITE],
    ['223', 'Sodium metabisulphite', 'preservative', 2, SULPHITE],
    ['224', 'Potassium metabisulphite', 'preservative', 2, SULPHITE],
    ['226', 'Calcium sulphite', 'preservative', 2, SULPHITE],
    ['227', 'Calcium bisulphite', 'preservative', 2, SULPHITE],
    ['228', 'Potassium bisulphite', 'preservative', 2, SULPHITE],
    ['234', 'Nisin', 'preservative', 1, 'Natural antimicrobial peptide from fermentation.'],
    ['235', 'Natamycin', 'preservative', 1, 'Antifungal used on cheese rinds and sausage casings.'],
    ['239', 'Hexamethylenetetramine', 'preservative', 2, 'Releases formaldehyde; permitted only in Provolone cheese.'],
    ['242', 'Dimethyl dicarbonate', 'preservative', 1, 'Breaks down in drinks soon after bottling.'],
    ['249', 'Potassium nitrite', 'preservative', 3, NITRITE],
    ['250', 'Sodium nitrite', 'preservative', 3, NITRITE],
    ['251', 'Sodium nitrate', 'preservative', 2, NITRATE],
    ['252', 'Potassium nitrate', 'preservative', 2, NITRATE],
    ['260', 'Acetic acid', 'acid', 0, 'Vinegar.'],
    ['261', 'Potassium acetate', 'acidity regulator', 0],
    ['262', 'Sodium acetates', 'acidity regulator', 0],
    ['263', 'Calcium acetate', 'acidity regulator', 0],
    ['270', 'Lactic acid', 'acid', 0, 'Produced by fermentation, as in yoghurt.'],
    ['280', 'Propionic acid', 'preservative', 1],
    ['281', 'Sodium propionate', 'preservative', 1],
    ['282', 'Calcium propionate', 'preservative', 1, 'Common bread preservative. A small 2019 human study found it raised glucagon and insulin; more research is under way.'],
    ['283', 'Potassium propionate', 'preservative', 1],
    ['284', 'Boric acid', 'preservative', 2, 'Permitted only in sturgeon caviar.'],
    ['285', 'Sodium tetraborate', 'preservative', 2, 'Permitted only in sturgeon caviar.'],
    ['290', 'Carbon dioxide', 'gas', 0, 'The fizz in drinks.'],
    ['296', 'Malic acid', 'acid', 0, 'Found naturally in apples.'],
    ['297', 'Fumaric acid', 'acid', 0],

    // ---- antioxidants, acids, salts
    ['300', 'Ascorbic acid', 'antioxidant', 0, 'Vitamin C.'],
    ['301', 'Sodium ascorbate', 'antioxidant', 0, 'A form of vitamin C.'],
    ['302', 'Calcium ascorbate', 'antioxidant', 0, 'A form of vitamin C.'],
    ['304', 'Ascorbyl palmitate', 'antioxidant', 0, 'Fat-soluble vitamin C.'],
    ['306', 'Tocopherol-rich extract', 'antioxidant', 0, 'Vitamin E.'],
    ['307', 'Alpha-tocopherol', 'antioxidant', 0, 'Vitamin E.'],
    ['308', 'Gamma-tocopherol', 'antioxidant', 0, 'Vitamin E.'],
    ['309', 'Delta-tocopherol', 'antioxidant', 0, 'Vitamin E.'],
    ['310', 'Propyl gallate', 'antioxidant', 2, 'Synthetic antioxidant; possible allergen and weak hormone activity in laboratory studies.'],
    ['315', 'Erythorbic acid', 'antioxidant', 0],
    ['316', 'Sodium erythorbate', 'antioxidant', 0, 'Speeds curing in processed meat, where it actually reduces nitrosamine formation.'],
    ['319', 'TBHQ', 'antioxidant', 2, 'Synthetic antioxidant with a low intake limit; some animal data on immune effects.'],
    ['320', 'BHA', 'antioxidant', 2, 'Classified by IARC as possibly carcinogenic to humans (Group 2B); possible endocrine disruptor.'],
    ['321', 'BHT', 'antioxidant', 2, 'Synthetic antioxidant with a low intake limit; possible endocrine effects in animal studies.'],
    ['322', 'Lecithins', 'emulsifier', 0, 'Usually from soy or sunflower. Carries negligible soy isoflavones.'],
    ['325', 'Sodium lactate', 'acidity regulator', 0],
    ['326', 'Potassium lactate', 'acidity regulator', 0],
    ['327', 'Calcium lactate', 'acidity regulator', 0],
    ['330', 'Citric acid', 'acid', 0, 'Found naturally in citrus fruit.'],
    ['331', 'Sodium citrates', 'acidity regulator', 0],
    ['332', 'Potassium citrates', 'acidity regulator', 0],
    ['333', 'Calcium citrates', 'acidity regulator', 0],
    ['334', 'Tartaric acid', 'acid', 0, 'Found naturally in grapes.'],
    ['335', 'Sodium tartrates', 'acidity regulator', 0],
    ['336', 'Potassium tartrates', 'acidity regulator', 0, 'Cream of tartar.'],
    ['337', 'Sodium potassium tartrate', 'acidity regulator', 0],
    ['338', 'Phosphoric acid', 'acid', 2, 'Gives colas their bite. High phosphate intake is linked to poorer bone and kidney health; cola drinking was associated with lower bone density in women in the Framingham study (observational). ' + PHOSPHATE],
    ['339', 'Sodium phosphates', 'acidity regulator', 2, PHOSPHATE],
    ['340', 'Potassium phosphates', 'acidity regulator', 2, PHOSPHATE],
    ['341', 'Calcium phosphates', 'acidity regulator', 1, 'Phosphate additive that also supplies calcium.'],
    ['343', 'Magnesium phosphates', 'acidity regulator', 1],
    ['350', 'Sodium malates', 'acidity regulator', 0],
    ['351', 'Potassium malate', 'acidity regulator', 0],
    ['352', 'Calcium malates', 'acidity regulator', 0],
    ['353', 'Metatartaric acid', 'stabiliser', 0],
    ['354', 'Calcium tartrate', 'acidity regulator', 0],
    ['355', 'Adipic acid', 'acid', 0],
    ['363', 'Succinic acid', 'acid', 0],
    ['380', 'Triammonium citrate', 'acidity regulator', 0],
    ['385', 'Calcium disodium EDTA', 'sequestrant', 1, 'Binds metals to stop spoilage; safe at permitted levels.'],
    ['392', 'Rosemary extract', 'antioxidant', 0, 'From rosemary.'],

    // ---- thickeners, gelling agents, emulsifiers
    ['400', 'Alginic acid', 'thickener', 0, 'From seaweed.'],
    ['401', 'Sodium alginate', 'thickener', 0, 'From seaweed.'],
    ['402', 'Potassium alginate', 'thickener', 0, 'From seaweed.'],
    ['403', 'Ammonium alginate', 'thickener', 0],
    ['404', 'Calcium alginate', 'thickener', 0],
    ['405', 'Propylene glycol alginate', 'thickener', 1],
    ['406', 'Agar', 'gelling agent', 0, 'From seaweed.'],
    ['407', 'Carrageenan', 'thickener', 2, 'Seaweed-derived thickener. Animal studies link it to gut inflammation; EFSA (2018) kept it but flagged data gaps. Not allowed in infant formula in the EU.'],
    ['407a', 'Processed eucheuma seaweed', 'thickener', 2, 'Semi-refined carrageenan, with the same gut-inflammation questions.'],
    ['410', 'Locust bean gum', 'thickener', 0, 'Carob seed fibre.'],
    ['412', 'Guar gum', 'thickener', 0, 'Soluble fibre from guar beans.'],
    ['413', 'Tragacanth', 'thickener', 0],
    ['414', 'Gum arabic', 'thickener', 0, 'Acacia gum; a soluble fibre.'],
    ['415', 'Xanthan gum', 'thickener', 0, 'Fermentation-derived fibre.'],
    ['416', 'Karaya gum', 'thickener', 1],
    ['417', 'Tara gum', 'thickener', 0],
    ['418', 'Gellan gum', 'gelling agent', 0],
    ['420', 'Sorbitol', 'sweetener', 1, POLYOL],
    ['421', 'Mannitol', 'sweetener', 1, POLYOL],
    ['422', 'Glycerol', 'humectant', 0],
    ['425', 'Konjac', 'thickener', 1, 'Soluble fibre. Banned in mini jelly cups after choking incidents.'],
    ['426', 'Soybean hemicellulose', 'stabiliser', 0],
    ['427', 'Cassia gum', 'thickener', 1],
    ['431', 'Polyoxyethylene stearate', 'emulsifier', 1],
    ['432', 'Polysorbate 20', 'emulsifier', 2, POLYSORBATE],
    ['433', 'Polysorbate 80', 'emulsifier', 2, POLYSORBATE],
    ['434', 'Polysorbate 40', 'emulsifier', 2, POLYSORBATE],
    ['435', 'Polysorbate 60', 'emulsifier', 2, POLYSORBATE],
    ['436', 'Polysorbate 65', 'emulsifier', 2, POLYSORBATE],
    ['440', 'Pectins', 'gelling agent', 0, 'Fruit fibre.'],
    ['442', 'Ammonium phosphatides', 'emulsifier', 1, 'Used in chocolate.'],
    ['444', 'Sucrose acetate isobutyrate', 'emulsifier', 1],
    ['445', 'Glycerol esters of wood rosins', 'emulsifier', 1],
    ['450', 'Diphosphates', 'raising agent', 2, PHOSPHATE],
    ['451', 'Triphosphates', 'stabiliser', 2, PHOSPHATE],
    ['452', 'Polyphosphates', 'stabiliser', 2, PHOSPHATE],
    ['459', 'Beta-cyclodextrin', 'stabiliser', 0],
    ['460', 'Cellulose', 'bulking agent', 0, 'Plant fibre.'],
    ['461', 'Methyl cellulose', 'thickener', 0],
    ['462', 'Ethyl cellulose', 'thickener', 0],
    ['463', 'Hydroxypropyl cellulose', 'thickener', 0],
    ['464', 'Hydroxypropyl methyl cellulose', 'thickener', 0],
    ['465', 'Ethyl methyl cellulose', 'thickener', 0],
    ['466', 'Carboxymethyl cellulose', 'thickener', 2, 'In a 2022 controlled feeding trial, healthy adults given carboxymethyl cellulose lost gut bacterial diversity and beneficial metabolites (Chassaing et al., Gastroenterology).'],
    ['468', 'Crosslinked sodium carboxymethyl cellulose', 'thickener', 1],
    ['469', 'Enzymatically hydrolysed carboxymethyl cellulose', 'thickener', 1],
    ['470a', 'Sodium, potassium and calcium salts of fatty acids', 'emulsifier', 0],
    ['470b', 'Magnesium salts of fatty acids', 'emulsifier', 0],
    ['471', 'Mono- and diglycerides of fatty acids', 'emulsifier', 1, 'Among the most common emulsifiers. A large French cohort (NutriNet-Santé, 2023) associated higher emulsifier intake with cardiovascular disease — an observational link, not proof.'],
    ['472a', 'Acetic acid esters of mono- and diglycerides', 'emulsifier', 1],
    ['472b', 'Lactic acid esters of mono- and diglycerides', 'emulsifier', 1],
    ['472c', 'Citric acid esters of mono- and diglycerides', 'emulsifier', 1],
    ['472d', 'Tartaric acid esters of mono- and diglycerides', 'emulsifier', 1],
    ['472e', 'DATEM', 'emulsifier', 1, 'Dough strengthener common in industrial bread.'],
    ['472f', 'Mixed acetic and tartaric esters', 'emulsifier', 1],
    ['473', 'Sucrose esters of fatty acids', 'emulsifier', 1],
    ['474', 'Sucroglycerides', 'emulsifier', 1],
    ['475', 'Polyglycerol esters of fatty acids', 'emulsifier', 1],
    ['476', 'Polyglycerol polyricinoleate (PGPR)', 'emulsifier', 1, 'Lets chocolate makers use less cocoa butter.'],
    ['477', 'Propylene glycol esters of fatty acids', 'emulsifier', 1],
    ['479b', 'Thermally oxidised soya oil', 'emulsifier', 1],
    ['481', 'Sodium stearoyl-2-lactylate', 'emulsifier', 1],
    ['482', 'Calcium stearoyl-2-lactylate', 'emulsifier', 1],
    ['483', 'Stearyl tartrate', 'emulsifier', 1],
    ['491', 'Sorbitan monostearate', 'emulsifier', 1],
    ['492', 'Sorbitan tristearate', 'emulsifier', 1],
    ['493', 'Sorbitan monolaurate', 'emulsifier', 1],
    ['494', 'Sorbitan monooleate', 'emulsifier', 1],
    ['495', 'Sorbitan monopalmitate', 'emulsifier', 1],
    ['499', 'Stigmasterol-rich plant sterols', 'stabiliser', 0],

    // ---- acidity regulators, anti-caking agents, minerals
    ['500', 'Sodium carbonates', 'raising agent', 0, 'Baking soda.'],
    ['501', 'Potassium carbonates', 'acidity regulator', 0],
    ['503', 'Ammonium carbonates', 'raising agent', 0, 'Traditional baking ammonia.'],
    ['504', 'Magnesium carbonates', 'anti-caking agent', 0],
    ['507', 'Hydrochloric acid', 'acid', 0],
    ['508', 'Potassium chloride', 'salt substitute', 1, 'Salt substitute; lowers sodium, but people with kidney disease or on some blood-pressure drugs should be cautious.'],
    ['509', 'Calcium chloride', 'firming agent', 0],
    ['511', 'Magnesium chloride', 'firming agent', 0],
    ['512', 'Stannous chloride', 'antioxidant', 1],
    ['513', 'Sulphuric acid', 'acid', 0],
    ['514', 'Sodium sulphates', 'acidity regulator', 0],
    ['515', 'Potassium sulphates', 'acidity regulator', 0],
    ['516', 'Calcium sulphate', 'firming agent', 0, 'Used to set tofu.'],
    ['517', 'Ammonium sulphate', 'flour treatment', 0],
    ['520', 'Aluminium sulphate', 'firming agent', 2, ALUMINIUM],
    ['521', 'Aluminium sodium sulphate', 'firming agent', 2, ALUMINIUM],
    ['522', 'Aluminium potassium sulphate', 'firming agent', 2, ALUMINIUM],
    ['523', 'Aluminium ammonium sulphate', 'firming agent', 2, ALUMINIUM],
    ['524', 'Sodium hydroxide', 'acidity regulator', 0, 'Used for pretzels (Laugengebäck); neutralised in baking.'],
    ['525', 'Potassium hydroxide', 'acidity regulator', 0],
    ['526', 'Calcium hydroxide', 'acidity regulator', 0],
    ['527', 'Ammonium hydroxide', 'acidity regulator', 0],
    ['528', 'Magnesium hydroxide', 'acidity regulator', 0],
    ['529', 'Calcium oxide', 'acidity regulator', 0],
    ['530', 'Magnesium oxide', 'anti-caking agent', 0],
    ['535', 'Sodium ferrocyanide', 'anti-caking agent', 1, 'Anti-caking agent in salt; stable and not cyanide-releasing at permitted levels.'],
    ['536', 'Potassium ferrocyanide', 'anti-caking agent', 1, 'Anti-caking agent in salt; stable and not cyanide-releasing at permitted levels.'],
    ['538', 'Calcium ferrocyanide', 'anti-caking agent', 1],
    ['541', 'Sodium aluminium phosphate', 'raising agent', 2, ALUMINIUM],
    ['551', 'Silicon dioxide', 'anti-caking agent', 1, 'Common anti-caking agent. EFSA (2018) found no safety concern but asked for more data on nanoparticle forms.'],
    ['552', 'Calcium silicate', 'anti-caking agent', 1],
    ['553a', 'Magnesium silicate', 'anti-caking agent', 1],
    ['553b', 'Talc', 'anti-caking agent', 1],
    ['554', 'Sodium aluminium silicate', 'anti-caking agent', 2, ALUMINIUM],
    ['555', 'Potassium aluminium silicate', 'anti-caking agent', 2, ALUMINIUM],
    ['556', 'Calcium aluminium silicate', 'anti-caking agent', 2, ALUMINIUM],
    ['559', 'Aluminium silicate (kaolin)', 'anti-caking agent', 2, ALUMINIUM],
    ['570', 'Fatty acids', 'glazing agent', 0],
    ['574', 'Gluconic acid', 'acidity regulator', 0],
    ['575', 'Glucono-delta-lactone', 'acidity regulator', 0],
    ['576', 'Sodium gluconate', 'sequestrant', 0],
    ['577', 'Potassium gluconate', 'sequestrant', 0],
    ['578', 'Calcium gluconate', 'firming agent', 0],
    ['579', 'Ferrous gluconate', 'colour retention', 1, 'Keeps black olives black.'],
    ['585', 'Ferrous lactate', 'colour retention', 1],
    ['586', '4-Hexylresorcinol', 'antioxidant', 2, 'Anti-browning agent for shellfish; some evidence of oestrogenic activity in laboratory studies.'],

    // ---- flavour enhancers
    ['620', 'Glutamic acid', 'flavour enhancer', 1, GLUTAMATE],
    ['621', 'Monosodium glutamate (MSG)', 'flavour enhancer', 1, GLUTAMATE],
    ['622', 'Monopotassium glutamate', 'flavour enhancer', 1, GLUTAMATE],
    ['623', 'Calcium diglutamate', 'flavour enhancer', 1, GLUTAMATE],
    ['624', 'Monoammonium glutamate', 'flavour enhancer', 1, GLUTAMATE],
    ['625', 'Magnesium diglutamate', 'flavour enhancer', 1, GLUTAMATE],
    ['626', 'Guanylic acid', 'flavour enhancer', 1, RIBO],
    ['627', 'Disodium guanylate', 'flavour enhancer', 1, RIBO],
    ['628', 'Dipotassium guanylate', 'flavour enhancer', 1, RIBO],
    ['629', 'Calcium guanylate', 'flavour enhancer', 1, RIBO],
    ['630', 'Inosinic acid', 'flavour enhancer', 1, RIBO],
    ['631', 'Disodium inosinate', 'flavour enhancer', 1, RIBO],
    ['632', 'Dipotassium inosinate', 'flavour enhancer', 1, RIBO],
    ['633', 'Calcium inosinate', 'flavour enhancer', 1, RIBO],
    ['634', 'Calcium ribonucleotides', 'flavour enhancer', 1, RIBO],
    ['635', 'Disodium ribonucleotides', 'flavour enhancer', 1, RIBO],
    ['640', 'Glycine', 'flavour enhancer', 0, 'An amino acid.'],
    ['650', 'Zinc acetate', 'flavour enhancer', 0],

    // ---- glazing agents, gases, others
    ['900', 'Dimethylpolysiloxane', 'anti-foaming agent', 1],
    ['901', 'Beeswax', 'glazing agent', 0, 'Not vegan.'],
    ['902', 'Candelilla wax', 'glazing agent', 0],
    ['903', 'Carnauba wax', 'glazing agent', 0, 'Palm leaf wax.'],
    ['904', 'Shellac', 'glazing agent', 1, 'Insect resin, so not vegan.'],
    ['905', 'Microcrystalline wax', 'glazing agent', 1, 'Petroleum-derived; on fruit and sweets.'],
    ['907', 'Hydrogenated poly-1-decene', 'glazing agent', 1],
    ['914', 'Oxidised polyethylene wax', 'glazing agent', 1, 'Citrus peel coating; peel not meant to be eaten.'],
    ['920', 'L-cysteine', 'flour treatment', 1, 'Can be sourced from feathers or hair; not vegan unless stated.'],
    ['927b', 'Carbamide', 'stabiliser', 1, 'Chewing gum only.'],
    ['938', 'Argon', 'packaging gas', 0],
    ['939', 'Helium', 'packaging gas', 0],
    ['941', 'Nitrogen', 'packaging gas', 0],
    ['942', 'Nitrous oxide', 'propellant', 0, 'Whipped cream propellant.'],
    ['943a', 'Butane', 'propellant', 1],
    ['944', 'Propane', 'propellant', 1],
    ['948', 'Oxygen', 'packaging gas', 0],
    ['949', 'Hydrogen', 'packaging gas', 0],
    ['999', 'Quillaia extract', 'foaming agent', 1],

    // ---- sweeteners
    ['950', 'Acesulfame K', 'sweetener', 2, 'Artificial sweetener. Animal studies suggest effects on gut bacteria, and a large French cohort (NutriNet-Santé) associated artificial sweeteners with higher cardiovascular and cancer risk — observational, not proof.'],
    ['951', 'Aspartame', 'sweetener', 2, 'IARC classed it "possibly carcinogenic to humans" (Group 2B) in 2023 on limited evidence; the WHO/FAO expert committee kept its intake limit of 40 mg per kg body weight. Must be avoided with phenylketonuria.'],
    ['952', 'Cyclamate', 'sweetener', 2, 'Banned in the US since 1969; allowed in the EU with a reduced intake limit.'],
    ['953', 'Isomalt', 'sweetener', 1, POLYOL],
    ['954', 'Saccharin', 'sweetener', 2, 'Altered blood-glucose responses in some people in a 2022 controlled trial that also changed their gut bacteria (Suez et al., Cell).'],
    ['955', 'Sucralose', 'sweetener', 2, 'Impaired glucose tolerance in a 2022 controlled trial (Suez et al., Cell), and a breakdown product, sucralose-6-acetate, damaged DNA in laboratory tests (2023). Also breaks down when baked.'],
    ['957', 'Thaumatin', 'sweetener', 0, 'Sweet protein from the katemfe fruit.'],
    ['959', 'Neohesperidine DC', 'sweetener', 1, 'Derived from bitter orange.'],
    ['960', 'Steviol glycosides', 'sweetener', 1, 'Plant-derived sweetener; generally well tolerated.'],
    ['960a', 'Steviol glycosides from stevia', 'sweetener', 1, 'Plant-derived sweetener; generally well tolerated.'],
    ['961', 'Neotame', 'sweetener', 2, 'High-intensity aspartame derivative; limited independent research.'],
    ['962', 'Aspartame-acesulfame salt', 'sweetener', 2, 'Combines aspartame and acesulfame K, with the questions around both.'],
    ['964', 'Polyglycitol syrup', 'sweetener', 1, POLYOL],
    ['965', 'Maltitol', 'sweetener', 1, POLYOL + ' Raises blood sugar more than other polyols.'],
    ['966', 'Lactitol', 'sweetener', 1, POLYOL],
    ['967', 'Xylitol', 'sweetener', 1, POLYOL + ' Highly toxic to dogs. A 2024 study linked high blood levels to clotting risk (observational).'],
    ['968', 'Erythritol', 'sweetener', 2, 'A 2023 study linked high blood erythritol to heart attack and stroke, and showed a sweetened drink increased platelet clotting in volunteers (Witkowski et al., Nature Medicine).'],
    ['969', 'Advantame', 'sweetener', 1],

    // ---- modified starches, enzymes, carriers
    ['14xx', 'Modified starch', 'thickener', 1, STARCH],
    ['1404', 'Oxidised starch', 'thickener', 1, STARCH],
    ['1410', 'Monostarch phosphate', 'thickener', 1, STARCH],
    ['1412', 'Distarch phosphate', 'thickener', 1, STARCH],
    ['1413', 'Phosphated distarch phosphate', 'thickener', 1, STARCH],
    ['1414', 'Acetylated distarch phosphate', 'thickener', 1, STARCH],
    ['1420', 'Acetylated starch', 'thickener', 1, STARCH],
    ['1422', 'Acetylated distarch adipate', 'thickener', 1, STARCH],
    ['1440', 'Hydroxypropyl starch', 'thickener', 1, STARCH],
    ['1442', 'Hydroxypropyl distarch phosphate', 'thickener', 1, STARCH],
    ['1450', 'Starch sodium octenyl succinate', 'emulsifier', 1, STARCH],
    ['1451', 'Acetylated oxidised starch', 'thickener', 1, STARCH],
    ['1100', 'Amylase', 'enzyme', 0],
    ['1103', 'Invertase', 'enzyme', 0],
    ['1105', 'Lysozyme', 'preservative', 1, 'Egg-white enzyme; relevant to egg allergy.'],
    ['1200', 'Polydextrose', 'bulking agent', 1, 'Synthetic fibre; can be laxative in large amounts.'],
    ['1201', 'Polyvinylpyrrolidone', 'stabiliser', 1],
    ['1202', 'Polyvinylpolypyrrolidone', 'stabiliser', 1],
    ['1505', 'Triethyl citrate', 'carrier', 1],
    ['1518', 'Glyceryl triacetate', 'carrier', 1],
    ['1520', 'Propylene glycol', 'carrier', 1],
    ['1521', 'Polyethylene glycol', 'carrier', 1],

    /* Codes German labels use that the main list above lacked, by frequency. */
    ['375', 'Nicotinic acid (niacin)', 'vitamin', 0, 'Vitamin B3 added to fortify a product.'],
    ['917', 'Potassium iodate', 'iodine source', 0, 'The iodine in German iodised salt (Jodsalz); helps prevent iodine deficiency.'],
    ['916', 'Calcium iodate', 'iodine source', 0, 'An iodine source, like the iodate in iodised salt.'],
    ['428', 'Gelatine', 'gelling agent', 0, 'Protein from animal collagen — not vegetarian.'],
    ['150', 'Caramel colour (type not stated)', 'colour', 1, 'One of four caramel colours (E150a–d); the label does not say which.'],
    ['160', 'Carotenoids (type not stated)', 'colour', 0, 'Colours from carotenoids such as beta-carotene or paprika extract.'],
    ['161h', 'Zeaxanthin', 'colour', 0, 'A yellow carotenoid also found in maize and egg yolk.'],
    ['164', 'Saffron', 'colour', 0],
    ['1510', 'Ethanol', 'carrier', 0, 'Alcohol used as a carrier for flavourings, usually in trace amounts.'],
    ['1504', 'Ethyl acetate', 'carrier', 0],
    ['1519', 'Benzyl alcohol', 'carrier', 1],
    ['519', 'Copper sulphate', 'mineral', 1, 'A copper source used for fortification.'],
    ['931', 'Nitrogen', 'packaging gas', 0, 'Inert gas that keeps packs fresh.'],
    ['930', 'Air', 'packaging gas', 0],
    ['943b', 'Isobutane', 'propellant', 0],
    ['345', 'Magnesium citrate', 'acidity regulator', 0],
    ['329', 'Magnesium lactate', 'acidity regulator', 0],
    ['518', 'Magnesium sulphate', 'firming agent', 0],
    ['572', 'Magnesium stearate', 'anti-caking agent', 0],
    ['553', 'Magnesium silicates / talc', 'anti-caking agent', 1],
    ['505', 'Ferrous carbonate', 'acidity regulator', 0],
    ['510', 'Ammonium chloride', 'flavour', 1, 'Gives salmiak licorice its taste; harmless in normal amounts.'],
    ['641', 'L-leucine', 'flavour enhancer', 0],
    ['1001', 'Choline salts', 'emulsifier', 0],
    ['1101', 'Proteases (e.g. papain)', 'enzyme', 0],
    ['1104', 'Lipases', 'enzyme', 0],
    ['472', 'Esters of mono- and diglycerides', 'emulsifier', 1, 'Emulsifier family (E472a–f); the label does not say which.'],
    ['487', 'Sodium lauryl sulphate', 'emulsifier', 1, 'Used in dried egg white; permitted only in small amounts.'],
    ['490', 'Propylene glycol', 'carrier', 1],
    ['203', 'Calcium sorbate', 'preservative', 1, 'No longer authorised in the EU since 2018.'],
    ['216', 'Propyl paraben', 'preservative', 2, 'Removed from the EU list in 2006 over hormone-disruption concerns.'],
    ['225', 'Potassium sulphite', 'preservative', 2, SULPHITE],
    ['233', 'Thiabendazole', 'fungicide', 2, 'Fungicide on citrus and banana peel — do not zest or eat treated peel.'],
    ['311', 'Octyl gallate', 'antioxidant', 2, 'Gallates can trigger allergy and are restricted in amount.'],
    ['342', 'Ammonium phosphates', 'acidity regulator', 2, PHOSPHATE],
    ['925', 'Chlorine', 'flour treatment', 1]
  ];

  const RISK = [
    { label: 'No known risk', short: 'Safe', color: 'var(--good)' },
    { label: 'Limited risk', short: 'Limited', color: 'var(--grade-b)' },
    { label: 'Moderate risk', short: 'Moderate', color: 'var(--caution)' },
    { label: 'High risk', short: 'High', color: 'var(--bad)' }
  ];

  const BY_CODE = Object.create(null);
  ROWS.forEach(([code, name, fn, risk, note]) => {
    BY_CODE[code] = { code, e: 'E' + code, name, fn, risk, note: note || '' };
  });

  /**
   * Look up "322i", "E322", "e160a(ii)", "1442". Falls back from a specific
   * sub-form ("322i", "450iii") to its parent number ("322", "450").
   */
  function get(raw) {
    let c = String(raw || '').toLowerCase().replace(/^e/, '').replace(/[()\s]/g, '');
    if (BY_CODE[c]) return BY_CODE[c];
    const m = /^(\d{3,4})([a-z]*)$/.exec(c);
    if (!m) return null;
    // "160aii" -> "160a", "322i" -> "322", "450iii" -> "450"
    const letter = m[2].replace(/i+v?$|v$/, '');
    if (letter && BY_CODE[m[1] + letter[0]]) return BY_CODE[m[1] + letter[0]];
    if (BY_CODE[m[1]]) return BY_CODE[m[1]];
    if (/^14\d\d$/.test(m[1])) return Object.assign({}, BY_CODE['14xx'], { code: m[1], e: 'E' + m[1] });
    return null;
  }

  /** Resolve a list of codes; unknown codes are kept with risk null. */
  function resolve(codes) {
    return (codes || []).map(c => get(c) || { code: c, e: 'E' + c, name: 'E' + c, fn: 'additive', risk: null, note: '' });
  }

  return { get, resolve, RISK, ROWS, count: ROWS.length };
});
