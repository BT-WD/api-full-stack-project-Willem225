// GET /api/combatants/:slug
// Returns: { combatant, cards: { starters: [...], unique: [...] } } | 404

import { applyCors, jsonError } from '../_cors.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARDS_PATH      = path.join(__dirname, '..', '..', 'cards.json');
const COMBATANTS_PATH = path.join(__dirname, '..', '..', 'combatants.json');

let _cards = null, _combatants = null;
function load() {
  if (!_cards)      _cards      = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'));
  if (!_combatants) _combatants = JSON.parse(fs.readFileSync(COMBATANTS_PATH, 'utf8'));
  return { cards: _cards, combatants: _combatants };
}

export default function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return jsonError(res, 405, 'GET only.');

  const { slug } = req.query;
  const { cards, combatants } = load();
  const combatant = combatants.find(c => c.slug === slug || c.name.toLowerCase() === String(slug).toLowerCase());
  if (!combatant) return jsonError(res, 404, 'Combatant not found.');

  const theirs   = cards.filter(c => c.combatant === combatant.name);
  const starters = theirs.filter(c => c.kind === 'basic');
  const unique   = theirs.filter(c => c.kind === 'unique');

  res.status(200).json({
    combatant,
    cards: { starters, unique, all: theirs },
  });
}
