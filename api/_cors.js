// Shared CORS helpers. Import and call `applyCors(req, res)` at the top of
// each handler so the static GitHub Pages front-end can call us cross-origin.

export function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;     // caller should early-return
  }
  return false;
}

export function jsonError(res, status, message) {
  res.status(status).json({ error: message });
}
