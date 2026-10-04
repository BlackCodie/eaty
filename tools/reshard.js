/* Re-shards the existing pack in data/de/ with the current OffMap.shardOf,
   without harvesting again. Run after changing the shard hash or count:
     node tools/reshard.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { writeShards } = require('./fetch-de.js');

const DIR = path.join(__dirname, '..', 'data', 'de');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const all = [];
for (const f of fs.readdirSync(DIR)) {
  if (/^\d+\.json$/.test(f)) all.push(...JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
}
if (all.length !== idx.count) {
  console.error(`index.json says ${idx.count} products but the shards hold ${all.length} — not rewriting.`);
  process.exit(2);
}
writeShards(DIR, all, { version: idx.version, built: idx.built, fields: idx.fields });
