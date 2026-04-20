import { el, clear } from '../ui.js';
import { api } from '../api.js';

export async function renderDecks({ view, navigate, toast }) {
  clear(view);
  view.appendChild(el('div', { class: 'row' }, [
    el('h1', { class: 'grow' }, 'My Decks'),
    el('a', { href: '#/decks/new', class: 'btn btn-primary' }, '+ New Deck'),
  ]));

  const list = el('div', { class: 'deck-list mt-2' });
  view.appendChild(list);
  list.appendChild(el('div', { class: 'empty' }, 'Loading…'));

  try {
    const { decks } = await api.decks();
    clear(list);
    if (!decks.length) {
      list.appendChild(el('div', { class: 'empty' }, 'No decks yet. Hit “+ New Deck” to create one.'));
      return;
    }
    for (const d of decks) list.appendChild(deckRow(d, { navigate, toast, refresh: () => renderDecks({ view, navigate, toast }) }));
  } catch (err) {
    clear(list);
    list.appendChild(el('div', { class: 'empty' }, `Failed: ${err.message}`));
  }
}

function deckRow(d, { navigate, toast, refresh }) {
  const nm = d.nightmare ? ' · NM' : '';
  return el('div', { class: 'deck-row' }, [
    el('div', {}, [
      el('div', { class: 'deck-name' }, d.name),
      el('div', { class: 'deck-meta' }, [
        `Tier ${d.tier}${nm}`,
        d.character ? ` · ${d.character}` : '',
        ` · ${d.cards.length} cards`,
      ].join('')),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'btn btn-sm', onclick: () => navigate(`#/decks/${d.id}`) }, 'Edit'),
      el('button', {
        class: 'btn btn-sm btn-danger',
        onclick: async () => {
          if (!confirm(`Delete deck "${d.name}"?`)) return;
          try {
            await api.deleteDeck(d.id);
            toast('Deck deleted.', 'ok');
            refresh();
          } catch (err) { toast(err.message, 'error'); }
        },
      }, 'Delete'),
    ]),
  ]);
}
