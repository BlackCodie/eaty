# Data sources and licensing

## Bundled German product pack — `data/de/`

The product pack shipped in `data/de/` is derived from **Open Food Facts**, a collaborative,
free and open database of food products from around the world.

- Source: <https://world.openfoodfacts.org>
- Licence: **Open Database License (ODbL) v1.0** — <https://opendatacommons.org/licenses/odbl/1-0/>
- Individual contents of the database are available under the Database Contents License (DbCL) v1.0.

The pack is a **derived database**: a subset of German-market products, reduced to barcode, product
name, brand, category, serving/package size and the nutrition-label values (energy, protein,
carbohydrate, fat, fibre, sugars, saturated fat, sodium) per 100 g or 100 ml.

Under the ODbL, if you publish this app you must keep this attribution, and any further public
distribution of the pack (modified or not) must remain under the ODbL. Corrections belong upstream —
please improve the product on openfoodfacts.org so everyone benefits.

Open Food Facts is not affiliated with, and does not endorse, this application. Retailer and brand
names (Rewe, Kaufland, Aldi, Lidl, Edeka, Penny, Netto, dm, Alnatura and others) are trademarks of
their respective owners and appear only as factual product descriptions.

## Live lookups

- **Open Food Facts** — barcode and product search. ODbL, as above. No API key.
- **USDA FoodData Central** — generic foods with analysed nutrient profiles.
  <https://fdc.nal.usda.gov> — US Government work, public domain.

## Built-in food database — `js/foods.js`, `js/foods-de.js`, `js/foods-extra.js`

Nutrient values are approximations compiled from USDA FoodData Central (public domain) and
standard published composition data for German staples. They are hand-entered reference figures,
not measurements of any specific branded product.

## Nutrition is not advice

All figures are indicative. Crowd-sourced product data can be wrong or out of date — check the
packet if a number matters to you. This app is a personal tracking tool, not medical advice.
