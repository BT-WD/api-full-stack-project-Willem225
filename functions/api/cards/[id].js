// GET /api/cards/:id   (id = numeric id or external_id like "gk967")

import { json, jsonError, onRequestOptions } from '../_helpers.js';
import cards from '../../../cards.json';

export { onRequestOptions };

export function onRequestGet({ params }) {
  const needle = String(params.id || '');
  const card = cards.find(c => String(c.id) === needle || c.external_id === needle);
  if (!card) return jsonError(404, 'Card not found.');
  return json({ card });
}

export function onRequestPost() {
  return jsonError(405, 'GET only.');
}
