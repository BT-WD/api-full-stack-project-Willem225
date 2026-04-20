const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
require('../db/init');

const samplePath = path.resolve(process.cwd(), 'data/cards.sample.json');
if (!fs.existsSync(samplePath)) {
  console.error(`[load-sample] missing ${samplePath}`);
  process.exit(1);
}

const cards = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

const stmt = db.prepare(`
  INSERT INTO cards (external_id, name, character, card_type, category, monster_rarity, description, image_url, source)
  VALUES (@external_id, @name, @character, @card_type, @category, @monster_rarity, @description, @image_url, @source)
  ON CONFLICT(external_id) DO UPDATE SET
    name           = excluded.name,
    character      = excluded.character,
    card_type      = excluded.card_type,
    category       = excluded.category,
    monster_rarity = excluded.monster_rarity,
    description    = excluded.description,
    image_url      = excluded.image_url,
    source         = excluded.source,
    updated_at     = datetime('now')
`);

const run = db.transaction(rows => {
  for (const r of rows) stmt.run({
    external_id:    r.external_id || `sample:${r.name}`,
    name:           r.name,
    character:      r.character || null,
    card_type:      r.card_type,
    category:       r.category || null,
    monster_rarity: r.monster_rarity || null,
    description:    r.description || null,
    image_url:      r.image_url || null,
    source:         r.source || 'sample',
  });
});

run(cards);
console.log(`[load-sample] loaded ${cards.length} cards`);
