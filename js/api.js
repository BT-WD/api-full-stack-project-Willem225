// API client + localStorage-backed account/deck store.
//
// Cards and combatants now come from the REST API at /api/*. The FM calculation
// is still mirrored client-side for instant UI feedback, and you can also POST
// to /api/calculate to verify server-side.
//
// ⚠️  Auth is client-side only — passwords live in localStorage in plain text.
// Fine for a demo, never for production.

import { calculateFaintMemory } from './faintMemory.js';

const TOKEN_KEY = 'czn_token';
const USER_KEY  = 'czn_user';
const USERS_KEY = 'czn_users_v1';
const DECKS_KEY = 'czn_decks_v2';

// Where to find the API.
//   - On the Cloudflare Pages deployment (*.pages.dev): same origin, relative `/api`.
//   - On localhost with `wrangler pages dev .`: same origin, relative `/api`.
//   - Anywhere else (GitHub Pages, plain `python -m http.server`, file://):
//     hit the Cloudflare URL directly via CORS.
const CLOUDFLARE_API = 'https://api-full-stack-project-willem225.pages.dev/api';
export const API_BASE = (() => {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  if (host.endsWith('.pages.dev')) return '/api';
  // Localhost on port 8788 = wrangler pages dev (functions available). Any other
  // localhost port (e.g. 8000 from python http.server) has no API → hit prod.
  if ((host === 'localhost' || host === '127.0.0.1') && location.port === '8788') {
    return '/api';
  }
  return CLOUDFLARE_API;
})();

/* ────────── auth session ────────── */

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

/* ────────── API fetch helper ────────── */

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Accept': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const msg = (data && data.error) || `HTTP ${res.status}`;
    throw apiError(res.status, msg);
  }
  return data;
}

function apiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/* ────────── users + decks stores (localStorage) ────────── */

function readUsers()    { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; } }
function writeUsers(a)  { localStorage.setItem(USERS_KEY, JSON.stringify(a)); }
function readDecks()    { try { return JSON.parse(localStorage.getItem(DECKS_KEY)) || {}; } catch { return {}; } }
function writeDecks(o)  { localStorage.setItem(DECKS_KEY, JSON.stringify(o)); }

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, created_at: u.created_at };
}
function fakeToken(userId)  { return `local.${userId}.${Date.now().toString(36)}`; }
function nextId(arr)        { return arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1; }
function clamp(n, lo, hi)   { return Math.max(lo, Math.min(hi, n)); }
function sleep(ms)          { return new Promise(r => setTimeout(r, ms)); }

/* ────────── auth (client-side demo) ────────── */

async function signup({ username, email, password }) {
  await sleep(0);
  if (!username || !/^[A-Za-z0-9_.-]{3,30}$/.test(username)) {
    throw apiError(400, 'Username must be 3-30 chars (letters, digits, _ . -).');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw apiError(400, 'Invalid email address.');
  }
  if (!password || password.length < 8) {
    throw apiError(400, 'Password must be at least 8 characters.');
  }
  const users = readUsers();
  if (users.some(u => u.username === username || u.email === email)) {
    throw apiError(409, 'Username or email already in use.');
  }
  const user = { id: nextId(users), username, email, password, created_at: new Date().toISOString() };
  users.push(user);
  writeUsers(users);
  return { token: fakeToken(user.id), user: publicUser(user) };
}

async function login({ identifier, password }) {
  await sleep(0);
  const users = readUsers();
  const user = users.find(u =>
    (u.username === identifier || u.email === identifier) && u.password === password
  );
  if (!user) throw apiError(401, 'Invalid username/email or password.');
  return { token: fakeToken(user.id), user: publicUser(user) };
}

async function me() {
  const u = getUser();
  if (!u) throw apiError(401, 'Not logged in.');
  return { user: u };
}

/* ────────── cards (via /api/cards) ────────── */

// Cache loaded cards in memory so repeated calls don't hammer the API.
let _cardsCache = null;
let _cardsPromise = null;

async function loadAllCards() {
  if (_cardsCache) return _cardsCache;
  if (!_cardsPromise) {
    _cardsPromise = apiFetch('/cards?limit=5000').then(data => {
      _cardsCache = data.cards || [];
      return _cardsCache;
    });
  }
  return _cardsPromise;
}

async function cards(query = {}) {
  const params = new URLSearchParams();
  if (query.q)         params.set('q',         query.q);
  if (query.character) params.set('character', query.character);
  if (query.category)  params.set('category',  query.category);
  if (query.card_type) params.set('card_type', query.card_type);
  if (query.combatant) params.set('combatant', query.combatant);
  params.set('limit', String(query.limit || 5000));
  const qs = params.toString();
  const data = await apiFetch(`/cards${qs ? `?${qs}` : ''}`);
  let list = data.cards || [];
  // Client-side filter: hide character cards from the main browser by default.
  if (!query.include_character_cards) {
    list = list.filter(c => c.card_type !== 'character');
  }
  return { cards: list };
}

async function card(id) {
  const data = await apiFetch(`/cards/${encodeURIComponent(id)}`);
  return data;
}

async function cardFilters() {
  const all = await loadAllCards();
  const uniq = (field) => [...new Set(all.map(c => c[field]).filter(Boolean))].sort();
  return {
    characters: uniq('character'),
    categories: uniq('category'),
    card_types: uniq('card_type'),
  };
}

/* ────────── combatants (via /api/combatants) ────────── */

let _combatantsCache = null;
let _combatantsPromise = null;

async function combatants(query = {}) {
  // Cache the full list; apply filters client-side if a query is given
  // (cheaper than repeated API hits for the dropdowns on every view).
  if (!_combatantsCache && !_combatantsPromise) {
    _combatantsPromise = apiFetch('/combatants').then(data => {
      _combatantsCache = data.combatants || [];
      return _combatantsCache;
    });
  }
  const list = _combatantsCache || (await _combatantsPromise);
  const q       = (query.q || '').toLowerCase();
  const cls     = query.class;
  const element = query.element;
  const rarity  = query.rarity;
  const filtered = list.filter(c => {
    if (q && !c.name.toLowerCase().includes(q))          return false;
    if (cls     && c.combatant_class !== cls)            return false;
    if (element && c.element         !== element)        return false;
    if (rarity  && c.rarity          !== rarity)         return false;
    return true;
  });
  return { combatants: filtered };
}

async function combatant(slug) {
  return apiFetch(`/combatants/${encodeURIComponent(slug)}`);
}

/* ────────── calculate (via /api/calculate) ────────── */

// Two callers:
//   - calculate(payload)       → POST /api/calculate (source of truth, used on save)
//   - calculateLocal(payload)  → synchronous, for keystroke-live updates in the builder
async function calculate(payload) {
  return apiFetch('/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
}
export function calculateLocal(payload) {
  return calculateFaintMemory(payload || {});
}

/* ────────── decks (scoped to the active user, localStorage) ────────── */

function currentUserId() {
  const u = getUser();
  if (!u) throw apiError(401, 'Log in to manage decks.');
  return u.id;
}

async function decks() {
  const uid = currentUserId();
  const list = readDecks()[uid] || [];
  const allCards = await loadAllCards();
  return { decks: list.map(d => ({ ...d, cards: rehydrateCards(d.cards, allCards) })) };
}

async function deck(id) {
  const uid = currentUserId();
  const list = readDecks()[uid] || [];
  const found = list.find(d => d.id === Number(id));
  if (!found) throw apiError(404, 'Deck not found.');
  const allCards = await loadAllCards();
  return { deck: { ...found, cards: rehydrateCards(found.cards, allCards) } };
}

async function createDeck(body) {
  const uid = currentUserId();
  const all = readDecks();
  const list = all[uid] || [];
  const allCards = await loadAllCards();
  const now = new Date().toISOString();
  const newDeck = {
    id: nextId(list),
    name: (body.name || 'Untitled').trim(),
    description: body.description || '',
    character: body.character || '',
    tier: clamp(Number(body.tier) || 1, 1, 13),
    nightmare: Boolean(body.nightmare),
    created_at: now, updated_at: now,
    cards: normalizeStoredEntries(body.cards),
    equipment: normalizeStoredEquipment(body.equipment),
  };
  list.push(newDeck);
  all[uid] = list;
  writeDecks(all);
  return { deck: { ...newDeck, cards: rehydrateCards(newDeck.cards, allCards) } };
}

async function updateDeck(id, body) {
  const uid = currentUserId();
  const all = readDecks();
  const list = all[uid] || [];
  const idx = list.findIndex(d => d.id === Number(id));
  if (idx === -1) throw apiError(404, 'Deck not found.');
  const existing = list[idx];
  const allCards = await loadAllCards();
  const updated = {
    ...existing,
    name:        body.name !== undefined        ? String(body.name).trim()             : existing.name,
    description: body.description !== undefined ? body.description                     : existing.description,
    character:   body.character !== undefined   ? body.character                       : existing.character,
    tier:        body.tier !== undefined        ? clamp(Number(body.tier) || 1, 1, 13) : existing.tier,
    nightmare:   body.nightmare !== undefined   ? Boolean(body.nightmare)              : existing.nightmare,
    cards:       Array.isArray(body.cards)      ? normalizeStoredEntries(body.cards)   : existing.cards,
    equipment:   Array.isArray(body.equipment)  ? normalizeStoredEquipment(body.equipment) : existing.equipment,
    updated_at:  new Date().toISOString(),
  };
  list[idx] = updated;
  all[uid] = list;
  writeDecks(all);
  return { deck: { ...updated, cards: rehydrateCards(updated.cards, allCards) } };
}

async function deleteDeck(id) {
  const uid = currentUserId();
  const all = readDecks();
  const list = all[uid] || [];
  const idx = list.findIndex(d => d.id === Number(id));
  if (idx === -1) throw apiError(404, 'Deck not found.');
  list.splice(idx, 1);
  all[uid] = list;
  writeDecks(all);
  return { ok: true };
}

/* ────────── normalizers ────────── */

function normalizeStoredEntries(entries = []) {
  return entries.map((e, i) => ({
    card_id:    Number(e.card_id ?? e.card?.id),
    flag:       e.flag || 'normal',
    epiphany:   e.epiphany || 'none',
    is_starter: Boolean(e.is_starter),
    position:   e.position ?? i,
  })).filter(e => Number.isInteger(e.card_id));
}

function normalizeStoredEquipment(equipment = []) {
  return equipment.map(eq => ({
    slot:  String(eq.slot || ''),
    level: clamp(Number(eq.level) || 0, 0, 2),
  })).filter(eq => eq.slot);
}

function rehydrateCards(storedEntries = [], allCards = []) {
  const byId = new Map(allCards.map(c => [c.id, c]));
  return storedEntries.map((entry, i) => ({
    deck_card_id: i,
    card:       byId.get(entry.card_id) || null,
    flag:       entry.flag || 'normal',
    epiphany:   entry.epiphany || 'none',
    is_starter: Boolean(entry.is_starter),
    position:   entry.position ?? i,
  })).filter(e => e.card);
}

/* ────────── export ────────── */

export const api = {
  signup, login, me,
  cards, card, cardFilters,
  combatants, combatant,
  decks, deck, createDeck, updateDeck, deleteDeck,
  calculate,
};
