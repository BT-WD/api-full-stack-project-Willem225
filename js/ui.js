// Tiny DOM helpers shared by every view.

import { baseCardCost } from './faintMemory.js';

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class' || k === 'className') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'for') node.htmlFor = v;
    else if (k in node) {
      try { node[k] = v; } catch { node.setAttribute(k, v); }
    }
    else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

let toastTimer = null;
export function toast(message, variant = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.className = `toast show ${variant}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

/* ─── card tile helpers ─────────────────────────────── */

const TYPE_LABEL = {
  character: 'Character',
  unique:    'Character',
  neutral:   'Neutral',
  forbidden: 'Forbidden',
  monster:   'Monster',
};

const RARITY_PIPS = { common: 1, rare: 2, legendary: 3 };

function firstGlyph(name) {
  if (!name) return '·';
  const letter = name.replace(/^Forbidden:\s*/i, '').trim()[0] || '·';
  return letter.toUpperCase();
}

// Render a single E7bot-styled card tile. `onSelect` (optional) = click handler.
export function cardTile(card, { onSelect } = {}) {
  const type = String(card.card_type || 'neutral').toLowerCase();
  const typeClass = (type === 'unique') ? 'character' : type;
  const cost = baseCardCost(card);

  const pips = RARITY_PIPS[String(card.monster_rarity || '').toLowerCase()] || 0;
  const pipsEl = pips > 0
    ? el('div', { class: 'card-rarity-pips' },
        Array.from({ length: pips }, () => el('span', { class: 'pip' })))
    : null;

  const metaBits = [
    el('span', { class: `tag tag-${typeClass}` }, TYPE_LABEL[type] || type),
    card.monster_rarity
      ? el('span', { class: `tag tag-rarity-${card.monster_rarity}` }, card.monster_rarity)
      : null,
    card.category ? el('span', {}, card.category) : null,
    card.character ? el('span', {}, `· ${card.character}`) : null,
  ].filter(Boolean);

  return el('div', {
    class: `card-tile type-${typeClass}`,
    onclick: onSelect,
    title: card.description || '',
  }, [
    el('div', { class: 'card-art' }, [
      el('div', { class: 'card-cost', title: `${cost} Faint Memory` }, String(cost)),
      pipsEl,
      el('div', { class: 'card-art-glyph' }, firstGlyph(card.name)),
    ]),
    el('div', { class: 'card-body' }, [
      el('div', { class: 'card-name' }, card.name || 'Unnamed'),
      el('div', { class: 'card-meta-row' }, metaBits),
      card.description ? el('div', { class: 'card-desc' }, card.description) : null,
    ].filter(Boolean)),
  ]);
}

// Small inline mini-art used in deck rows (36x36 coloured square w/ glyph).
export function miniArt(card) {
  const type = String(card?.card_type || 'neutral').toLowerCase();
  const typeClass = (type === 'unique') ? 'character' : type;
  const node = el('div', { class: 'mini-art' }, firstGlyph(card?.name));
  node.classList.add(`type-${typeClass}`);
  return node;
}
