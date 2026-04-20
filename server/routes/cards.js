const express = require('express');
const db = require('../db/connection');

const router = express.Router();

router.get('/', (req, res) => {
  const { q, character, category, card_type, limit = '1000' } = req.query;
  const filters = [];
  const params = [];

  if (q) {
    filters.push('(name LIKE ? OR description LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like);
  }
  if (character)  { filters.push('character = ?');  params.push(character); }
  if (category)   { filters.push('category = ?');   params.push(category); }
  if (card_type)  { filters.push('card_type = ?');  params.push(card_type); }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const lim = Math.min(parseInt(limit, 10) || 1000, 5000);

  const rows = db
    .prepare(`SELECT * FROM cards ${where} ORDER BY name ASC LIMIT ?`)
    .all(...params, lim);

  res.json({ cards: rows });
});

router.get('/filters', (_req, res) => {
  const characters = db
    .prepare('SELECT DISTINCT character FROM cards WHERE character IS NOT NULL AND character <> "" ORDER BY character')
    .all()
    .map(r => r.character);
  const categories = db
    .prepare('SELECT DISTINCT category FROM cards WHERE category IS NOT NULL AND category <> "" ORDER BY category')
    .all()
    .map(r => r.category);
  const cardTypes = db
    .prepare('SELECT DISTINCT card_type FROM cards ORDER BY card_type')
    .all()
    .map(r => r.card_type);
  res.json({ characters, categories, card_types: cardTypes });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Card not found.' });
  res.json({ card: row });
});

module.exports = router;
