// localStorage-backed store for the static GitHub Pages deployment.
// Preserves the same exported surface the views used to expect so they don't
// need to care whether they're hitting a server or local storage.
//
// ⚠️  Auth here is client-side only — passwords live in localStorage in plain
// text. That's fine for a UI demo, but NEVER use this pattern in production.

import { calculateFaintMemory } from './faintMemory.js';

const TOKEN_KEY = 'czn_token';
const USER_KEY  = 'czn_user';
const USERS_KEY = 'czn_users_v1';     // [{id, username, email, password, created_at}]
const DECKS_KEY = 'czn_decks_v2';     // { [userId]: [deck, deck, ...] } — v2 = post-catalog-expansion
const CARDS_URL = 'cards.json';       // static file, relative to index.html

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

/* ────────── card catalog (static JSON, cached in memory) ────────── */

let _cardsCache = null;
let _cardsPromise = null;

async function loadCards() {
  if (_cardsCache) return _cardsCache;
  if (!_cardsPromise) {
    _cardsPromise = fetch(CARDS_URL, { cache: 'force-cache' }).then(r => {
      if (!r.ok) throw new Error(`Failed to load ${CARDS_URL} (${r.status})`);
      return r.json();
    }).then(rows => {
      rows.forEach((c, i) => { if (c.id === undefined) c.id = i + 1; });
      _cardsCache = rows;
      return rows;
    });
  }
  return _cardsPromise;
}

/* ────────── user + deck stores ────────── */

function readUsers()    { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; } }
function writeUsers(a)  { localStorage.setItem(USERS_KEY, JSON.stringify(a)); }
function readDecks()    { try { return JSON.parse(localStorage.getItem(DECKS_KEY)) || {}; } catch { return {}; } }
function writeDecks(o)  { localStorage.setItem(DECKS_KEY, JSON.stringify(o)); }

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, created_at: u.created_at };
}

function fakeToken(userId) {
  return `local.${userId}.${Date.now().toString(36)}`;
}

function nextId(arr) {
  return arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
}

function apiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
  const user = {
    id: nextId(users), username, email, password,
    created_at: new Date().toISOString(),
  };
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

/* ────────── cards ────────── */

async function cards(query = {}) {
  const all = await loadCards();
  const q    = (query.q || '').toLowerCase();
  const char = query.character;
  const cat  = query.category;
  const type = query.card_type;
  const filtered = all.filter(c => {
    if (q) {
      const hay = `${c.name || ''} ${c.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (char && c.character !== char) return false;
    if (cat  && c.category  !== cat)  return false;
    if (type && c.card_type !== type) return false;
    return true;
  });
  return { cards: filtered };
}

async function cardFilters() {
  const all = await loadCards();
  const uniq = (field) => [...new Set(all.map(c => c[field]).filter(Boolean))].sort();
  return {
    characters: uniq('character'),
    categories: uniq('category'),
    card_types: uniq('card_type'),
  };
}

/* ────────── decks (scoped to the active user) ────────── */

function currentUserId() {
  const u = getUser();
  if (!u) throw apiError(401, 'Log in to manage decks.');
  return u.id;
}

async function decks() {
  const uid = currentUserId();
  const allDecks = readDecks();
  const list = allDecks[uid] || [];
  const allCards = await loadCards();
  // Make sure each stored deck has its card refs rehydrated from the catalog.
  return { decks: list.map(d => ({ ...d, cards: rehydrateCards(d.cards, allCards) })) };
}

async function deck(id) {
  const uid = currentUserId();
  const list = readDecks()[uid] || [];
  const found = list.find(d => d.id === Number(id));
  if (!found) throw apiError(404, 'Deck not found.');
  const allCards = await loadCards();
  return { deck: { ...found, cards: rehydrateCards(found.cards, allCards) } };
}

async function createDeck(body) {
  const uid = currentUserId();
  const allDecks = readDecks();
  const list = allDecks[uid] || [];
  const allCards = await loadCards();
  const now = new Date().toISOString();
  const newDeck = {
    id: nextId(list),
    name: (body.name || 'Untitled').trim(),
    description: body.description || '',
    character: body.character || '',
    tier: clamp(Number(body.tier) || 1, 1, 13),
    nightmare: Boolean(body.nightmare),
    created_at: now,
    updated_at: now,
    cards: normalizeStoredEntries(body.cards),
    equipment: normalizeStoredEquipment(body.equipment),
  };
  list.push(newDeck);
  allDecks[uid] = list;
  writeDecks(allDecks);
  return { deck: { ...newDeck, cards: rehydrateCards(newDeck.cards, allCards) } };
}

async function updateDeck(id, body) {
  const uid = currentUserId();
  const allDecks = readDecks();
  const list = allDecks[uid] || [];
  const idx = list.findIndex(d => d.id === Number(id));
  if (idx === -1) throw apiError(404, 'Deck not found.');
  const existing = list[idx];
  const allCards = await loadCards();
  const updated = {
    ...existing,
    name:        body.name !== undefined        ? String(body.name).trim()                  : existing.name,
    description: body.description !== undefined ? body.description                          : existing.description,
    character:   body.character !== undefined   ? body.character                            : existing.character,
    tier:        body.tier !== undefined        ? clamp(Number(body.tier) || 1, 1, 13)      : existing.tier,
    nightmare:   body.nightmare !== undefined   ? Boolean(body.nightmare)                   : existing.nightmare,
    cards:       Array.isArray(body.cards)      ? normalizeStoredEntries(body.cards)        : existing.cards,
    equipment:   Array.isArray(body.equipment)  ? normalizeStoredEquipment(body.equipment)  : existing.equipment,
    updated_at:  new Date().toISOString(),
  };
  list[idx] = updated;
  allDecks[uid] = list;
  writeDecks(allDecks);
  return { deck: { ...updated, cards: rehydrateCards(updated.cards, allCards) } };
}

async function deleteDeck(id) {
  const uid = currentUserId();
  const allDecks = readDecks();
  const list = allDecks[uid] || [];
  const idx = list.findIndex(d => d.id === Number(id));
  if (idx === -1) throw apiError(404, 'Deck not found.');
  list.splice(idx, 1);
  allDecks[uid] = list;
  writeDecks(allDecks);
  return { ok: true };
}

async function calculate(payload) {
  return calculateFaintMemory(payload || {});
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
  cards, cardFilters,
  decks, deck, createDeck, updateDeck, deleteDeck,
  calculate,
};
