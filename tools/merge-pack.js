/* Carries products over from an older pack into the current one, so a fresh
   harvest never shrinks coverage: a product that dropped out of the search
   index, or was only ever tagged with a neighbouring country, keeps scanning.

   Only European-origin barcodes are carried over (GS1 prefixes for Germany,
   Austria, Switzerland, the Benelux, France, Italy, Spain, the UK, Denmark,
   Poland, the Czech Republic, plus in-store codes) — US, Latin American and
   Asian products from old brand sweeps are left behind. Current records always
   win. Carried-over records lose their category type (old indices no longer
   match types.json) and fall back to name keywords for comparisons.

   Run:   node tools/merge-pack.js <old-pack-dir>   then   node tools/build-top.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { writeShards } = require('./fetch-de.js');

const DIR = path.join(__dirname, '..', 'data', 'de');
const OLD = process.argv[2];
if (!OLD || !fs.existsSync(OLD)) {
  console.error('usage: node tools/merge-pack.js <old-pack-dir>');
  process.exit(1);
}

/** Is this barcode's GS1 prefix European (or an in-store code)? */
function european(code) {
  if (code.length === 8) return /^[2-9]/.test(code);             // EAN-8; 0/1 are US short codes
  const p = Number(code.padStart(13, '0').slice(0, 3));
  return (p >= 200 && p <= 299) ||                                 // in-store / variable weight
    (p >= 300 && p <= 379) || (p >= 400 && p <= 440) ||           // France, Germany
    (p >= 500 && p <= 509) || (p >= 540 && p <= 549) ||           // UK, Belgium/Luxembourg
    (p >= 570 && p <= 579) || p === 590 || p === 859 ||           // Denmark, Poland, Czechia
    (p >= 760 && p <= 769) || (p >= 800 && p <= 849) ||           // Switzerland, Italy, Spain
    (p >= 870 && p <= 879) || (p >= 900 && p <= 919);             // Netherlands, Austria
}

const read = dir => {
  const rows = [];
  for (const f of fs.readdirSync(dir)) {
    if (/^\d+\.json$/.test(f)) rows.push(...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  }
  return rows;
};

const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const current = read(DIR);
if (current.length !== idx.count) {
  console.error(`index.json says ${idx.count} products but the shards hold ${current.length} — not merging.`);
  process.exit(2);
}
const have = new Set(current.map(r => r[0]));
const width = idx.fields.length;
let carried = 0, skipped = 0;
for (const r of read(OLD)) {
  if (have.has(r[0])) continue;
  if (!european(r[0])) { skipped++; continue; }
  const row = r.slice(0, width);
  while (row.length < width) row.push(0);
  row[19] = -1;                                   // category index from the old types.json
  current.push(row);
  have.add(r[0]);
  carried++;
}
console.log(`carried over ${carried} products, left ${skipped} non-European ones behind`);
writeShards(DIR, current, { version: idx.version, built: idx.built, fields: idx.fields });
