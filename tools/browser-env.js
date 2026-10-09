/* Loads the real browser modules into Node, so build tools and tests run the
   exact code the app ships instead of re-implementing it. Only the DOM surface
   those modules touch at load time is stubbed. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function install() {
  if (global.__eatyLoaded) return global;
  const store = new Map();
  global.window = global;
  global.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
  };
  const noop = () => {};
  const el = { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
               appendChild: noop, style: {}, classList: { add: noop, remove: noop, toggle: noop } };
  global.document = Object.assign({}, el, {
    createElement: () => Object.assign({}, el),
    documentElement: { dataset: {} },
    head: el
  });
  global.addEventListener = noop;
  global.requestAnimationFrame = fn => setTimeout(fn, 0);
  global.matchMedia = () => ({ matches: false, addEventListener: noop });
  // Node 21+ defines a read-only global navigator; only fill what is missing.
  if (typeof navigator === 'undefined') global.navigator = { onLine: true };

  // Same order as index.html, minus the purely visual modules.
  [
    'js/core.js', 'js/store.js', 'js/offmap.js', 'js/additives.js',
    'js/foods.js', 'js/foods-de.js', 'js/foods-extra.js', 'js/foods-compounds.js',
    'js/nutrition.js', 'js/quality.js', 'js/estimate.js', 'js/body.js', 'js/hormones.js', 'js/ui.js',
    'js/barcode.js', 'js/offapi.js', 'js/fdcapi.js', 'js/localpack.js',
    'js/foodsheet.js', 'js/supplements.js'
  ].forEach(rel => {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInThisContext(code, { filename: rel });
  });
  // The app normally fills these on boot.
  App.state.settings = { firstDay: 'mon' };
  App.state.customFoods = [];
  global.__eatyLoaded = true;
  return global;
}

module.exports = { install, ROOT, read: rel => fs.readFileSync(path.join(ROOT, rel), 'utf8') };
