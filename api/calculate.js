// POST /api/calculate
// Body: { entries: [{card, flag, epiphany, isStarter?}], equipment?: [...], tier?, nightmare? }
// Returns: { total, cap, overCap, breakdown, warnings }

import { applyCors, jsonError } from './_cors.js';
import { calculateFaintMemory } from '../js/faintMemory.js';

export default function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return jsonError(res, 405, 'POST only. Body: { entries, equipment, tier, nightmare }.');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  try {
    const result = calculateFaintMemory({
      entries:   Array.isArray(body.entries)   ? body.entries   : [],
      equipment: Array.isArray(body.equipment) ? body.equipment : [],
      tier:      body.tier ?? 1,
      nightmare: Boolean(body.nightmare),
    });
    res.status(200).json(result);
  } catch (err) {
    jsonError(res, 400, err.message || 'Invalid deck payload.');
  }
}
