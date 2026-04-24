// GET /api/combatants
// Query: ?q=<text>&class=<c>&element=<e>&rarity=<r>
// Returns: { combatants: [...], total }

import { applyCors, jsonError } from './_cors.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMBATANTS_PATH = path.join(__dirname, '..', 'combatants.json');

let _combatants = null;
function loadCombatants() {
  if (_combatants) return _combatants;
  _combatants = JSON.parse(fs.readFileSync(COMBATANTS_PATH, 'utf8'));
  return _combatants;
}

export default function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return jsonError(res, 405, 'GET only.');

  const all = loadCombatants();
  const q       = String(req.query.q || '').toLowerCase();
  const cls     = req.query.class;
  const element = req.query.element;
  const rarity  = req.query.rarity;

  const filtered = all.filter(c => {
    if (q && !c.name.toLowerCase().includes(q))            return false;
    if (cls     && c.combatant_class !== cls)              return false;
    if (element && c.element         !== element)          return false;
    if (rarity  && c.rarity          !== rarity)           return false;
    return true;
  });

  res.status(200).json({ combatants: filtered, total: filtered.length });
}
