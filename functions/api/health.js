import { json, onRequestOptions } from './_helpers.js';

export { onRequestOptions };

export function onRequestGet() {
  return json({
    ok: true,
    service: 'czn-deck-builder-api',
    version: '1.0.0',
    now: new Date().toISOString(),
  });
}
