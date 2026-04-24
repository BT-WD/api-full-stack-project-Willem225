// GET /api/combatants

import { json, jsonError, onRequestOptions } from './_helpers.js';
import combatants from '../../combatants.json';

export { onRequestOptions };

export function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q       = (url.searchParams.get('q') || '').toLowerCase();
  const cls     = url.searchParams.get('class');
  const element = url.searchParams.get('element');
  const rarity  = url.searchParams.get('rarity');

  const filtered = combatants.filter(c => {
    if (q && !c.name.toLowerCase().includes(q))    return false;
    if (cls     && c.combatant_class !== cls)      return false;
    if (element && c.element         !== element)  return false;
    if (rarity  && c.rarity          !== rarity)   return false;
    return true;
  });

  return json({ combatants: filtered, total: filtered.length });
}

export function onRequestPost() {
  return jsonError(405, 'GET only.');
}
