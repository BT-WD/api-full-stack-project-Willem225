// GET /api/combatants/:slug — combatant + their starters/unique cards

import { json, jsonError, onRequestOptions } from '../_helpers.js';
import cards      from '../../../cards.json';
import combatants from '../../../combatants.json';

export { onRequestOptions };

export function onRequestGet({ params }) {
  const slug = String(params.slug || '').toLowerCase();
  const combatant = combatants.find(c =>
    c.slug === slug || c.name.toLowerCase() === slug);
  if (!combatant) return jsonError(404, 'Combatant not found.');

  const theirs   = cards.filter(c => c.combatant === combatant.name);
  const starters = theirs.filter(c => c.kind === 'basic');
  const unique   = theirs.filter(c => c.kind === 'unique');

  return json({
    combatant,
    cards: { starters, unique, all: theirs },
  });
}

export function onRequestPost() {
  return jsonError(405, 'GET only.');
}
