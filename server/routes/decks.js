const express = require('express');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const { calculateFaintMemory } = require('../lib/faintMemory');

const router = express.Router();

const selectDeck = db.prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?');
const selectDeckCards = db.prepare(`
  SELECT dc.id AS deck_card_id, dc.flag, dc.epiphany, dc.is_starter, dc.position,
         c.*
  FROM deck_cards dc
  JOIN cards c ON c.id = dc.card_id
  WHERE dc.deck_id = ?
  ORDER BY dc.position ASC, dc.id ASC
`);
const selectDeckEquipment = db.prepare('SELECT slot, level FROM deck_equipment WHERE deck_id = ? ORDER BY id');
const deleteDeckCards = db.prepare('DELETE FROM deck_cards WHERE deck_id = ?');
const deleteDeckEquipment = db.prepare('DELETE FROM deck_equipment WHERE deck_id = ?');
const insertDeckCard = db.prepare(`
  INSERT INTO deck_cards (deck_id, card_id, flag, epiphany, is_starter, position)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertDeckEquipment = db.prepare(`
  INSERT INTO deck_equipment (deck_id, slot, level) VALUES (?, ?, ?)
`);

function deckToPayload(deckRow) {
  if (!deckRow) return null;
  const cards = selectDeckCards.all(deckRow.id).map(row => ({
    deck_card_id: row.deck_card_id,
    flag: row.flag,
    epiphany: row.epiphany,
    is_starter: Boolean(row.is_starter),
    position: row.position,
    card: {
      id: row.id,
      external_id: row.external_id,
      name: row.name,
      character: row.character,
      card_type: row.card_type,
      category: row.category,
      monster_rarity: row.monster_rarity,
      description: row.description,
      image_url: row.image_url,
      source: row.source,
    },
  }));
  const equipment = selectDeckEquipment.all(deckRow.id);
  return {
    id: deckRow.id,
    name: deckRow.name,
    description: deckRow.description,
    character: deckRow.character,
    tier: deckRow.tier,
    nightmare: Boolean(deckRow.nightmare),
    created_at: deckRow.created_at,
    updated_at: deckRow.updated_at,
    cards,
    equipment,
  };
}

function normalizeEntries(cards = []) {
  return cards.map((c, i) => ({
    card_id: Number(c.card_id ?? c.card?.id),
    flag: c.flag || 'normal',
    epiphany: c.epiphany || 'none',
    is_starter: c.is_starter ? 1 : 0,
    position: c.position ?? i,
  })).filter(c => Number.isInteger(c.card_id));
}

function normalizeEquipment(equipment = []) {
  return equipment.map(e => ({
    slot: String(e.slot || ''),
    level: Math.max(0, Math.min(2, Number(e.level) || 0)),
  })).filter(e => e.slot);
}

function saveDeckCards(deckId, cards, equipment) {
  const entries = normalizeEntries(cards);
  const eqs = normalizeEquipment(equipment);

  const run = db.transaction(() => {
    deleteDeckCards.run(deckId);
    deleteDeckEquipment.run(deckId);
    for (const e of entries) {
      insertDeckCard.run(deckId, e.card_id, e.flag, e.epiphany, e.is_starter, e.position);
    }
    for (const eq of eqs) {
      insertDeckEquipment.run(deckId, eq.slot, eq.level);
    }
  });
  run();
}

router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM decks WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user.id);
  res.json({ decks: rows.map(deckToPayload) });
});

router.post('/', (req, res) => {
  const { name, description, character, tier = 1, nightmare = false, cards = [], equipment = [] } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Deck name is required.' });

  const info = db
    .prepare(`INSERT INTO decks (user_id, name, description, character, tier, nightmare)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(req.user.id, String(name).trim(), description || null, character || null,
         Math.max(1, Math.min(13, Number(tier) || 1)), nightmare ? 1 : 0);

  const deckId = info.lastInsertRowid;
  saveDeckCards(deckId, cards, equipment);

  const deck = deckToPayload(selectDeck.get(deckId, req.user.id));
  res.status(201).json({ deck });
});

router.get('/:id', (req, res) => {
  const deck = selectDeck.get(req.params.id, req.user.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found.' });
  res.json({ deck: deckToPayload(deck) });
});

router.put('/:id', (req, res) => {
  const deckRow = selectDeck.get(req.params.id, req.user.id);
  if (!deckRow) return res.status(404).json({ error: 'Deck not found.' });

  const { name, description, character, tier, nightmare, cards, equipment } = req.body || {};

  db.prepare(`UPDATE decks
              SET name        = COALESCE(?, name),
                  description = COALESCE(?, description),
                  character   = COALESCE(?, character),
                  tier        = COALESCE(?, tier),
                  nightmare   = COALESCE(?, nightmare),
                  updated_at  = datetime('now')
              WHERE id = ? AND user_id = ?`)
    .run(
      name !== undefined ? String(name).trim() : null,
      description !== undefined ? description : null,
      character !== undefined ? character : null,
      tier !== undefined ? Math.max(1, Math.min(13, Number(tier) || 1)) : null,
      nightmare !== undefined ? (nightmare ? 1 : 0) : null,
      deckRow.id, req.user.id
    );

  if (Array.isArray(cards) || Array.isArray(equipment)) {
    saveDeckCards(deckRow.id, cards || [], equipment || []);
  }

  res.json({ deck: deckToPayload(selectDeck.get(deckRow.id, req.user.id)) });
});

router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM decks WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Deck not found.' });
  res.json({ ok: true });
});

// Stateless calculation — does not require the deck to be persisted.
router.post('/calculate', (req, res) => {
  const { entries = [], equipment = [], tier = 1, nightmare = false } = req.body || {};
  const result = calculateFaintMemory({ entries, equipment, tier, nightmare });
  res.json(result);
});

module.exports = router;
