import { el, clear, cardTile } from '../ui.js';
import { api } from '../api.js';

export async function renderCards({ view, toast }) {
  clear(view);

  view.appendChild(el('div', { class: 'view-header' }, [
    el('h1', {}, 'Cards'),
    el('div', { class: 'row' }, [
      el('span', { class: 'tag tag-character' }, 'Character'),
      el('span', { class: 'tag tag-neutral' },   'Neutral'),
      el('span', { class: 'tag tag-forbidden' }, 'Forbidden'),
      el('span', { class: 'tag tag-monster' },   'Monster'),
    ]),
  ]));

  const state = { q: '', character: '', category: '', card_type: '', combatant: '' };

  const filtersBar = el('div', { class: 'filters' });
  view.appendChild(filtersBar);

  const grid = el('div', { class: 'card-grid' });
  view.appendChild(grid);

  const searchInput = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search cards by name or text…',
    oninput: debounce(() => { state.q = searchInput.value.trim(); reload(); }, 200),
  });

  const combatantSelect = el('select', {
    class: 'select',
    onchange: () => { state.combatant = combatantSelect.value; reload(); },
  }, [el('option', { value: '' }, 'All combatants')]);

  const typeSelect = el('select', {
    class: 'select',
    onchange: () => { state.card_type = typeSelect.value; reload(); },
  }, [el('option', { value: '' }, 'All types')]);

  const catSelect = el('select', {
    class: 'select',
    onchange: () => { state.category = catSelect.value; reload(); },
  }, [el('option', { value: '' }, 'All categories')]);

  filtersBar.append(searchInput, combatantSelect, typeSelect, catSelect);

  // Populate combatants from combatants.json
  try {
    const res = await fetch('combatants.json', { cache: 'force-cache' });
    const combatants = await res.json();
    combatants.sort((a, b) => a.name.localeCompare(b.name));
    for (const c of combatants) combatantSelect.appendChild(el('option', { value: c.name }, c.name));
  } catch { /* ignore */ }

  try {
    const f = await api.cardFilters();
    for (const c of f.categories)  catSelect.appendChild(el('option',  { value: c }, c));
    for (const t of f.card_types)  typeSelect.appendChild(el('option', { value: t }, t));
  } catch { /* filter load is best-effort */ }

  async function reload() {
    clear(grid);
    grid.appendChild(el('div', { class: 'empty' }, 'Loading…'));
    try {
      const { cards } = await api.cards(state);
      clear(grid);
      if (!cards.length) {
        grid.appendChild(el('div', { class: 'empty' }, 'No cards match.'));
        return;
      }
      for (const c of cards) grid.appendChild(cardTile(c));
    } catch (err) {
      clear(grid);
      grid.appendChild(el('div', { class: 'empty' }, `Failed: ${err.message}`));
      toast(err.message, 'error');
    }
  }

  reload();
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
