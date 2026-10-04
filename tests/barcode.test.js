const test = require('node:test');
const assert = require('node:assert');
require('./env').install();

test('GTIN check digits are validated for every length', () => {
  assert.ok(Barcode.validGtin('4061458012171'));   // EAN-13, Milsani Quark
  assert.ok(Barcode.validGtin('3017620422003'));   // EAN-13, Nutella
  assert.ok(Barcode.validGtin('40111216'));        // EAN-8, Bounty
  assert.ok(Barcode.validGtin('036000291452'));    // UPC-A
  assert.ok(!Barcode.validGtin('3017620422004'));  // one digit off
  assert.ok(!Barcode.validGtin('30176204220'));    // wrong length
  assert.ok(!Barcode.validGtin('30176204220a3'));  // not numeric
});

test('UPC-A and EAN-13 forms of the same product are both tried', () => {
  assert.deepStrictEqual(Barcode.variants('036000291452'), ['036000291452', '0036000291452']);
  assert.deepStrictEqual(Barcode.variants('0036000291452'), ['0036000291452', '036000291452']);
  assert.deepStrictEqual(Barcode.variants('4061458012171'), ['4061458012171']);
});
