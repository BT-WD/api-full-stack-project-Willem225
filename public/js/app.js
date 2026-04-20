import { el, clear, toast } from './ui.js';
import { api, getToken, getUser, clearSession } from './api.js';

import { renderLogin }   from './views/login.js';
import { renderSignup }  from './views/signup.js';
import { renderCards }   from './views/cards.js';
import { renderDecks }   from './views/decks.js';
import { renderBuilder } from './views/builder.js';

const routes = [
  { pattern: /^\/?$/,                   redirect: '#/cards' },
  { pattern: /^\/login$/,               handler: renderLogin,   auth: false },
  { pattern: /^\/signup$/,              handler: renderSignup,  auth: false },
  { pattern: /^\/cards$/,               handler: renderCards,   auth: false },
  { pattern: /^\/decks$/,               handler: renderDecks,   auth: true  },
  { pattern: /^\/decks\/new$/,          handler: (ctx) => renderBuilder(ctx, { mode: 'new' }),        auth: true  },
  { pattern: /^\/decks\/(\d+)$/,        handler: (ctx, m) => renderBuilder(ctx, { mode: 'edit', id: m[1] }), auth: true },
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  return raw;
}

function renderNav() {
  const nav = document.getElementById('nav');
  clear(nav);
  const loggedIn = Boolean(getToken());
  const current = parseHash();

  const items = [
    { href: '#/cards', label: 'Cards' },
  ];
  if (loggedIn) {
    items.push({ href: '#/decks', label: 'My Decks' });
    items.push({ href: '#/decks/new', label: 'New Deck' });
  }
  for (const it of items) {
    const a = el('a', {
      href: it.href,
      class: current === it.href.replace(/^#/, '') ? 'active' : '',
    }, it.label);
    nav.appendChild(a);
  }

  const slot = document.getElementById('auth-slot');
  clear(slot);
  const user = getUser();
  if (user) {
    slot.appendChild(el('span', { class: 'username' }, user.username));
    slot.appendChild(el('button', {
      class: 'btn btn-sm btn-ghost',
      onclick: () => {
        clearSession();
        toast('Signed out.');
        navigate('#/cards');
      },
    }, 'Sign out'));
  } else {
    slot.appendChild(el('a', { href: '#/login', class: 'btn btn-sm btn-ghost' }, 'Log in'));
    slot.appendChild(el('a', { href: '#/signup', class: 'btn btn-sm btn-primary' }, 'Sign up'));
  }
}

function navigate(hash) {
  if (location.hash !== hash) location.hash = hash;
  else route();
}

async function route() {
  const viewEl = document.getElementById('view');
  clear(viewEl);
  renderNav();

  const path = parseHash();
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (m) {
      if (r.redirect) { navigate(r.redirect); return; }
      if (r.auth && !getToken()) { navigate('#/login'); return; }
      const ctx = { view: viewEl, navigate, toast };
      try { await r.handler(ctx, m); }
      catch (err) {
        console.error(err);
        toast(err.message || 'Something went wrong.', 'error');
      }
      return;
    }
  }
  viewEl.appendChild(el('div', { class: 'empty' }, 'Not found.'));
}

async function boot() {
  if (getToken()) {
    try { await api.me(); }
    catch (err) {
      if (err.status === 401) {
        clearSession();
        toast('Session expired — please log in again.', 'error');
      }
    }
  }
  window.addEventListener('hashchange', route);
  route();
}

boot();
