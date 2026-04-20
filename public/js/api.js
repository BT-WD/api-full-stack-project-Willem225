// Fetch wrapper with automatic auth header + JSON handling.

const TOKEN_KEY = 'czn_token';
const USER_KEY  = 'czn_user';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function getUser()  {
  const raw = localStorage.getItem(USER_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function setSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user)  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(method, path, body) {
  const headers = { 'Accept': 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  get:   (p)       => request('GET',    p),
  post:  (p, body) => request('POST',   p, body ?? {}),
  put:   (p, body) => request('PUT',    p, body ?? {}),
  del:   (p)       => request('DELETE', p),

  // convenience
  signup: (body) => request('POST', '/api/auth/signup', body),
  login:  (body) => request('POST', '/api/auth/login',  body),
  me:     ()     => request('GET',  '/api/auth/me'),

  cards:       (query = {}) => {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString();
    return request('GET', `/api/cards${qs ? `?${qs}` : ''}`);
  },
  cardFilters: () => request('GET', '/api/cards/filters'),

  decks:      ()            => request('GET',    '/api/decks'),
  deck:       (id)          => request('GET',    `/api/decks/${id}`),
  createDeck: (body)        => request('POST',   '/api/decks', body),
  updateDeck: (id, body)    => request('PUT',    `/api/decks/${id}`, body),
  deleteDeck: (id)          => request('DELETE', `/api/decks/${id}`),
  calculate:  (body)        => request('POST',   '/api/decks/calculate', body),
};
