# Eaty — personal nutrition tracker

A complete, offline-first nutrition tracker that runs entirely in the browser and installs to the
iPhone Home Screen as a PWA. No backend, no database, no accounts, no paid APIs — just static files
you can drop on GitHub Pages.

Everything you log is stored on your device in IndexedDB and never leaves it.

---

## Features

**Dashboard** — calorie ring with remaining budget, macro progress, 20 micronutrients, a 0–100
nutrition score with per-component breakdown, a calorie-weighted food-quality grade for the day,
logging streak, water, and a 7-day calorie chart.

**Food quality rating** — every food gets a 0–100 score and an A–E grade from eight weighted
criteria: nutrient density per calorie (20), sugars (16), processing level (14), saturated fat (12),
fibre (12), protein (10), salt (10) and additives (6). Grades appear beside every search result, in
full breakdown on the food screen, and averaged by calories across your day.

Processing uses the NOVA classification and additive counts from Open Food Facts; drinks are judged
on beverage thresholds rather than solid-food ones; sugar in whole fruit, veg and plain dairy is
treated as intrinsic. Calibration examples: broccoli A 98, lentils A 93, salmon A 80, oats B 75,
white bread C 58, crisps D 48, cola E 31, Nutella E 22.

**Missing data is never scored as zero** — anywhere. If a label does not publish a figure, that
criterion is dropped and the rest are reweighted, and the rating shows what share of the criteria it
could be judged on. The same rule governs the daily micronutrient score, which is measured against
the share of your calories that actually carries vitamin data and tells you what that share is.

**Food diary** — breakfast / lunch / dinner / snacks, per-entry editing, duplicate, move between
meals, copy a meal or a whole day from any other date, save a meal as a recipe, exercise log,
water tracking, and daily notes.

**Supplements** — a proper editor that speaks the language on the tub: amounts **per capsule,
tablet, softgel, gummy, scoop, sachet, ml, drop or spray**, not per 100 g, and vitamins A, D and E
can be entered in **IU** with the conversion done for you (2000 IU of D3 → 50 µg). Mark what you
take daily and it becomes a stack on Today with a one-tap "Take all"; attach the barcode and
scanning the tub logs a dose immediately with no portion screen.

Supplements count towards your micronutrient targets, and the micronutrient bars split what came
from food (green) from what came from a pill (violet), so you can see whether you are actually
eating a nutrient or just supplementing it. They are deliberately not given a food-quality grade —
rating a vitamin D capsule on fibre and sugar would be meaningless.

**Barcode scanning** — point the camera at a product barcode and it is resolved against, in order:
foods already on your device, the **bundled pack of ~117,000 German supermarket products** (works
with no signal), [Open Food Facts](https://world.openfoodfacts.org) live (~4 million products), then
USDA FoodData Central's branded set.
Every GTIN encoding of the code is tried, and the check digit is validated before anything is
accepted. Scanned products are written to your device, so the second scan works instantly and
offline. If a product exists but has no nutrition table, you get a prefilled form to enter the
label once — it is then attached to that barcode forever.

**Nutrition database** — 384 built-in foods across 13 categories, each with full macros *and*
12 vitamins, 8 minerals, fibre, sugars, saturated fat, cholesterol and water content. Covers whole
foods, German staples, and the prepared dishes people actually log — pizza, burgers, lasagne,
gyros, sushi, curries, soups. Multiple named servings per food ("1 large egg", "1 Scheibe (45 g)").
Online, the Products tab searches Open Food Facts and FoodData Central together.

**German** — 54 German staples are built in (Magerquark, Skyr, Vollkornbrot, Brötchen, Bratwurst,
Leberkäse, Spätzle, Maultaschen, Sauerkraut, Rotkohl, Harzer Käse, Laugenbrezel, Apfelschorle …),
and the whole English database also answers to German search terms — *Hähnchen*, *Reis*, *Zwiebel*,
*Kürbiskerne*, *Erdnussbutter* all find the right food, with or without umlauts, entirely offline.

**Recipes** — photo, ingredients, method, servings, cook time, and 10 categories. Nutrition per
serving is calculated from the ingredients automatically, right down to the micronutrients. Log a
recipe into the diary in one tap, or add it to the meal plan.

**Meal planner** — a 7-day × 4-meal grid. Drag meals between slots, copy a day or a whole week,
log a planned day straight into the diary, and generate a shopping list that combines duplicate
ingredients, converts to kg/L, and groups items by aisle with checkboxes.

**Trends** — weight chart with goal line and progress bar, calories vs. target, protein
consistency with hit rate, nutrition score over time, training volume, and body measurements
(waist, chest, hips, arm, thigh, body fat) with sparklines.

**Targets** — Mifflin-St Jeor BMR × activity multiplier, adjusted for your goal (lose fat,
maintain, gain muscle, eat better). Protein scales with body weight; fibre and water scale with
intake. Every number can be overridden manually.

**PWA** — installs to the Home Screen with its own icon and launch screens, runs fully offline via
a service worker, and supports Home Screen quick actions (scan, log food, log weight, open the plan).

**Your data is protected** — the app requests persistent storage on first run so iOS is less likely
to sweep it away, and reminds you to export a backup if you have never made one or the last is over
a month old. Snoozing that reminder never pretends a backup happened. Scanned products that go
unused for four months are pruned so the food index stays fast.

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
   **in Safari** (not Chrome — only Safari can install to the Home Screen on iOS).

5. Tap the **Share** button → **Add to Home Screen** → **Add**.

Every path in the project is relative, so it works from a repository subpath without configuration.
Serving from a custom domain or the repository root works too.

> GitHub Pages serves over HTTPS, which the service worker requires. Opening `index.html` directly
> from the filesystem (`file://`) will **not** work — use the local server below.

---

## Running locally

```bash
node serve.js
```

Then open <http://localhost:5188>. Any static server works — `python -m http.server 5188` is
equivalent. `serve.js` is a development convenience only; GitHub Pages does not use it.

**While developing:** the service worker caches aggressively by design. After editing a file, bump
`VERSION` in `service-worker.js`, or unregister the worker in Safari/Chrome devtools, otherwise you
will keep seeing the cached build.

---

## Project structure

```
index.html            App shell, icon sprite, PWA meta tags
style.css             Design system and every component
app.js                Bootstrap, routing, theming, service worker registration
manifest.json         PWA manifest with icons and Home Screen shortcuts
service-worker.js     Offline caching (network-first navigations, cache-first assets)
serve.js              Local development server (not used in production)

js/
  core.js             Namespace, DOM/format/date helpers, action dispatch
  store.js            IndexedDB layer with a localStorage fallback
  foods.js            Core food database (147 foods, 29 nutrients each)
  foods-de.js         54 German staples + German search terms for the rest
  foods-extra.js      183 more foods: dishes, meats, fish, produce, drinks
  nutrition.js        Targets, reference intakes, nutrient maths, daily scoring
  quality.js          Per-food A-E quality rating (shared with the pack builder)
  charts.js           Dependency-free SVG rings, line and bar charts
  ui.js               Bottom sheets, action sheets, toasts, confirms
  barcode.js          BarcodeDetector when available, else ZXing
  offapi.js           Open Food Facts lookup, search, unit mapping, caching
  fdcapi.js           USDA FoodData Central client (generic foods, full micros)
  foodsheet.js        Food search, portion picker, custom foods, quick add
  scanner.js          Camera scanner UI and the scan → lookup → log flow
  supplements.js      Per-dose supplement editor, IU conversion, daily stack
  onboarding.js       First-run setup wizard
  views/              today · diary · recipes · plan · trends · settings

vendor/
  zxing.min.js        ZXing barcode decoder (MIT), loaded only on first scan
icons/                App icons (96–512px, plus maskable)
splash/               iOS launch images for 9 device sizes
```

No build step, no bundler, no npm install. Edit a file, reload, done. ZXing is vendored as a
single pre-built file rather than a dependency.

---

## How barcode scanning works

Safari has no `BarcodeDetector`, so on iPhone the vendored ZXing decoder does the work; on Android
Chrome the native detector is used instead. The 328 KB decoder is fetched only the first time you
open the scanner, and the service worker precaches it so scanning also works with no connection.

The camera needs a secure origin — GitHub Pages is HTTPS, so it works there and on `localhost`, but
not over plain `http://`. iOS grants camera access to Home Screen web apps from iOS 14.3 onward.

Each frame alternates between a wide pass and a tighter high-resolution centre-band pass, which
catches barcodes both held back and held close. Every candidate is checked against its GTIN check
digit before being accepted, so a misread cannot log the wrong product. UPC-A codes are retried in
their EAN-13 form automatically.

### On database size

MyFitnessPal carries roughly 20 million entries on its own servers. A static site cannot bundle
that, and most of it is unverified duplicates anyway. What matters is whether a barcode resolves,
so Eaty splits the problem:

| | Source | Size | Works offline |
|---|---|---|---|
| Built in | bundled with the app | 384 foods, all 29 nutrients | yes |
| **German products** | **bundled pack, `data/de/`** | **~117,000 products** | **yes** |
| Packaged goods | Open Food Facts | ~4 million products | after first scan |
| Generic foods | USDA FoodData Central | ~600k, 100+ analysed nutrients each | after first use |

### The German product pack

`data/de/` ships ~117,000 German retail products harvested from Open Food Facts — Rewe and ja!,
Kaufland and K-Classic, Aldi and Milsani, Lidl and Milbona, Edeka and Gut&Günstig, Penny, Netto,
Norma, dm, Alnatura, Rossmann, plus the national brands (Dr. Oetker, Ritter Sport, Haribo, Milka,
Ferrero, Müller, Ehrmann, Kölln, Iglo, Frosta, Knorr, Maggi and many more).

It is split into 96 shards of about 40 KB gzipped each. A barcode lookup fetches only the one shard
that could contain it — typically 6–10 ms — and the shards are cached as you go. **Settings → Food
databases → Save the whole pack offline** pulls all 96 (about 3.9 MB transferred, 10 MB on disk) so
scanning keeps working with no signal at all, which is the normal state of affairs in a supermarket
aisle.

Measured coverage against Open Food Facts itself: **98%** of the 500 most-scanned German products
are in the pack (the handful of misses are French items mis-tagged as German), falling to ~39% for
the obscure long tail — and those still resolve through the live lookup when you have signal.

Regenerate it with the harvester in `tools/fetch-de.js` (`node tools/fetch-de.js`) — it pages
through Open Food Facts' search API by brand and by popularity, and rewrites `data/de/`. Re-run it
every few months to pick up new products.

No supermarket publishes its own catalogue, so a literally complete Kaufland/Rewe/Aldi product list
does not exist in any public source. Open Food Facts is the closest thing, and it is crowd-sourced:
if you scan something it does not have, adding the label in Eaty stores it for you permanently, and
adding it on openfoodfacts.org puts it in the next pack for everyone.

The pack carries the EU-mandatory label only (energy, protein, carbohydrate, sugars, fat, saturated
fat, fibre, salt/sodium) because that is all packaging declares. Micronutrients come from the
built-in foods and from FoodData Central.

**FoodData Central needs a key to be useful.** It ships with the shared `DEMO_KEY`, which is capped
at roughly 30 lookups an hour across every user of it, so it will usually be rate-limited. Getting
a personal key takes about a minute and is free — <https://fdc.nal.usda.gov/api-key-signup.html> —
and it goes in **Settings → Food databases**, where there is a "Test key" button. Open Food Facts
needs no key and is unaffected.

**Privacy:** a lookup sends only the barcode number (or your search words) to Open Food Facts.
Your diary, profile, weight and recipes are never transmitted — the app has no server of its own.
If you would rather stay fully offline, skip the scanner and use the built-in database; and note
that a product you enter yourself with its barcode attached will be found by future scans without
any network call.

**A caveat worth knowing:** EU labels only have to declare energy, fat, saturated fat, carbohydrate,
sugars, protein and salt. Most scanned products therefore have no vitamin or mineral data, and the
app says so on the product screen rather than pretending the values are zero. Whole foods from the
built-in database are what carry the micronutrient detail.

---

## Data and backups

All data lives in IndexedDB under the origin you deploy to. **Settings → Data & backup** exports
everything as a single JSON file and imports it back, either merging with or replacing what is
already there.

Back up periodically. Clearing Safari's website data, or deleting the app from the Home Screen,
deletes the stored data with it. Data is also per-origin: moving the app to a different URL starts
from an empty database, so export first and import after.

---

## Notes on the numbers

- Built-in nutrition values are approximated from **USDA FoodData Central**, per 100 g (or 100 ml
  for drinks). Scanned products come from **Open Food Facts** (Open Database License), which is
  crowd-sourced — the data is usually the packaging label, but it is not guaranteed.
- Reference intakes use **US RDA/AI** values adjusted for the age and sex in your profile. Sodium is
  treated as a ceiling rather than a target, and is excluded from micronutrient scoring.
- Energy targets use the **Mifflin-St Jeor** equation. A deficit is floored at the higher of
  1200/1500 kcal or 110% of BMR so the app never suggests something unreasonable.
- The nutrition score weights calories (25), protein (25), micronutrient coverage (25), fibre (15)
  and food variety (10).

Eaty is a personal tracking tool, not medical advice. Talk to a doctor or registered dietitian
before making significant changes to how you eat.
