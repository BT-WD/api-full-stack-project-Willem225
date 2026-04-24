// POST /api/calculate
// Body: { entries: [...], tier?, nightmare? }
// Returns: { total, cap, overCap, breakdown, warnings }

import { json, jsonError, onRequestOptions } from './_helpers.js';
import { calculateFaintMemory } from '../../js/faintMemory.js';

export { onRequestOptions };

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }
  if (!body || typeof body !== 'object') {
    return jsonError(400, 'Body must be a JSON object with { entries, tier?, nightmare? }.');
  }
  try {
    const result = calculateFaintMemory({
      entries:   Array.isArray(body.entries) ? body.entries : [],
      tier:      body.tier ?? 1,
      nightmare: Boolean(body.nightmare),
    });
    return json(result);
  } catch (err) {
    return jsonError(400, err.message || 'Invalid deck payload.');
  }
}

export function onRequestGet() {
  return jsonError(405, 'POST only. Body: { entries, tier, nightmare }.');
}
