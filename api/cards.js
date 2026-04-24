// GET /api/cards
// Query: ?q=<text>&card_type=<t>&category=<c>&rarity=<r>&combatant=<name>&limit=<n>
// Returns: { cards: [...], total: number }

import { applyCors, jsonError } from './_cors.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARDS_PATH = path.join(__dirname, '..', 'cards.json');

// Read once at cold start; Vercel caches the container across invocations.
let _cards = null;
function loadCards() {
  if (_cards) return _cards;
  _cards = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'));
  return _cards;
}

export default function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return jsonError(res, 405, 'GET only.');

  const all = loadCards();
  const q        = String(req.query.q || '').toLowerCase();
  const type     = req.query.card_type;
  const cat      = req.query.category;
  const rarity   = req.query.rarity;
  const comb     = req.query.combatant;
  const limit    = Math.max(1, Math.min(5000, Number(req.query.limit) || 5000));

  const filtered = all.filter(c => {
    if (q) {
      const hay = `${c.name || ''} ${c.description || ''} ${c.combatant || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (type   && c.card_type !== type)   return false;
    if (cat    && c.category  !== cat)    return false;
    if (rarity && c.rarity    !== rarity) return false;
    if (comb   && c.combatant !== comb)   return false;
    return true;
  }).slice(0, limit);

  res.status(200).json({ cards: filtered, total: filtered.length });
}
