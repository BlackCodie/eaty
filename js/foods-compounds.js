/* ==========================================================================
   foods-compounds.js — physiologically active compounds for built-in foods

   Fills the compound keys of the built-in database: the things that change
   hormones and physiology beyond plain macros and vitamins.

     gi / gl      Glycemic index (International Tables of Glycemic Index,
                  Atkinson et al.) and glycemic load per 100 g = GI x available
                  carbohydrate / 100. Load, not index, predicts the insulin
                  response, so load is what scales with portion.
     caffeine     mg     — coffee, tea, cola, energy drinks, chocolate
     alcohol      g      — ethanol (ABV x 0.789)
     iodine       ug     — fish, seafood, dairy, eggs, seaweed (varies with feed
                           and soil; dairy figures are typical for Germany)
     omega3       g      — total omega-3; epadha mg — the marine long-chain forms
     isoflavones  mg     — soy foods (USDA isoflavone database, rounded)
     nitrate      mg     — leafy and root vegetables (EFSA 2008 ranges, mid-point)
     transfat     g      — naturally occurring ruminant trans fats in dairy and meat
     freesugar    g      — sugars added, plus those in honey, syrups and juices
                           (WHO definition); sugar inside whole fruit, vegetables
                           and plain milk is not free sugar
     glycyrrhizin mg     — licorice

   Values are typical, rounded figures for a reference food — real products vary.
   ========================================================================== */
(function () {
  'use strict';

  /* Two foods that matter physiologically and were missing. */
  FoodDB.extend([
    ['Espresso', 'Drinks', [9, 0.1, 1.7, 0.2, 0, 0, 0.1, 0, 97.8, 0, 0.001, 0.18, 5.2, 0.28, 0.002, 1, 0, 0.2, 0, 0, 0, 2, 0.13, 80, 115, 14, 0.05, 0, 7], [['1 shot (30 ml)', 30], ['Double (60 ml)', 60]], 'ml', 'espresso ristretto doppio kaffee'],
    ['Licorice (Lakritz)', 'Snacks & Sweets', [375, 3.5, 85, 0.5, 1, 48, 0.1, 0, 10, 0, 0.02, 0.02, 0.2, 0.05, 0.02, 3, 0, 0, 0, 0, 0, 30, 0.4, 10, 50, 150, 0.2, 1, 40], [['1 handful (30 g)', 30], ['1 piece (8 g)', 8]], 'g', 'lakritz lakritze salmiak licorice liquorice schnecken']
  ], {});

  // The plain-coffee entry offered an espresso serving, which badly understated
  // caffeine (espresso is about five times stronger per ml). Espresso now has
  // its own entry.
  const coffee = FoodDB.byId('f-coffee-black');
  if (coffee) coffee.servings = coffee.servings.filter(s => !/espresso/i.test(s.label));

  /* Brand names people scan, so packaged products find their reference food. */
  FoodDB.extend([], {
    'f-cola': 'coca coke pepsi fritz afri',
    'f-diet-cola': 'coke zero light pepsi max',
    'f-energy-drink': 'red bull redbull monster rockstar effect energydrink',
    'f-nuss-nougat-creme': 'nutella nusspli haselnusscreme schokocreme',
    'f-trail-mix': 'nussmix studentenfutter nussmischung',
    'f-gummy-bears': 'haribo goldbären fruchtgummi weingummi',
    'f-licorice-lakritz': 'lakritzschnecken',
    'f-milk-chocolate': 'milka vollmilchschokolade schokolade ritter sport',
    'f-dark-chocolate-70-85': 'zartbitterschokolade zartbitter edelbitter feinherb',
    'f-potato-crisps-chips': 'pringles lays funny-frisch kartoffelchips',
    'f-espresso': 'kaffeebohnen',
    'f-instant-ramen-noodles': 'yum nissin instantnudeln',
    'f-ice-cream-vanilla': 'speiseeis eiscreme',
    'f-sports-drink': 'powerade gatorade isotonic',
    'f-lemonade': 'fanta sprite limo brause'
  });

  /* ------------------------------------------------------- glycemic index */
  const GI = {
    // dairy
    'milk-whole-3-25': 39, 'milk-semi-skimmed-2': 37, 'milk-skimmed': 37, 'yogurt-plain-whole-milk': 41,
    'greek-yogurt-plain-0': 35, 'greek-yogurt-plain-2': 35, 'kefir-plain-low-fat': 36, 'ice-cream-vanilla': 51,
    'condensed-milk-sweetened': 61, 'milk-powder-skimmed': 30, 'buttermilch': 35, 'skyr-natur': 30,
    'latte-with-whole-milk': 37, 'cappuccino': 37, 'hot-chocolate': 40,
    // grains, bread, potatoes
    'rice-white-cooked': 73, 'rice-brown-cooked': 68, 'basmati-rice-cooked': 58, 'pasta-cooked': 49,
    'wholewheat-pasta-cooked': 48, 'bread-white': 75, 'bread-wholemeal': 74, 'sourdough-bread': 54,
    'oats-rolled-dry': 55, 'quinoa-cooked': 53, 'potato-baked-with-skin': 85, 'sweet-potato-baked': 70,
    'couscous-cooked': 65, 'corn-tortilla': 46, 'flour-tortilla-wrap': 30, 'bagel-plain': 69, 'cornflakes': 81,
    'granola': 55, 'rice-cakes-plain': 82, 'vollkornbrot': 55, 'roggenmischbrot': 58, 'weizenbrotchen': 73,
    'vollkornbrotchen': 62, 'pumpernickel': 41, 'laugenbrezel': 83, 'zwieback': 70, 'spatzle-gekocht': 50,
    'kartoffelklo-e': 70, 'maultaschen': 50, 'musli-fruchte': 57, 'bulgur-cooked': 48, 'pearl-barley-cooked': 28,
    'millet-cooked': 71, 'buckwheat-cooked': 50, 'polenta-cornmeal-cooked': 68, 'egg-noodles-cooked': 40,
    'instant-ramen-noodles': 47, 'rice-noodles-cooked': 53, 'pita-bread': 57, 'naan-bread': 71, 'baguette': 95,
    'ciabatta': 70, 'rye-crispbread': 63, 'muesli-no-added-sugar': 49, 'wheat-bran': 42, 'wheat-flour-white': 70,
    'wholemeal-flour': 70, 'breadcrumbs': 70, 'pancake': 66, 'waffle': 76, 'crepe': 66,
    'kartoffelsalat': 56, 'bratkartoffeln': 70, 'pommes-frites': 63,
    // legumes, nuts
    'lentils-cooked': 32, 'chickpeas-cooked': 28, 'black-beans-cooked': 30, 'kidney-beans-cooked': 24,
    'baked-beans-in-tomato-sauce': 40, 'hummus': 6, 'split-peas-cooked': 32, 'butter-beans-lima-cooked': 31,
    'cannellini-beans-cooked': 31, 'broad-beans-fava-cooked': 79, 'falafel': 32, 'tempeh': 15, 'peanut-butter': 14,
    'peanuts': 14, 'cashews': 22, 'peas-green-cooked': 51, 'sweetcorn-cooked': 52,
    // vegetables
    'carrot-raw': 39, 'beetroot-cooked': 64, 'parsnip': 52, 'butternut-squash-cooked': 51, 'pumpkin-cooked': 64,
    // fruit
    'banana': 51, 'apple-with-skin': 36, 'orange': 43, 'blueberries': 53, 'strawberries': 40, 'raspberries': 32,
    'blackberries': 25, 'grapes': 59, 'mango': 51, 'pineapple': 59, 'watermelon': 76, 'kiwi': 50, 'peach': 42,
    'pear': 38, 'cherries-sweet': 22, 'dates-medjool': 42, 'raisins': 64, 'apricot': 34, 'plum': 39,
    'nectarine': 43, 'fig-fresh': 50, 'figs-dried': 61, 'pomegranate': 35, 'papaya': 59, 'passion-fruit': 30,
    'lychee': 50, 'cranberries-dried': 64, 'prunes': 29, 'apricots-dried': 30, 'grapefruit': 25,
    'mandarin-clementine': 47, 'lemon': 20, 'lime': 20,
    // sweets and snacks
    'dark-chocolate-70-85': 23, 'milk-chocolate': 43, 'honey': 61, 'sugar-white': 65, 'potato-crisps-chips': 56,
    'popcorn-air-popped': 65, 'croissant': 67, 'digestive-biscuit': 59, 'protein-bar': 30, 'cereal-bar': 70,
    'brownie': 42, 'blueberry-muffin': 59, 'glazed-doughnut': 76, 'apple-pie': 44, 'chocolate-chip-cookie': 55,
    'pretzels-hard': 83, 'tortilla-chips': 63, 'salted-crackers': 74, 'gummy-bears': 78, 'marshmallows': 62,
    'trail-mix': 30, 'cheesecake': 33, 'nuss-nougat-creme': 33, 'marmelade-konfiture': 51, 'lebkuchen': 65,
    'licorice-lakritz': 78,
    // prepared dishes
    'pizza-margherita': 60, 'pizza-salami': 60, 'cheeseburger': 66, 'hamburger-plain': 66, 'chicken-nuggets': 46,
    'fish-and-chips': 60, 'lasagne-beef': 47, 'spaghetti-bolognese': 52, 'macaroni-cheese': 64, 'fried-rice': 70,
    'sushi-roll-california': 52, 'pad-thai': 55, 'burrito-beef-and-bean': 39, 'taco-beef': 50,
    'chicken-shawarma-gyros': 60, 'ramen-soup-with-pork': 50, 'tomato-soup': 38, 'chicken-noodle-soup': 45,
    'lentil-soup': 44, 'quiche-lorraine': 55, 'spring-roll-vegetable': 50, 'fish-fingers-baked': 38,
    'schweineschnitzel-paniert': 50, 'doner-kebab-mit-fladenbrot': 60, 'currywurst-mit-so-e': 55,
    // drinks and condiments
    'orange-juice': 50, 'apple-juice': 41, 'cola': 63, 'energy-drink': 68, 'sports-drink': 78, 'lemonade': 63,
    'berry-smoothie': 40, 'apfelschorle': 41, 'oat-milk': 69, 'gluhwein': 60, 'ketchup': 55, 'bbq-sauce': 60,
    'tomato-passata': 38, 'sun-dried-tomatoes': 35, 'whey-protein-powder': 30, 'casein-protein-powder': 30
  };
  /* Residual "carbohydrate by difference" in these is not sugar or starch. */
  const NO_GLYCEMIC = new Set(['espresso', 'coffee-black', 'tea-black-brewed', 'green-tea-brewed', 'parmesan-grated', 'feta-cheese', 'cream-cheese', 'beef-liver-cooked',
    'mussels-cooked', 'octopus-cooked', 'scallops-cooked', 'mascarpone', 'sour-cream', 'squid-calamari-cooked']);
  const DEFAULT_GI = {
    'Vegetables': 30, 'Fruit': 45, 'Legumes & Soy': 30, 'Nuts & Seeds': 20, 'Dairy & Eggs': 35,
    'Grains & Bread': 65, 'Snacks & Sweets': 60, 'Drinks': 55, 'Condiments': 45, 'Meat & Poultry': 45,
    'Fish & Seafood': 45, 'Fats & Oils': 0, 'Supplements': 30
  };

  /* --------------------------------------------------------- free sugars */
  const FREE_ALL = new Set(['honey', 'sugar-white', 'cola', 'lemonade', 'orange-juice', 'apple-juice',
    'berry-smoothie', 'energy-drink', 'sports-drink', 'apfelschorle', 'marmelade-konfiture', 'gummy-bears',
    'marshmallows', 'nuss-nougat-creme', 'bbq-sauce', 'cornflakes', 'cereal-bar', 'protein-bar',
    'digestive-biscuit', 'chocolate-chip-cookie', 'lebkuchen', 'dark-chocolate-70-85', 'glazed-doughnut',
    'brownie', 'blueberry-muffin', 'hot-sauce-sriracha', 'licorice-lakritz', 'gluhwein', 'croissant']);
  /* sugar minus the intrinsic part (lactose, fruit, tomato) in g per 100 g */
  const INTRINSIC = {
    'ice-cream-vanilla': 6, 'hot-chocolate': 4.5, 'latte-with-whole-milk': 99, 'cappuccino': 99,
    'milk-chocolate': 8, 'cheesecake': 4, 'ketchup': 4, 'tomato-soup': 3, 'granola': 5, 'musli-fruchte': 10,
    'pancake': 2, 'waffle': 2, 'crepe': 2, 'apple-pie': 5, 'condensed-milk-sweetened': 12,
    'cranberries-dried': 12, 'ranch-dressing': 1.5, 'curry-paste': 2, 'sushi-roll-california': 1.5,
    'pad-thai': 2, 'trail-mix': 17, 'quiche-lorraine': 2, 'pizza-margherita': 2.5, 'pizza-salami': 2.5
  };
  const NO_FREE = new Set(['muesli-no-added-sugar', 'balsamic-vinegar', 'salsa', 'tomato-passata', 'pesto-basil',
    'whey-protein-powder', 'casein-protein-powder', 'diet-cola', 'sun-dried-tomatoes']);

  function freeSugar(f, id) {
    const s = f.n.sugar || 0;
    if (s <= 0 || NO_FREE.has(id)) return 0;
    if (FREE_ALL.has(id)) return s;
    if (INTRINSIC[id] !== undefined) return Math.max(0, s - INTRINSIC[id]);
    if (f.cat === 'Snacks & Sweets') return s;
    // Most bread and pastry dough has some sugar added.
    if (f.cat === 'Grains & Bread' && /bread|brot|bagel|naan|pita|baguette|ciabatta|brezel|zwieback|tortilla|wrap|waffle|pancake|crepe|croissant|muffin|breadcrumb/.test(id)) {
      return s * 0.6;
    }
    if (f.cat === 'Drinks') return s;
    if (f.cat === 'Condiments') return s * 0.5;
    return 0;                      // whole foods: fruit, vegetables, plain dairy, grains, legumes, nuts, meat
  }

  /* ------------------------------------------------------- compounds */
  const C = {
    // caffeine (mg) and alcohol (g)
    'coffee-black': { caffeine: 40 }, 'espresso': { caffeine: 212 }, 'tea-black-brewed': { caffeine: 20 },
    'green-tea-brewed': { caffeine: 12 }, 'cola': { caffeine: 10 }, 'diet-cola': { caffeine: 12 },
    'energy-drink': { caffeine: 32 }, 'dark-chocolate-70-85': { caffeine: 80 }, 'milk-chocolate': { caffeine: 20 },
    'latte-with-whole-milk': { caffeine: 21 }, 'cappuccino': { caffeine: 35 }, 'hot-chocolate': { caffeine: 2 },
    'brownie': { caffeine: 5 }, 'chocolate-chip-cookie': { caffeine: 3 }, 'nuss-nougat-creme': { caffeine: 3 },
    'beer-regular': { alcohol: 3.9 }, 'wine-red': { alcohol: 10.6 }, 'weizenbier-hefeweizen': { alcohol: 4.2 },
    'gluhwein': { alcohol: 7.9 }, 'whisky-vodka-gin-40': { alcohol: 31.6 }, 'sparkling-wine-sekt': { alcohol: 9.5 },

    // fish and seafood: omega-3 (g), EPA+DHA (mg), iodine (ug)
    'salmon-atlantic-cooked': { omega3: 2.6, epadha: 2150, iodine: 14 },
    'tuna-canned-in-water': { omega3: 0.3, epadha: 270, iodine: 10 },
    'cod-cooked': { omega3: 0.2, epadha: 160, iodine: 110 },
    'shrimp-cooked': { omega3: 0.35, epadha: 300, iodine: 15 },
    'sardines-canned-in-oil': { omega3: 1.5, epadha: 980, iodine: 35 },
    'tilapia-cooked': { omega3: 0.2, epadha: 130, iodine: 4 },
    'mackerel-cooked': { omega3: 1.4, epadha: 1200, iodine: 50 },
    'tuna-steak-cooked': { omega3: 0.3, epadha: 280, iodine: 15 },
    'trout-cooked': { omega3: 1.2, epadha: 1150, iodine: 4 },
    'herring-pickled': { omega3: 1.0, epadha: 700, iodine: 30 },
    'anchovies-canned': { omega3: 2.1, epadha: 2050, iodine: 30 },
    'squid-calamari-cooked': { omega3: 0.6, epadha: 500, iodine: 60 },
    'mussels-cooked': { omega3: 0.8, epadha: 780, iodine: 120 },
    'octopus-cooked': { omega3: 0.3, epadha: 310, iodine: 50 },
    'sea-bass-cooked': { omega3: 0.8, epadha: 760, iodine: 30 },
    'haddock-cooked': { omega3: 0.25, epadha: 230, iodine: 140 },
    'pollock-cooked': { omega3: 0.55, epadha: 540, iodine: 55 },
    'smoked-salmon': { omega3: 0.5, epadha: 450, iodine: 14 },
    'crab-meat-cooked': { omega3: 0.4, epadha: 370, iodine: 60 },
    'scallops-cooked': { omega3: 0.2, epadha: 200, iodine: 90 },
    'fish-fingers-baked': { omega3: 0.2, epadha: 150, iodine: 60 },
    'fish-and-chips': { omega3: 0.15, epadha: 100, iodine: 40 },
    'nori-seaweed': { iodine: 1800 },

    // plant omega-3 (ALA)
    'walnuts': { omega3: 9.1 }, 'chia-seeds': { omega3: 17.8 }, 'flaxseed-ground': { omega3: 22.8 },
    'hemp-seeds': { omega3: 8.7 }, 'rapeseed-canola-oil': { omega3: 9.1 }, 'olive-oil': { omega3: 0.76 },
    'mayonnaise': { omega3: 4.0 }, 'pecans': { omega3: 1.0 }, 'spinach-raw': { omega3: 0.14, nitrate: 250 },

    // soy: isoflavones (mg) and ALA
    'tofu-firm': { isoflavones: 23, omega3: 0.6 }, 'tempeh': { isoflavones: 60 },
    'edamame-cooked': { isoflavones: 18, omega3: 0.4 }, 'soy-milk-unsweetened': { isoflavones: 9 },
    'soy-yogurt': { isoflavones: 8 }, 'soy-mince-cooked': { isoflavones: 50 }, 'soy-sauce': { isoflavones: 1.6 },
    'vegan-burger-patty': { isoflavones: 10 },

    // dairy and eggs: iodine (ug), natural trans fat (g)
    'milk-whole-3-25': { iodine: 18, transfat: 0.1 }, 'milk-semi-skimmed-2': { iodine: 18 },
    'milk-skimmed': { iodine: 18 }, 'yogurt-plain-whole-milk': { iodine: 20 },
    'greek-yogurt-plain-0': { iodine: 25 }, 'greek-yogurt-plain-2': { iodine: 25 },
    'cottage-cheese-2': { iodine: 15 }, 'kefir-plain-low-fat': { iodine: 18 }, 'magerquark': { iodine: 25 },
    'speisequark-20': { iodine: 20 }, 'speisequark-40': { iodine: 20, transfat: 0.4 }, 'skyr-natur': { iodine: 25 },
    'buttermilch': { iodine: 15 }, 'frischkase-doppelrahmstufe': { iodine: 15, transfat: 0.8 },
    'cheddar-cheese': { iodine: 30, transfat: 1.1 }, 'mozzarella-part-skim': { iodine: 20, transfat: 0.5 },
    'parmesan-grated': { iodine: 30, transfat: 0.9 }, 'feta-cheese': { iodine: 20, transfat: 0.6 },
    'gouda-mittelalt': { iodine: 30, transfat: 1.0 }, 'emmentaler': { iodine: 25, transfat: 1.0 },
    'butterkase': { iodine: 25, transfat: 0.9 }, 'camembert': { iodine: 20, transfat: 0.8 },
    'harzer-kase': { iodine: 15 }, 'cream-cheese': { iodine: 15, transfat: 1.0 },
    'butter': { iodine: 4, transfat: 3.0 }, 'ghee-clarified-butter': { transfat: 3.9 },
    'schlagsahne-30': { iodine: 8, transfat: 1.0 }, 'schmand-24': { iodine: 10, transfat: 0.8 },
    'sour-cream': { iodine: 10, transfat: 0.6 }, 'mascarpone': { transfat: 1.3 },
    'ice-cream-vanilla': { iodine: 15, transfat: 0.3 },
    'egg-whole-raw': { iodine: 50, omega3: 0.1, epadha: 40 }, 'egg-white-raw': { iodine: 6 },
    'egg-yolk-raw': { iodine: 110, omega3: 0.3, epadha: 115 }, 'egg-boiled': { iodine: 50, omega3: 0.1, epadha: 40 },
    'egg-fried': { iodine: 50, omega3: 0.1, epadha: 40 }, 'scrambled-egg': { iodine: 40, omega3: 0.1, epadha: 30 },

    // meat: natural trans fat (g)
    'beef-mince-90-lean-cooked': { transfat: 0.6 }, 'beef-mince-80-lean-cooked': { transfat: 1.0 },
    'ribeye-steak-cooked': { transfat: 1.0 }, 'beef-brisket-cooked': { transfat: 0.9 }, 'lamb-cooked': { transfat: 1.2 },

    // high-nitrate vegetables (mg) — these raise nitric oxide and lower blood pressure
    'rocket-arugula': { nitrate: 480 }, 'lettuce-romaine': { nitrate: 150 }, 'iceberg-lettuce': { nitrate: 75 },
    'beetroot-cooked': { nitrate: 140 }, 'celery': { nitrate: 150 }, 'swiss-chard': { nitrate: 200 },
    'bok-choy': { nitrate: 100 }, 'radieschen': { nitrate: 170 }, 'fennel': { nitrate: 150 }, 'leek': { nitrate: 75 },
    'cabbage-raw': { nitrate: 70 }, 'kale-raw': { nitrate: 120 }, 'celeriac': { nitrate: 110 },
    'watercress': { nitrate: 200 }, 'feldsalat': { nitrate: 200 }, 'kohlrabi': { nitrate: 100 },
    'rotkohl': { nitrate: 50 }, 'grunkohl-gekocht': { nitrate: 100 }, 'courgette-zucchini': { nitrate: 70 },
    'brussels-sprouts-cooked': { nitrate: 50 }, 'parsnip': { nitrate: 40 }, 'pumpkin-cooked': { nitrate: 40 },

    // licorice
    'licorice-lakritz': { glycyrrhizin: 200 }
  };

  /* ------------------------------------------- typical additives & flags */
  /* What a typical German supermarket version of these contains. Shown in the
     app as "typical recipe" — a scanned product always uses its own label. */
  const TYPICAL = {
    'cola': ['150d 338', 'ADDED_SUGAR CAFFEINE'],
    'diet-cola': ['150d 338 331 951 950', 'SWEETENER CAFFEINE'],
    'energy-drink': ['330 331 500 150c', 'ADDED_SUGAR CAFFEINE FLAVOURING'],
    'sports-drink': ['330 331', 'ADDED_SUGAR FLAVOURING'],
    'lemonade': ['330', 'ADDED_SUGAR FLAVOURING'],
    'hot-chocolate': ['', 'ADDED_SUGAR FLAVOURING'],
    'milk-chocolate': ['322', 'ADDED_SUGAR FLAVOURING'],
    'dark-chocolate-70-85': ['322', 'ADDED_SUGAR'],
    'nuss-nougat-creme': ['322', 'ADDED_SUGAR PALM FLAVOURING'],
    'ice-cream-vanilla': ['471 410 412', 'ADDED_SUGAR FLAVOURING'],
    'margarine': ['471 322 160a 330', 'PALM'],
    'mayonnaise': ['330 385', 'ADDED_SUGAR SEED_OIL'],
    'ketchup': ['', 'ADDED_SUGAR'],
    'bbq-sauce': ['415 150d 211', 'ADDED_SUGAR FLAVOURING'],
    'ranch-dressing': ['415 385 621', 'FLAVOURING SEED_OIL'],
    'bratwurst-gebraten': ['451 301 331', ''],
    'wiener-wurstchen': ['250 451 301', ''],
    'leberkase': ['250 451 301', ''],
    'fleischwurst': ['250 451 301', ''],
    'mortadella': ['250 451 301', ''],
    'salami': ['250 252 301', ''],
    'chorizo': ['250 252 301', ''],
    'ham-sliced': ['250 451 301', ''],
    'kochschinken': ['250 451 301', ''],
    'schwarzwalder-schinken': ['250 301', ''],
    'bacon-cooked': ['250 301', ''],
    'beef-jerky': ['250', 'ADDED_SUGAR'],
    'currywurst-mit-so-e': ['250 451 301 1422', 'ADDED_SUGAR'],
    'pizza-salami': ['250 301', ''],
    'cheeseburger': ['452 331 282', 'ADDED_SUGAR'],
    'instant-ramen-noodles': ['621 627 631 451 501', 'PALM FLAVOURING'],
    'chicken-nuggets': ['450 500 1422', 'FLAVOURING SEED_OIL'],
    'glazed-doughnut': ['450 500 471 322', 'ADDED_SUGAR PALM'],
    'croissant': ['471 300', 'ADDED_SUGAR'],
    'gummy-bears': ['330 901 903', 'ADDED_SUGAR FLAVOURING'],
    'marshmallows': ['330', 'ADDED_SUGAR FLAVOURING'],
    'licorice-lakritz': ['153 903', 'ADDED_SUGAR LICORICE'],
    'protein-bar': ['422 322 955', 'SWEETENER FLAVOURING'],
    'cereal-bar': ['322 471', 'ADDED_SUGAR FLAVOURING'],
    'cornflakes': ['', 'ADDED_SUGAR'],
    'granola': ['', 'ADDED_SUGAR'],
    'digestive-biscuit': ['500 503', 'ADDED_SUGAR PALM'],
    'chocolate-chip-cookie': ['500 322', 'ADDED_SUGAR PALM FLAVOURING'],
    'brownie': ['322 500 471', 'ADDED_SUGAR'],
    'blueberry-muffin': ['450 500 471 202', 'ADDED_SUGAR FLAVOURING'],
    'cheesecake': ['407 1442', 'ADDED_SUGAR'],
    'lebkuchen': ['503 500', 'ADDED_SUGAR'],
    'pancake': ['450 500', 'ADDED_SUGAR'],
    'waffle': ['450 500', 'ADDED_SUGAR'],
    'pretzels-hard': ['524', ''],
    'laugenbrezel': ['524', ''],
    'salted-crackers': ['500 503', 'PALM'],
    'whey-protein-powder': ['322 955', 'SWEETENER FLAVOURING'],
    'casein-protein-powder': ['322 955', 'SWEETENER FLAVOURING'],
    'vegan-burger-patty': ['461', 'FLAVOURING'],
    'soy-yogurt': ['', 'ADDED_SUGAR']
  };

  /* ---------------------------------------------------------- apply */
  const map = {};
  const add = (id, k, v) => { (map['f-' + id] = map['f-' + id] || {})[k] = v; };
  Object.keys(C).forEach(id => Object.keys(C[id]).forEach(k => add(id, k, C[id][k])));
  FoodDB.enrich(map);

  FoodDB.all().forEach(f => {
    if (!f.builtin) return;
    const id = f.id.replace(/^f-/, '');
    const avail = Math.max(0, (f.n.carbs || 0) - (f.n.fiber || 0));
    let gi = GI[id];
    if (gi === undefined) gi = NO_GLYCEMIC.has(id) || avail < 1 ? 0 : (DEFAULT_GI[f.cat] || 45);
    f.gi = gi;
    f.giEstimated = GI[id] === undefined && gi > 0;
    f.n.gl = Math.round(gi * avail) / 100;
    f.n.freesugar = Math.round(freeSugar(f, id) * 10) / 10;
  });

  const FL = (window.OffMap && OffMap.FLAG) || {};
  Object.keys(TYPICAL).forEach(id => {
    const f = FoodDB.byId('f-' + id);
    if (!f) { console.warn('[compounds] typical recipe for unknown id:', id); return; }
    const [codes, flags] = TYPICAL[id];
    f.additiveCodes = codes ? codes.split(' ') : [];
    f.additives = f.additiveCodes.length;
    f.flags = flags ? flags.split(' ').reduce((m, k) => m | (FL[k] || 0), 0) : 0;
    f.typical = true;
  });

  /** Ids the compound tables reference, so tests can catch typos. */
  FoodDB.COMPOUND_IDS = Object.keys(TYPICAL).concat(Object.keys(C)).concat(Object.keys(GI), Object.keys(INTRINSIC), Array.from(FREE_ALL));
})();
