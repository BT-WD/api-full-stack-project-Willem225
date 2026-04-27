import { el, clear, cardTile } from '../ui.js';
import { api, getToken } from '../api.js';
import {
  calculateFaintMemory, FLAGS, EPIPHANIES, TIER_MIN, TIER_MAX,
} from '../faintMemory.js';

export async function renderBuilder({ view, navigate, toast }, { mode, id }) {
  clear(view);

  // state
  const deck = {
    id: null,
    name: 'New Deck',
    description: '',
    character: '',       // combatant name (e.g. "Diana")
    tier: 1,
    nightmare: false,
    cards: [],           // [{ card, flag, epiphany, is_starter }]
  };

  let allCards   = [];
  let combatants = [];

  // header + containers
  const backHref = mode === 'edit' ? '#/decks' : '#/cards';
  view.appendChild(el('div', { class: 'view-header' }, [
    el('h1', { class: 'grow' }, mode === 'edit' ? 'Edit Deck' : 'Deck Builder'),
    el('button', { class: 'btn btn-ghost', onclick: () => navigate(backHref) }, '← Back'),
  ]));

  const layout = el('div', { class: 'builder' });
  view.appendChild(layout);

  const main    = el('div', { class: 'builder-main' });
  const sidebar = el('div', { class: 'fm-sidebar' });
  layout.append(main, sidebar);

  // load deck + card catalog + combatants in parallel
  try {
    const [deckRes, cardsRes, combatantsRes] = await Promise.all([
      mode === 'edit' ? api.deck(id) : Promise.resolve(null),
      api.cards({ limit: 5000, include_character_cards: true }),
      api.combatants(),
    ]);
    allCards = cardsRes.cards;
    combatants = (combatantsRes.combatants || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    if (deckRes) Object.assign(deck, {
      id: deckRes.deck.id,
      name: deckRes.deck.name,
      description: deckRes.deck.description || '',
      character: deckRes.deck.character || '',
      tier: deckRes.deck.tier,
      nightmare: deckRes.deck.nightmare,
      cards: deckRes.deck.cards.map(c => ({
        card: c.card,
        flag: c.flag,
        epiphany: c.epiphany,
        is_starter: c.is_starter,
      })),
    });
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  // ── header controls ──
  const nameInput  = el('input', { class: 'input', type: 'text', value: deck.name,
    oninput: () => { deck.name = nameInput.value; refreshSidebar(); } });
  const tierSelect = el('select', { class: 'select',
    onchange: () => { deck.tier = Number(tierSelect.value); refreshSidebar(); } });
  for (let t = TIER_MIN; t <= TIER_MAX; t++) {
    tierSelect.appendChild(el('option', { value: t, selected: t === deck.tier }, `Tier ${t}`));
  }
  const nmCheck = el('input', { type: 'checkbox', checked: deck.nightmare,
    onchange: () => { deck.nightmare = nmCheck.checked; refreshSidebar(); } });

  const descInput = el('textarea', {
    class: 'textarea', placeholder: 'Description (optional)', value: deck.description,
    oninput: () => { deck.description = descInput.value; },
  });

  // combatant picker (replaces free-text character field)
  const combatantSelect = el('select', {
    class: 'select',
    onchange: () => {
      deck.character = combatantSelect.value;
      renderCharacterCards();
      renderCardList();   // refresh because combatant change affects which uniques are filtered out
      refreshSidebar();
    },
  }, [el('option', { value: '' }, 'No combatant')]);
  for (const c of combatants) {
    combatantSelect.appendChild(el('option', {
      value: c.name, selected: c.name === deck.character,
    }, `${c.name} — ${c.element || ''} · ${c.combatant_class || ''}`));
  }

  main.appendChild(el('div', { class: 'builder-header' }, [
    el('div', { class: 'field' }, [el('label', {}, 'Name'), nameInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Tier'), tierSelect]),
    el('div', { class: 'field' }, [
      el('label', {}, 'Nightmare'),
      el('label', { class: 'row', style: { gap: '6px' } }, [nmCheck, el('span', {}, 'Mode')]),
    ]),
  ]));
  main.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Combatant'), combatantSelect]));
  main.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Description'), descInput]));

  // ── character cards (starters + uniques in one grid) ──
  main.appendChild(el('h2', { class: 'mt-2' }, 'Character Cards'));
  main.appendChild(el('p', { class: 'builder-hint' },
    'Starters first, then uniques (rare → legendary → mythic). Starters are free; removing one costs a flat 20 FM. Uniques are free; only Divine Epiphany costs memory (+20 FM).'));
  const characterWrap = el('div', { class: 'starter-grid' });
  main.appendChild(characterWrap);

  // ── other cards (neutrals / forbiddens / monsters) ──
  main.appendChild(el('h2', { class: 'mt-3' }, 'Other Cards'));
  main.appendChild(el('p', { class: 'builder-hint' },
    'Neutral, Forbidden, and Monster cards you add to your deck. Each has its own base FM cost. Hover a tile to remove or duplicate it.'));
  const cardsWrap = el('div', { class: 'starter-grid' });
  main.appendChild(cardsWrap);

  main.appendChild(el('button', {
    class: 'btn mt-2', onclick: () => openAddModal(),
  }, '+ Add Card'));

  // ── save / delete ──
  const loggedIn = Boolean(getToken());
  const actions = el('div', { class: 'row mt-3' }, [
    loggedIn
      ? el('button', { class: 'btn btn-primary', onclick: save }, mode === 'edit' ? 'Save changes' : 'Create deck')
      : el('a', { class: 'btn btn-primary', href: '#/login' }, 'Log in to save this deck'),
    mode === 'edit' ? el('button', { class: 'btn btn-danger', onclick: remove }, 'Delete deck') : null,
  ].filter(Boolean));
  main.appendChild(actions);

  // ── renderers ──

  // Display order:
  //   starters:  by gk_sort ascending (Launcher, Charge Launcher, Barrier, Opening Found, …)
  //   uniques:   by rarity (rare → legendary → mythic), then gk_sort ascending
  const RARITY_ORDER = { common: 0, rare: 1, legendary: 2, mythic: 3 };

  function starterCards() {
    if (!deck.character) return [];
    return allCards
      .filter(c => c.combatant === deck.character && c.kind === 'basic')
      .sort((a, b) => (a.gk_sort ?? 0) - (b.gk_sort ?? 0));
  }

  function uniqueCards() {
    if (!deck.character) return [];
    return allCards
      .filter(c => c.combatant === deck.character && c.kind === 'unique')
      .sort((a, b) => {
        const ra = RARITY_ORDER[a.rarity] ?? 99;
        const rb = RARITY_ORDER[b.rarity] ?? 99;
        if (ra !== rb) return ra - rb;
        return (a.gk_sort ?? 0) - (b.gk_sort ?? 0);
      });
  }

  // Starter cards can only be removed (or not). No epiphany state.
  function findRemovedStarter(cardId) {
    return deck.cards.findIndex(e =>
      e.flag === 'removed' && e.is_starter === true && e.card?.id === cardId);
  }

  function findUniqueEpiphanyEntry(cardId) {
    return deck.cards.findIndex(e =>
      !e.is_starter && e.flag === 'normal' && e.card?.id === cardId);
  }

  function findRemovedUnique(cardId) {
    return deck.cards.findIndex(e =>
      !e.is_starter && e.flag === 'removed' && e.card?.id === cardId);
  }

  function toggleUniqueRemoval(card) {
    const removedIdx = findRemovedUnique(card.id);
    if (removedIdx >= 0) {
      // already removed → put it back
      deck.cards.splice(removedIdx, 1);
    } else {
      // active or has epiphany → switch to removed; drop any epiphany entry first
      const epIdx = findUniqueEpiphanyEntry(card.id);
      if (epIdx >= 0) deck.cards.splice(epIdx, 1);
      deck.cards.push({ card, flag: 'removed', epiphany: 'none', is_starter: false });
    }
    renderCharacterCards();
    refreshSidebar();
  }

  function toggleStarterRemoval(card) {
    const idx = findRemovedStarter(card.id);
    if (idx >= 0) deck.cards.splice(idx, 1);
    else deck.cards.push({ card, flag: 'removed', epiphany: 'none', is_starter: true });
    renderCharacterCards();
    renderCardList();
    refreshSidebar();
  }

  function setUniqueEpiphany(card, epiphany) {
    // Picking an epiphany on a removed unique implicitly puts it back.
    const removedIdx = findRemovedUnique(card.id);
    if (removedIdx >= 0) deck.cards.splice(removedIdx, 1);

    const idx = findUniqueEpiphanyEntry(card.id);
    if (epiphany === 'none') {
      if (idx >= 0) deck.cards.splice(idx, 1);
    } else if (idx >= 0) {
      deck.cards[idx].epiphany = epiphany;
    } else {
      deck.cards.push({ card, flag: 'normal', epiphany, is_starter: false });
    }
    renderCharacterCards();
    refreshSidebar();
  }

  function tileAction(label, { active, danger, onclick, title } = {}) {
    return el('button', {
      class: `tile-action${active ? ' active' : ''}${danger ? ' danger' : ''}`,
      onclick, title,
    }, label);
  }

  // SVG icon helpers for the top-right corner buttons.
  const ICON_X         = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_RESTORE   = '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>';
  const ICON_DUPLICATE = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

  function cornerButton(svg, { onclick, title, danger } = {}) {
    return el('button', {
      class: `tile-corner-action${danger ? ' danger' : ''}`,
      onclick, title, html: svg,
    });
  }

  function renderCharacterCards() {
    clear(characterWrap);
    const starters = starterCards();
    const uniques  = uniqueCards();

    if (!starters.length && !uniques.length) {
      characterWrap.appendChild(el('div', { class: 'empty' },
        deck.character ? `${deck.character} has no character cards in the data.` : 'Pick a combatant above to see their character cards.'));
      return;
    }

    // Starters render with a Remove pill; uniques with the 3-state epiphany pills.
    for (const card of starters) characterWrap.appendChild(buildStarterTile(card));
    for (const card of uniques)  characterWrap.appendChild(buildUniqueTile(card));
  }

  function buildStarterTile(card) {
    const removed = findRemovedStarter(card.id) >= 0;
    const corner = el('div', { class: 'tile-corners' }, [
      cornerButton(removed ? ICON_RESTORE : ICON_X, {
        danger: !removed,
        title: removed ? 'Put this starter back in the deck' : 'Remove this starter (20 FM)',
        onclick: () => toggleStarterRemoval(card),
      }),
    ]);
    return el('div', { class: `tile-slot${removed ? ' is-removed' : ''}` }, [cardTile(card), corner]);
  }

  function buildUniqueTile(card) {
    const removed = findRemovedUnique(card.id) >= 0;
    const idx = findUniqueEpiphanyEntry(card.id);
    const currentEp = idx >= 0 ? deck.cards[idx].epiphany : 'none';

    const corner = el('div', { class: 'tile-corners' }, [
      cornerButton(removed ? ICON_RESTORE : ICON_X, {
        danger: !removed,
        title: removed ? 'Put this unique card back' : 'Remove this unique card (free)',
        onclick: () => toggleUniqueRemoval(card),
      }),
    ]);

    const actions = el('div', { class: 'tile-actions' }, [
      tileAction('None', {
        active: currentEp === 'none' && !removed, title: 'No epiphany',
        onclick: () => setUniqueEpiphany(card, 'none'),
      }),
      tileAction('Epiphany', {
        active: currentEp === 'normal' && !removed, title: 'Standard epiphany — free',
        onclick: () => setUniqueEpiphany(card, 'normal'),
      }),
      tileAction('Divine', {
        active: currentEp === 'divine' && !removed, title: 'Divine epiphany — +20 FM',
        onclick: () => setUniqueEpiphany(card, 'divine'),
      }),
    ]);
    return el('div', { class: `tile-slot${removed ? ' is-removed' : ''}` }, [cardTile(card), corner, actions]);
  }

  function renderCardList() {
    clear(cardsWrap);
    // Filter out starters (rendered in Character Cards) and unique-card epiphany
    // entries for the selected combatant (also rendered in Character Cards).
    const others = deck.cards.filter(e => {
      if (e.is_starter) return false;
      if (e.card?.kind === 'unique' && e.card?.combatant === deck.character) return false;
      return true;
    });
    if (!others.length) {
      cardsWrap.appendChild(el('div', { class: 'empty' }, 'No neutral/forbidden/monster cards added yet. Click “+ Add Card”.'));
      return;
    }
    // Group by card id so each card shows as ONE tile with a count badge.
    const byId = new Map();
    for (const entry of others) {
      const k = entry.card.id;
      if (!byId.has(k)) byId.set(k, []);
      byId.get(k).push(entry);
    }
    for (const entries of byId.values()) {
      cardsWrap.appendChild(buildOtherCardTile(entries));
    }
  }

  // Add another copy of a non-character card. First copy = flag 'normal', extras
  // are 'duplicate' (so the FM cost ladder kicks in correctly).
  function duplicateOtherCard(card) {
    const existing = deck.cards.filter(e => !e.is_starter && e.card?.id === card.id).length;
    deck.cards.push({
      card,
      flag: existing === 0 ? 'normal' : 'duplicate',
      epiphany: 'none',
      is_starter: false,
    });
    renderCardList();
    refreshSidebar();
  }

  // Remove the most recently added entry for this card (one click = one copy).
  function removeOneOtherCard(card) {
    for (let i = deck.cards.length - 1; i >= 0; i--) {
      const e = deck.cards[i];
      if (!e.is_starter && e.card?.id === card.id) {
        deck.cards.splice(i, 1);
        break;
      }
    }
    // After removal, if a single copy remains it should be 'normal', not 'duplicate'.
    const remaining = deck.cards.filter(e => !e.is_starter && e.card?.id === card.id);
    if (remaining.length === 1) remaining[0].flag = 'normal';
    renderCardList();
    refreshSidebar();
  }

  function buildOtherCardTile(entries) {
    const card = entries[0].card;
    const count = entries.length;
    const firstEntry = entries[0];

    const corner = el('div', { class: 'tile-corners' }, [
      cornerButton(ICON_X, {
        danger: true,
        title: count > 1 ? `Remove one copy (${count} in deck)` : 'Remove from deck',
        onclick: () => removeOneOtherCard(card),
      }),
      cornerButton(ICON_DUPLICATE, {
        title: 'Duplicate this card',
        onclick: () => duplicateOtherCard(card),
      }),
    ]);

    const epActions = el('div', { class: 'tile-actions' }, [
      tileAction('None', {
        active: firstEntry.epiphany === 'none', title: 'No epiphany',
        onclick: () => { firstEntry.epiphany = 'none'; renderCardList(); refreshSidebar(); },
      }),
      tileAction('Epiphany', {
        active: firstEntry.epiphany === 'normal', title: 'Standard epiphany — +10 FM',
        onclick: () => { firstEntry.epiphany = 'normal'; renderCardList(); refreshSidebar(); },
      }),
      tileAction('Divine', {
        active: firstEntry.epiphany === 'divine', title: 'Divine epiphany — +30 FM',
        onclick: () => { firstEntry.epiphany = 'divine'; renderCardList(); refreshSidebar(); },
      }),
    ]);

    const children = [cardTile(card), corner, epActions];
    if (count > 1) children.push(el('div', { class: 'tile-count-badge' }, `× ${count}`));

    return el('div', { class: 'tile-slot' }, children);
  }

  function refreshSidebar() {
    clear(sidebar);
    const entries = deck.cards.map(c => ({
      card: c.card, flag: c.flag, epiphany: c.epiphany, isStarter: Boolean(c.is_starter),
    }));
    const result = calculateFaintMemory({
      entries, tier: deck.tier, nightmare: deck.nightmare,
    });

    const ratio = result.cap > 0 ? Math.min(1, result.total / result.cap) : 0;
    const barClass = result.overCap ? 'danger' : (ratio >= 0.8 ? 'warn' : '');
    sidebar.appendChild(el('h2', {}, 'Faint Memory'));
    sidebar.appendChild(el('div', { class: 'fm-total' }, [
      el('span', {}, String(result.total)),
      el('span', { class: 'slash' }, '/'),
      el('span', { class: 'cap' }, String(result.cap)),
    ]));
    sidebar.appendChild(el('div', { class: 'fm-bar' }, [
      el('div', { class: `fm-bar-fill ${barClass}`, style: { width: `${ratio * 100}%` } }),
    ]));
    sidebar.appendChild(el('h3', {}, 'By category'));
    const br = el('div', { class: 'fm-breakdown' });
    const rows = [
      ['Character', result.breakdown.byType.character || 0],
      ['Neutral',   result.breakdown.byType.neutral   || 0],
      ['Forbidden', result.breakdown.byType.forbidden || 0],
      ['Monster',   result.breakdown.byType.monster   || 0],
      ['Epiphany',  result.breakdown.epiphany],
      ['Duplicates',result.breakdown.duplicates],
      ['Removals',  result.breakdown.removals],
    ];
    for (const [label, value] of rows) {
      br.appendChild(el('div', { class: 'fm-breakdown-row' }, [
        el('span', { class: 'label' }, label),
        el('span', { class: 'value' }, String(value)),
      ]));
    }
    sidebar.appendChild(br);
    if (result.warnings.length) {
      const w = el('div', { class: 'fm-warnings' }, [
        el('strong', {}, 'Warnings'),
        el('ul', {}, result.warnings.map(msg => el('li', {}, msg))),
      ]);
      sidebar.appendChild(w);
    }
  }

  function openAddModal() {
    const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
    const search = el('input', { class: 'input', type: 'search', placeholder: 'Search cards…',
      oninput: () => renderList(search.value.trim().toLowerCase()) });
    const list = el('div', { class: 'card-grid', style: { marginTop: '12px' } });
    const modal = el('div', { class: 'modal' }, [
      el('div', { class: 'row' }, [
        el('h2', { class: 'grow' }, 'Add neutral, forbidden, or monster card'),
        el('button', { class: 'btn btn-ghost', onclick: close }, '✕'),
      ]),
      search,
      el('div', { class: 'modal-body' }, [list]),
    ]);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    search.focus();

    function close() { document.body.removeChild(overlay); }

    function renderList(q = '') {
      clear(list);
      // Exclude character cards from this modal — they belong to the Start/Unique
      // sections above. Keep neutrals, forbiddens, and monsters here.
      const pool = allCards.filter(c => c.card_type !== 'character');
      const filtered = q
        ? pool.filter(c => (c.name + ' ' + (c.description || '')).toLowerCase().includes(q))
        : pool;
      if (!filtered.length) {
        list.appendChild(el('div', { class: 'empty' }, 'No cards match.'));
        return;
      }
      for (const c of filtered.slice(0, 300)) {
        list.appendChild(cardTile(c, {
          onSelect: () => {
            deck.cards.push({ card: c, flag: 'normal', epiphany: 'none', is_starter: false });
            close();
            renderCardList();
            refreshSidebar();
          },
        }));
      }
    }
    renderList();
  }

  async function save() {
    try {
      const payload = {
        name: deck.name,
        description: deck.description,
        character: deck.character,
        tier: deck.tier,
        nightmare: deck.nightmare,
        cards: deck.cards.map((c, i) => ({
          card_id: c.card.id, flag: c.flag, epiphany: c.epiphany,
          is_starter: Boolean(c.is_starter), position: i,
        })),
      };
      if (mode === 'edit') {
        await api.updateDeck(deck.id, payload);
        toast('Deck saved.', 'ok');
      } else {
        const res = await api.createDeck(payload);
        toast('Deck created.', 'ok');
        navigate(`#/decks/${res.deck.id}`);
      }
    } catch (err) { toast(err.message, 'error'); }
  }

  async function remove() {
    if (!confirm(`Delete deck "${deck.name}"?`)) return;
    try {
      await api.deleteDeck(deck.id);
      toast('Deck deleted.', 'ok');
      navigate('#/decks');
    } catch (err) { toast(err.message, 'error'); }
  }

  renderCharacterCards();
  renderCardList();
  refreshSidebar();
}

// Display labels for epiphany dropdowns.
//   'unique' → unique character cards (Normal free, Divine +20)
//   'other'  → neutrals / forbiddens / monsters (Normal +10, Divine +30)
function labelEpiphany(value, kind) {
  if (value === 'none') return 'No epiphany';
  if (value === 'normal') return kind === 'unique' ? 'Epiphany (free)' : 'Epiphany (+10)';
  if (value === 'divine') return kind === 'unique' ? 'Divine (+20)'    : 'Divine (+30)';
  return value;
}
