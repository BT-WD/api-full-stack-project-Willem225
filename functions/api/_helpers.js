// Shared helpers for Cloudflare Pages Functions.
// Workers runtime = V8 isolates, Web Standard Request/Response, no Node fs.

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '600',
};

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...(init.headers || {}) },
  });
}

export function jsonError(status, message) {
  return json({ error: message }, { status });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
