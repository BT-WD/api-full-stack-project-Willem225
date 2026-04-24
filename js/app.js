import { el, clear, toast } from './ui.js';
import { api, getToken, getUser, clearSession } from './api.js';

import { renderLogin }   from './views/login.js';
import { renderSignup }  from './views/signup.js';
import { renderCards }   from './views/cards.js';
import { renderDecks }   from './views/decks.js';
import { renderBuilder } from './views/builder.js';
import { renderCombatants, renderCombatantDetail } from './views/combatants.js';

const routes = [
  { pattern: /^\/?$/,                   redirect: '#/cards' },
  { pattern: /^\/login$/,               handler: renderLogin,   auth: false },
  { pattern: /^\/signup$/,              handler: renderSignup,  auth: false },
  { pattern: /^\/cards$/,               handler: renderCards,   auth: false },
  { pattern: /^\/combatants$/,          handler: renderCombatants, auth: false },
  { pattern: /^\/combatants\/([^/]+)$/, handler: (ctx, m) => renderCombatantDetail(ctx, m[1]), auth: false },
  { pattern: /^\/decks$/,               handler: renderDecks,   auth: true  },
  { pattern: /^\/builder$/,             handler: (ctx) => renderBuilder(ctx, { mode: 'new' }),        auth: false },
  { pattern: /^\/decks\/new$/,          redirect: '#/builder' },
  { pattern: /^\/decks\/(\d+)$/,        handler: (ctx, m) => renderBuilder(ctx, { mode: 'edit', id: m[1] }), auth: true },
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  return raw;
}

const ICONS = {
  cards:      '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="12" height="16" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/></svg>',
  combatants: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
  decks:      '<svg class="icon" viewBox="0 0 24 24"><path d="M4 4h16v5H4zM4 11h16v5H4zM4 18h16v2H4z"/></svg>',
  builder:    '<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  login:      '<svg class="icon" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>',
  signup:     '<svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M19 8v6M16 11h6"/></svg>',
  logout:     '<svg class="icon" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
};

function navItem(href, icon, label, active) {
  return el('a', {
    href,
    class: active ? 'active' : '',
    html: `${icon}<span>${label}</span>`,
  });
}

function renderNav() {
  const nav = document.getElementById('nav');
  clear(nav);
  const loggedIn = Boolean(getToken());
  const current = parseHash();

  const items = [
    { href: '#/cards',       icon: ICONS.cards,      label: 'Cards' },
    { href: '#/combatants',  icon: ICONS.combatants, label: 'Combatants' },
    { href: '#/builder',     icon: ICONS.builder,    label: 'Builder' },
  ];
  if (loggedIn) {
    items.push({ href: '#/decks', icon: ICONS.decks, label: 'Decks' });
  }
  for (const it of items) {
    const path = it.href.replace(/^#/, '');
    const isActive = current === path
      || (path === '/combatants' && current.startsWith('/combatants/'))
      || (path === '/builder'    && (current === '/decks/new' || current.startsWith('/decks/')))
      || (path === '/decks'      && current.startsWith('/decks/') && !current.startsWith('/decks/new'));
    nav.appendChild(navItem(it.href, it.icon, it.label, isActive));
  }

  const slot = document.getElementById('auth-slot');
  clear(slot);
  const user = getUser();
  if (user) {
    slot.appendChild(el('span', { class: 'username', title: user.username }, user.username));
    slot.appendChild(el('button', {
      class: 'btn btn-sm btn-ghost',
      onclick: () => {
        clearSession();
        toast('Signed out.');
        navigate('#/cards');
      },
      title: 'Sign out',
    }, 'Sign out'));
  } else {
    slot.appendChild(el('a', { href: '#/login',  class: 'btn btn-sm btn-ghost' }, 'Log in'));
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
