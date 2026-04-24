// GET /api/cards
// Query: ?q=<text>&card_type=<t>&category=<c>&rarity=<r>&combatant=<name>&limit=<n>

import { json, jsonError, onRequestOptions } from './_helpers.js';
import cards from '../../cards.json';

export { onRequestOptions };

export function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q        = (url.searchParams.get('q') || '').toLowerCase();
  const type     = url.searchParams.get('card_type');
  const cat      = url.searchParams.get('category');
  const rarity   = url.searchParams.get('rarity');
  const comb     = url.searchParams.get('combatant');
  const limit    = Math.max(1, Math.min(5000, Number(url.searchParams.get('limit')) || 5000));

  const filtered = cards.filter(c => {
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

  return json({ cards: filtered, total: filtered.length });
}

export function onRequestPost() {
  return jsonError(405, 'GET only.');
}
