import { el, clear, cardTile } from '../ui.js';

let _combatantsCache = null;
async function loadCombatants() {
  if (_combatantsCache) return _combatantsCache;
  const res = await fetch('combatants.json?v=5');
  if (!res.ok) throw new Error('Failed to load combatants.json');
  _combatantsCache = await res.json();
  return _combatantsCache;
}

/* ─── list view ─────────────────────────────── */

export async function renderCombatants({ view, navigate, toast }) {
  clear(view);

  view.appendChild(el('div', { class: 'view-header' }, [
    el('h1', {}, 'Combatants'),
  ]));

  const state = { q: '', combatant_class: '' };
  const filters = el('div', { class: 'filters' });
  view.appendChild(filters);

  const grid = el('div', { class: 'combatant-grid' });
  view.appendChild(grid);
  grid.appendChild(el('div', { class: 'empty' }, 'Loading…'));

  let combatants = [];
  try {
    combatants = await loadCombatants();
  } catch (err) {
    clear(grid);
    grid.appendChild(el('div', { class: 'empty' }, `Failed: ${err.message}`));
    return;
  }

  const searchInput = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search combatants…',
    oninput: debounce(() => { state.q = searchInput.value.trim().toLowerCase(); render(); }, 150),
  });
  const classSelect = el('select', {
    class: 'select',
    onchange: () => { state.combatant_class = classSelect.value; render(); },
  }, [el('option', { value: '' }, 'All classes')]);

  const classes = [...new Set(combatants.map(c => c.combatant_class).filter(Boolean))].sort();
  for (const cls of classes) classSelect.appendChild(el('option', { value: cls }, cls));

  filters.append(searchInput, classSelect);

  function render() {
    clear(grid);
    const filtered = combatants.filter(c => {
      if (state.q && !c.name.toLowerCase().includes(state.q)) return false;
      if (state.combatant_class && c.combatant_class !== state.combatant_class) return false;
      return true;
    });
    if (!filtered.length) {
      grid.appendChild(el('div', { class: 'empty' }, 'No combatants match.'));
      return;
    }
    for (const c of filtered) grid.appendChild(combatantTile(c, () => navigate(`#/combatants/${c.slug}`)));
  }

  render();
}

function combatantTile(c, onClick) {
  const stars = c.stars || (c.rarity === 'mythic' ? 5 : c.rarity === 'legendary' ? 4 : 3);
  return el('div', { class: 'combatant-tile', onclick: onClick, title: c.name }, [
    el('div', { class: 'combatant-portrait' }, [
      el('img', { src: c.portrait_url, alt: c.name, loading: 'lazy',
        onerror: (e) => { e.target.remove(); } }),
      el('div', { class: `combatant-stars rarity-${c.rarity || 'common'}` },
        Array.from({ length: stars }, () => el('span', { class: 'star' }, '★'))),
    ]),
    el('div', { class: 'combatant-body' }, [
      el('div', { class: 'combatant-name' }, c.name),
      el('div', { class: 'combatant-meta' }, [
        c.element ? el('span', { class: `tag tag-element tag-element-${c.element.toLowerCase()}` }, c.element) : null,
        el('span', { class: 'tag tag-character' }, c.combatant_class || 'Combatant'),
      ].filter(Boolean)),
    ]),
  ]);
}

/* ─── detail view ─────────────────────────────── */

export async function renderCombatantDetail({ view, navigate, toast }, slug) {
  clear(view);

  let combatants, combatant, allCards;
  try {
    combatants = await loadCombatants();
    combatant = combatants.find(c => c.slug === slug);
    const cardsRes = await fetch('cards.json?v=5');
    allCards = await cardsRes.json();
  } catch (err) {
    view.appendChild(el('div', { class: 'empty' }, `Failed: ${err.message}`));
    return;
  }

  if (!combatant) {
    view.appendChild(el('div', { class: 'empty' }, 'Combatant not found.'));
    return;
  }

  const theirCards = allCards.filter(c => c.combatant === combatant.name);
  const startCards  = theirCards.filter(c => c.kind === 'basic');
  const uniqueCards = theirCards.filter(c => c.kind === 'unique');

  view.appendChild(el('div', { class: 'view-header' }, [
    el('button', { class: 'btn btn-ghost', onclick: () => navigate('#/combatants') }, '← Combatants'),
  ]));

  // Compact header: portrait thumbnail + name + class/rarity tags
  const stars = combatant.stars || (combatant.rarity === 'mythic' ? 5 : combatant.rarity === 'legendary' ? 4 : 3);
  view.appendChild(el('div', { class: 'combatant-hero' }, [
    el('div', { class: 'combatant-hero-portrait' }, [
      el('img', { src: combatant.portrait_url, alt: combatant.name,
        onerror: (e) => { e.target.remove(); } }),
    ]),
    el('div', { class: 'combatant-hero-info' }, [
      el('div', { class: `combatant-hero-stars rarity-${combatant.rarity || 'common'}` },
        Array.from({ length: stars }, () => el('span', { class: 'star' }, '★'))),
      el('h1', { class: 'combatant-hero-name' }, combatant.name),
      el('div', { class: 'combatant-hero-tags' }, [
        combatant.element ? el('span', { class: `tag tag-element tag-element-${combatant.element.toLowerCase()}` }, combatant.element) : null,
        el('span', { class: 'tag tag-character' }, combatant.combatant_class || 'Combatant'),
      ].filter(Boolean)),
    ]),
  ]));

  // Cards sections, each as a horizontal grid row
  view.appendChild(el('section', { class: 'combatant-section' }, [
    el('h2', { class: 'section-title' }, 'Start Cards'),
    el('div', { class: 'card-grid card-grid-compact' }, startCards.map(c => cardTile(c))),
  ]));

  if (uniqueCards.length) {
    view.appendChild(el('section', { class: 'combatant-section' }, [
      el('h2', { class: 'section-title' }, 'Unique Cards'),
      el('div', { class: 'card-grid card-grid-compact' }, uniqueCards.map(c => cardTile(c))),
    ]));
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
