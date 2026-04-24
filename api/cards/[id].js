// GET /api/cards/:id   (id = numeric id or external_id like "gk967")
// Returns: { card } | 404

import { applyCors, jsonError } from '../_cors.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARDS_PATH = path.join(__dirname, '..', '..', 'cards.json');

let _cards = null;
function loadCards() {
  if (_cards) return _cards;
  _cards = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'));
  return _cards;
}

export default function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return jsonError(res, 405, 'GET only.');

  const { id } = req.query;
  const all = loadCards();
  const needle = String(id);
  const card = all.find(c => String(c.id) === needle || c.external_id === needle);
  if (!card) return jsonError(res, 404, 'Card not found.');
  res.status(200).json({ card });
}
