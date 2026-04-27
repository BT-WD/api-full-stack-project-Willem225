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

  const RARITY_ORDER = { common: 0, rare: 1, legendary: 2, mythic: 3 };

  const theirs = cards.filter(c => c.combatant === combatant.name);
  const starters = theirs
    .filter(c => c.kind === 'basic')
    .sort((a, b) => (a.gk_sort ?? 0) - (b.gk_sort ?? 0));
  const unique = theirs
    .filter(c => c.kind === 'unique')
    .sort((a, b) => {
      const ra = RARITY_ORDER[a.rarity] ?? 99;
      const rb = RARITY_ORDER[b.rarity] ?? 99;
      if (ra !== rb) return ra - rb;
      return (a.gk_sort ?? 0) - (b.gk_sort ?? 0);
    });

  return json({
    combatant,
    cards: { starters, unique, all: theirs },
  });
}

export function onRequestPost() {
  return jsonError(405, 'GET only.');
}
