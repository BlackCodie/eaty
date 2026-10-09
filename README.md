# Eaty — scan any food, see what it does to your body

An offline-first nutrition tracker that runs entirely in the browser and installs to the iPhone Home
Screen as a PWA. Scan a barcode and Eaty tells you how good the product really is (the Eaty Score),
every nutrient it carries, what it does to your hormones, blood sugar, heart, gut and sleep — with
the evidence behind each claim — and logs it.

No backend, no accounts, no paid APIs — just static files you can drop on GitHub Pages. Everything
you log is stored on your device in IndexedDB and never leaves it.

---

## Features

**Liquid Glass design** — built for iOS 26's look: a large title that collapses into a glass bar as
you scroll, a floating glass tab bar (Today · Diary · Plan · Insights) with a separate Scan orb,
inset floating sheets with concentric corners, capsule buttons, wide iOS-style switches and a softly
drifting ambient background. Glass is used only for floating chrome, as on iOS; content cards are a
lighter translucent material, so long lists scroll without paying for dozens of live blurs. Light
and dark themes, system haptics on iOS 18+, and sheets that rise above the on-screen keyboard.

**The product page** — what every scan and search result opens:

- **Eaty Score** (0–100, A–E) with the verdict and the reasons in plain language: "High in protein",
  "Phosphoric acid (E338) — moderate risk", "Ultra-processed", "Live cultures".
- **Nutrients** per portion or per 100 g: the full label, 21 vitamins and minerals against your
  personal targets, and active compounds (caffeine, alcohol, omega-3, EPA+DHA, nitrate, soy
  isoflavones, glycyrrhizin, glycemic load, trans fat). Estimated values are marked *est.*
- **Body** — what this portion does physiologically, grouped by system, each effect graded *strong*,
  *moderate* or *limited* evidence with its sources a tap away.
- **Ingredients** — every additive with its risk level and what the evidence says, the 14 EU
  allergens, the ingredient list, NOVA group and Nutri-Score.
- **Category rank** — "better than 82% of hazelnut spreads", against the whole German pack.
- **Better choices** — higher-scoring products of the same kind from the German pack.
- Serving chips, an amount stepper, the meal, and one Log button in a glass footer.

**Eaty Score** — a shelf-scanner rating in the spirit of Yuka and Oasis, on four pillars:

| Pillar | Weight | What counts |
|---|---|---|
| Nutrition | 55 | nutrient density per calorie, protein, fibre, sugars (free sugars for whole foods), saturated fat, salt, glycemic load |
| Additives | 20 | each of 349 E-numbers weighed by evidence-based risk: none 0, limited −4, moderate −15, high −40 |
| Processing | 15 | NOVA group |
| Ingredients | 10 | hydrogenated fat, added sugar, sweeteners, palm oil, flavourings, list length; whole grain and live cultures count in favour |

A high-risk additive (titanium dioxide, nitrites …) or partially hydrogenated fat **caps the score
at 49**. One extreme in the nutrition pillar — a soft drink's sugar, a sausage's salt — halves that
pillar, so it cannot be averaged away. Pure oils are judged on the share of their fat that is
saturated, as Nutri-Score 2023 does; sweetened drinks do not pass as sugar-free; vitamins sprayed
into an ultra-processed product count for half. Calibration: broccoli A 99, lentils A 96, oats A 89,
salmon A 87, olive oil B 72, diet cola C 62, white bread C 55, crisps D 41, cola D 36, milk
chocolate D 35, salami E 22.

**Missing data is never scored as zero** — anywhere. A criterion with no data is dropped and the rest
reweighted, and the score shows what share of the criteria it was judged on. Estimated nutrients are
never used for the score.

**Hormone map** — `js/hormones.js` shows, for any portion and for the whole day, how food moves
insulin, the fullness hormones GLP-1 and PYY, the hunger hormone ghrelin, cortisol, adrenaline,
testosterone, estrogen, the thyroid hormones, melatonin, IGF-1, aldosterone and the vitamin D
hormone — with an arrow, the reasons, the evidence grade and the sources. It reads three things:
nutrients (glycemic load, protein, fibre, free sugar, zinc, iodine, selenium, vitamin D …),
compounds (caffeine, alcohol, soy isoflavones, glycyrrhizin) and **hormone-relevant ingredients
detected in the ingredient list** — flax, mint, hops, cinnamon, ginger, turmeric, green tea, cocoa,
garlic, cabbage-family vegetables, whey and milk protein, oats and barley, oily fish and adaptogens
such as ashwagandha, fenugreek, maca and tribulus. "No effect" is reported as clearly as an effect:
soy does not lower testosterone, tribulus does not raise it.

**What it does to your body** — `js/body.js` turns a portion (or a whole day) into effects on
hormones, blood sugar, heart, gut, brain and sleep, liver, muscle, bones, thyroid, long-term risk and
medicines. Examples: caffeine and its half-life (EFSA 2015, Drake 2013), glycemic load and the
insulin spike (International GI Tables 2021), free sugar against the WHO limit, alcohol (IARC Group 1,
sleep, testosterone), soy isoflavones (meta-analyses show no effect on male hormones), licorice
raising blood pressure (100 mg/day glycyrrhizin limit), dietary nitrate lowering it, EPA+DHA,
ultra-processing (Hall 2019 NIH trial), sweeteners and emulsifiers and the gut (Suez 2022, Chassaing
2022), processed meat (IARC Group 1), phosphate additives, azo colours, fermented foods (Wastyk
2021), fibre, protein and satiety hormones, iodine and selenium for the thyroid, vitamin K and
warfarin, grapefruit and medicines. Seed oils are addressed honestly: the evidence does not support
the claims against them. Every effect lists its sources; none of it is medical advice.

**Insights** — the day's physiology against official reference amounts: caffeine (and whether the
last cup was late), free sugar, fibre, salt, saturated fat, EPA+DHA, nitrate, iodine, alcohol,
glycyrrhizin, glycemic load, protein per kg, the share of calories from ultra-processed food and the
potassium:sodium ratio. Tap any signal to see which foods drove it. Below, every food-level effect
from what you ate, merged ("Processed meat — Salami, Wiener Würstchen"). Today shows the top signals
in a "Your body today" card.

**Micronutrients for packaged food** — EU labels only have to print energy, fat, saturates, carbs,
sugars, protein and salt. Eaty finds the closest reference food (by name, including German compound
words like *Erdbeerjoghurt → joghurt*, and by macro profile), borrows the vitamins, minerals and
compounds the label leaves out and scales them by energy — cooked and dry rice differ mainly in
water, so this carries across correctly. Estimates never overwrite a declared value, are marked
*est.*, are kept out of the score, and can be switched off in Settings.

**Food diary** — breakfast / lunch / dinner / snacks, per-entry editing, duplicate, move between
meals, copy a meal or a whole day, save a meal as a recipe, exercise log, water tracking, notes.

**Supplements** — amounts **per capsule, tablet, softgel, gummy, scoop, sachet, ml, drop or spray**,
vitamins A, D and E in **IU** with the conversion done for you. **Scanning a supplement** looks it up
in a database of ~3,600 supplements sold in Germany, Austria and Switzerland (Mivolis, Altapharma,
Doppelherz, Abtei, Das Gesunde Plus, Tetesept, Sunday Natural, Centrum, Orthomol, Krüger, the
supermarket brands …) and opens the editor already filled in with what one tablet or capsule
contains, where the label lists it; for anything else, 25 one-tap templates (D3, D3 + K2,
magnesium, zinc, omega-3, B12, B complex, multivitamin, iron, calcium, folic acid, iodine,
selenium …) fill the dose in. Confirm once and every later scan of that tub logs a dose instantly.
Mark what you take daily and it becomes a stack on Today with one-tap "Take all". Micronutrient bars
split food (green) from pills (violet).

**Easy portions** — Open Food Facts' bulk data has no serving sizes, so pack products are offered
a typical portion for their kind (a yoghurt pot, a glass, a slice, a handful of crisps, a shot of
spirits) next to the whole pack and 100 g.

**Barcode scanning** — the Scan orb resolves a code against, in order: foods already on your device,
the **bundled pack of ~546,000 German supermarket products** (works with no signal),
[Open Food Facts](https://world.openfoodfacts.org) live (~4 million products, with ingredients,
additives and allergens), then USDA FoodData Central's branded set. Every GTIN encoding is tried and
the check digit validated. Scanned products are saved on the device. If a product has no nutrition
table you get a prefilled form to enter the label once.

**Nutrition database** — 386 built-in foods, each with full macros, 12 vitamins, 9 minerals
(including iodine), fibre, sugars, saturated fat, cholesterol, water — plus glycemic index and load,
free sugars, caffeine, alcohol, omega-3 and EPA+DHA, soy isoflavones, dietary nitrate, natural trans
fat and glycyrrhizin where they occur. Processed foods carry the typical additives of a German
supermarket version, labelled "typical recipe". German staples are built in and the whole database
answers to German search terms.

**Plan** — a 7-day × 4-meal planner with drag and drop, a generated shopping list grouped by aisle,
and recipes (photo, ingredients, method; nutrition per serving calculated from ingredients) — all
under one tab.

**Trends** — weight with goal line, calories vs. target, protein consistency, nutrition score and
food quality over time, training volume, body measurements. Under Insights.

**Targets** — Mifflin-St Jeor BMR × activity, adjusted for your goal; every number can be overridden.

**PWA** — installs to the Home Screen with its own icon and launch screens, runs fully offline, and
supports Home Screen quick actions (scan, log food, log weight, open the plan).

**Your data is protected** — persistent storage is requested on first run, you are reminded to export
a backup, the back gesture closes sheets without piling up history, and backups never include your
API keys.

---

## Deploying to GitHub Pages

1. Create a repository and push these files to it:

```bash
git init && git add -A && git commit -m "Eaty" && git branch -M main
```

2. Add your remote and push:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git && git push -u origin main
```

3. In the repository, open **Settings → Pages**, set **Source** to *Deploy from a branch*, pick
   `main` and the `/ (root)` folder, and save.

4. Wait about a minute, then open `https://YOUR-USERNAME.github.io/YOUR-REPO/` on your iPhone
   **in Safari** (only Safari can install to the Home Screen on iOS).

5. Tap the **Share** button → **Add to Home Screen** → **Add**.

Every path in the project is relative, so it works from a repository subpath without configuration.

> GitHub Pages serves over HTTPS, which the service worker and the camera require. Opening
> `index.html` from the filesystem (`file://`) will **not** work — use the local server below.

---

## Running locally

```bash
node serve.js
```

Then open <http://localhost:5188>. On `localhost` the service worker fetches app files network-first,
so edits show on reload; deployed builds are cache-first and update when `VERSION` in
`service-worker.js` changes (keep it in step with `package.json` — a test enforces it).

```bash
npm test
```

runs the Node test suite (92 tests) against the same modules the app ships.

---

## Project structure

```
index.html            App shell: icon sprite, header, views, glass dock and scan orb
style.css             Liquid Glass design system and every component
app.js                Bootstrap, routing and tab groups, collapsing header, back gesture,
                      keyboard handling, haptics, service worker registration
manifest.json         PWA manifest with icons and Home Screen shortcuts
service-worker.js     Offline caching
serve.js              Local development server (not used in production)

js/
  core.js             Namespace, DOM/format/date helpers, action dispatch
  store.js            IndexedDB layer with a localStorage fallback, import/export
  offmap.js           Open Food Facts interpretation shared with the pack builder:
                      categories, nutrients, ingredient flags, allergens, additive codes
  additives.js        349 E-numbers with function, risk level and evidence notes
  foods.js            Core food database and search
  foods-de.js         German staples + German search terms
  foods-extra.js      Dishes, meats, fish, produce, drinks
  foods-compounds.js  GI/GL, free sugars, caffeine, omega-3, iodine, isoflavones, nitrate,
                      licorice, typical additives for processed foods
  nutrition.js        Targets, reference intakes, nutrient maths, daily scoring
  quality.js          The Eaty Score (shared with the pack builder)
  estimate.js         Micronutrient estimates for packaged products
  body.js             Physiology effects by body system, per portion and per day, with sources
  hormones.js         The hormone map: 12 hormones, from nutrients, compounds and ingredients
  charts.js           Dependency-free SVG rings, line and bar charts
  ui.js               Sheets, action sheets, toasts, confirms
  barcode.js          BarcodeDetector when available, else ZXing
  offapi.js           Open Food Facts lookup and search
  fdcapi.js           USDA FoodData Central client
  localpack.js        The bundled German product pack and "better choices"
  foodsheet.js        Food search, custom foods, quick add
  product.js          The product page
  scanner.js          Camera scanner and the scan → lookup → product page flow
  supplements.js      Per-dose supplement editor, IU conversion, daily stack
  onboarding.js       First-run setup
  views/              today · diary · plan · recipes · insights · trends · settings

tools/
  fetch-de.js         Harvests the German market from Open Food Facts
  fetch-supplements.js  Builds the supplement database with per-dose amounts
  merge-pack.js       Carries European products over from an older pack
  reshard.js          Rewrites the pack's shards after a hash or shard-count change
  build-top.js        Builds the "better choices" and category ranking index
tests/                Node test suite
vendor/zxing.min.js   ZXing barcode decoder (MIT), loaded only on first scan
```

No build step, no bundler, no runtime dependencies.

---

## How barcode scanning works

Safari has no `BarcodeDetector`, so on iPhone the vendored ZXing decoder does the work; on Android
Chrome the native detector is used. The decoder is fetched the first time you open the scanner and
precached for offline use. The camera needs a secure origin (HTTPS or `localhost`).

Each frame alternates between a wide pass and a tighter centre-band pass, which catches barcodes held
back and held close. Every candidate is checked against its GTIN check digit, and UPC-A codes are
retried in their EAN-13 form.

### On database size

| | Source | Size | Works offline |
|---|---|---|---|
| Built in | bundled with the app | 386 foods, 40 nutrients and compounds | yes |
| **German products** | **bundled pack, `data/de/`** | **~546,000 products** | **yes** |
| Supplements | `data/de/supplements.json` | ~3,600 products, per-dose labels | yes |
| Packaged goods | Open Food Facts | ~4 million products | after first scan |
| Generic foods | USDA FoodData Central | ~600k, 100+ analysed nutrients each | after first use |

### The German product pack

`data/de/` ships **~546,000 products** for the German market:

- every product Open Food Facts lists as sold in Germany (~304,000);
- Austria-only and German-labelled products from neighbouring countries;
- every product made by a German, Austrian or Swiss company (barcode prefixes 400–440, 900–919,
  760–769) that is only listed abroad — the same EAN is very often on German shelves;
- the house brands of German retailers (Rewe and ja!, Kaufland and K-Classic, Aldi and Milsani,
  Lidl and Milbona, Edeka and Gut&Günstig, Penny, Netto, Norma, dm, Rossmann, Alnatura …) and
  ~130 national brands where they are sold across the border with the same EAN;
- dietary supplements sold in the EU.

The search API stops at 10,000 results per query, so the harvester splits the market into
barcode-prefix ranges small enough to page through completely — about 1,600 requests walk the whole
lot. **382,000** products carry a full nutrition label; the rest are kept as name-only records, so a scan
still names the product and shows its additives and processing, then offers to take the label once.
Each record carries the label nutrients, extra declared nutrients, NOVA group, Nutri-Score,
E-numbers, the 14 EU allergens, ingredient flags and the product's category.

Measured coverage: **all 1,000 of the most-scanned German products** on Open Food Facts are in the
pack (98% with nutrition); the 100 most-scanned products of ja!, Milbona, Milsani, Gut&Günstig,
REWE Beste Wahl, dmBio, Alnatura and enerBio are all there, K-Classic 98 and Penny 97 (the gaps are
products from their Czech and Romanian stores).

It is split into 160 evenly balanced shards (~130 KB gzipped each; FNV-1a with a murmur finaliser).
A lookup fetches only the shard that could contain the code, and shards are cached as you go.
**Settings → Food databases → Save the whole pack offline** pulls all of them (about 21 MB
transferred, 60 MB on disk).

**Ranking.** Every product with enough label data is scored with the Eaty Score at build time and
ranked within its Open Food Facts category (2,100+ categories, 197,000 ranked products), so the
product page can say "better than 82% of hazelnut spreads", and "better choices" are always the
same kind of product and meaningfully better.

Regenerate with `node tools/fetch-de.js` (it refuses to overwrite a good pack with a short harvest),
`node tools/merge-pack.js <old-pack-dir>` to carry over European products that dropped out of the
index, then `node tools/build-top.js`. Re-run every few months to pick up new products.

No supermarket publishes its own catalogue, so a literally complete Kaufland/Rewe/Aldi list does not
exist in any public source. Open Food Facts is the closest thing; anything missing can be added in
Eaty once and is kept with its barcode.

**FoodData Central needs a key to be useful.** The shared `DEMO_KEY` is heavily rate-limited; a free
personal key (<https://fdc.nal.usda.gov/api-key-signup.html>) goes in **Settings → Food databases**.

**Privacy:** a lookup sends only the barcode number (or your search words) to Open Food Facts or
USDA. Your diary, profile, weight and recipes are never transmitted — the app has no server.

---

## Data and backups

All data lives in IndexedDB under the origin you deploy to. **Settings → Data & backup** exports
everything as one JSON file and imports it back, merging or replacing. API keys are stripped from
exports and kept on the device when a backup is imported.

Back up periodically. Clearing Safari's website data, or deleting the app from the Home Screen,
deletes the stored data with it. Data is per-origin: moving the app to a different URL starts empty,
so export first and import after.

---

## Notes on the numbers

- Built-in values are approximated from **USDA FoodData Central** per 100 g (or 100 ml). Compound
  values (caffeine, GI, iodine, isoflavones, nitrate …) are typical figures from the International
  GI Tables, USDA and EFSA reference data; real products vary. Scanned products come from **Open
  Food Facts** (ODbL), which is crowd-sourced.
- Reference intakes use **US RDA/AI** values adjusted for age and sex; iodine uses EFSA's 150 µg.
  Body-effect thresholds come from EFSA, WHO and the cited studies.
- Energy targets use **Mifflin-St Jeor**, with a floor so the app never suggests an unsafe deficit.
- The daily nutrition score weights calories (25), protein (25), micronutrient coverage (25),
  fibre (15) and variety (10).

Eaty is a personal tracking and education tool, not medical advice. Talk to a doctor or registered
dietitian about your own health, medicines or pregnancy.
