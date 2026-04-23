import { el, clear, cardTile, miniArt } from '../ui.js';
import { api } from '../api.js';
import {
  calculateFaintMemory, FLAGS, EPIPHANIES, TIER_MIN, TIER_MAX, MAX_EQUIPMENT_LEVEL,
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
    equipment: [
      { slot: 'weapon',    level: 0 },
      { slot: 'armor',     level: 0 },
      { slot: 'accessory', level: 0 },
    ],
  };

  let allCards   = [];
  let combatants = [];

  // header + containers
  view.appendChild(el('div', { class: 'view-header' }, [
    el('h1', { class: 'grow' }, mode === 'edit' ? 'Edit Deck' : 'New Deck'),
    el('button', { class: 'btn btn-ghost', onclick: () => navigate('#/decks') }, '← Back'),
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
      fetch('combatants.json?v=4').then(r => r.json()),
    ]);
    allCards = cardsRes.cards;
    combatants = combatantsRes.sort((a, b) => a.name.localeCompare(b.name));
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
      equipment: deckRes.deck.equipment.length ? deckRes.deck.equipment : deck.equipment,
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
    onchange: () => { deck.character = combatantSelect.value; renderCharacterCards(); refreshSidebar(); },
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

  // ── character cards (starters) ──
  main.appendChild(el('h2', { class: 'mt-2' }, 'Character Cards'));
  main.appendChild(el('p', { class: 'builder-hint' },
    'The starter cards from your chosen combatant. Toggling Remove applies the starter-removal rules (+20 FM surcharge on top of the removal cost ladder).'));
  const starterWrap = el('div', { class: 'deck-cards' });
  main.appendChild(starterWrap);

  // ── deck cards ──
  main.appendChild(el('h2', { class: 'mt-3' }, 'Deck Cards'));
  const cardsWrap = el('div', { class: 'deck-cards' });
  main.appendChild(cardsWrap);

  main.appendChild(el('button', {
    class: 'btn mt-2', onclick: () => openAddModal(),
  }, '+ Add Card'));

  // ── equipment ──
  main.appendChild(el('h2', { class: 'mt-3' }, 'Equipment'));
  const eqWrap = el('div', { class: 'deck-cards' });
  main.appendChild(eqWrap);

  // ── save / delete ──
  const actions = el('div', { class: 'row mt-3' }, [
    el('button', { class: 'btn btn-primary', onclick: save }, mode === 'edit' ? 'Save changes' : 'Create deck'),
    mode === 'edit' ? el('button', { class: 'btn btn-danger', onclick: remove }, 'Delete deck') : null,
  ].filter(Boolean));
  main.appendChild(actions);

  // ── renderers ──

  function starterCards() {
    // Return the basic cards of the selected combatant (empty if none selected).
    if (!deck.character) return [];
    return allCards.filter(c => c.combatant === deck.character && c.kind === 'basic');
  }

  function findRemovedStarter(cardId) {
    return deck.cards.findIndex(e =>
      e.flag === 'removed' && e.is_starter === true && e.card?.id === cardId);
  }

  function toggleStarterRemoval(card) {
    const idx = findRemovedStarter(card.id);
    if (idx >= 0) deck.cards.splice(idx, 1);
    else deck.cards.push({ card, flag: 'removed', epiphany: 'none', is_starter: true });
    renderCharacterCards();
    renderCardList();
    refreshSidebar();
  }

  function renderCharacterCards() {
    clear(starterWrap);
    const starters = starterCards();
    if (!starters.length) {
      starterWrap.appendChild(el('div', { class: 'empty' },
        deck.character ? `${deck.character} has no starter cards in the data.` : 'Pick a combatant above to see their starter cards.'));
      return;
    }
    for (const card of starters) {
      const removed = findRemovedStarter(card.id) >= 0;
      starterWrap.appendChild(el('div', { class: `deck-card-row starter-row${removed ? ' is-removed' : ''}` }, [
        miniArt(card),
        el('div', {}, [
          el('div', { class: 'card-label' }, card.name),
          el('div', { class: 'card-sublabel' }, [
            card.category || '',
            ' · Starter',
            removed ? ' · removed (+20 FM surcharge)' : '',
          ].join('')),
        ]),
        el('div', {}),
        el('div', {}),
        el('button', {
          class: `btn btn-sm ${removed ? 'btn-danger' : ''}`,
          title: removed ? 'Put this starter back in the deck' : 'Remove this starter (costs FM)',
          onclick: () => toggleStarterRemoval(card),
        }, removed ? 'Removed' : 'Remove'),
      ]));
    }
  }

  function renderCardList() {
    clear(cardsWrap);
    // Exclude starter removals from the "deck cards" list — they render in the starter section.
    const nonStarter = deck.cards.filter(e => !(e.flag === 'removed' && e.is_starter));
    if (!nonStarter.length) {
      cardsWrap.appendChild(el('div', { class: 'empty' }, 'No cards yet. Add one to get started.'));
      return;
    }
    nonStarter.forEach((entry) => {
      const idx = deck.cards.indexOf(entry);
      cardsWrap.appendChild(cardRow(entry, idx));
    });
  }

  function cardRow(entry, idx) {
    const flagSelect = el('select', {
      class: 'select',
      onchange: () => { entry.flag = flagSelect.value; if (entry.flag === 'starter') entry.is_starter = true; refreshSidebar(); },
    }, FLAGS.map(f => el('option', { value: f, selected: f === entry.flag }, f)));

    const epSelect = el('select', {
      class: 'select',
      onchange: () => { entry.epiphany = epSelect.value; refreshSidebar(); },
    }, EPIPHANIES.map(e => el('option', { value: e, selected: e === entry.epiphany }, e)));

    return el('div', { class: 'deck-card-row' }, [
      miniArt(entry.card),
      el('div', {}, [
        el('div', { class: 'card-label' }, entry.card.name),
        el('div', { class: 'card-sublabel' }, [
          entry.card.card_type || '',
          entry.card.monster_rarity ? ` · ${entry.card.monster_rarity}` : '',
          entry.card.combatant ? ` · ${entry.card.combatant}` : (entry.card.character ? ` · ${entry.card.character}` : ''),
        ].join('')),
      ]),
      flagSelect,
      epSelect,
      el('button', {
        class: 'btn btn-sm btn-ghost', title: 'Remove from deck',
        onclick: () => { deck.cards.splice(idx, 1); renderCardList(); refreshSidebar(); },
      }, '×'),
    ]);
  }

  function renderEquipment() {
    clear(eqWrap);
    deck.equipment.forEach((eq, idx) => {
      const levelSelect = el('select', {
        class: 'select',
        onchange: () => { eq.level = Number(levelSelect.value); refreshSidebar(); },
      });
      for (let l = 0; l <= MAX_EQUIPMENT_LEVEL; l++) {
        levelSelect.appendChild(el('option', { value: l, selected: l === eq.level }, `Lv ${l}`));
      }
      eqWrap.appendChild(el('div', { class: 'deck-card-row' }, [
        el('div', {}),
        el('div', { class: 'card-label' }, capitalize(eq.slot)),
        levelSelect,
        el('div', { style: { color: 'var(--muted)', fontSize: '13px' } }, `+${eq.level * 10} pts`),
        el('span', {}),
      ]));
    });
  }

  function refreshSidebar() {
    clear(sidebar);
    const entries = deck.cards.map(c => ({
      card: c.card, flag: c.flag, epiphany: c.epiphany, isStarter: Boolean(c.is_starter),
    }));
    const result = calculateFaintMemory({
      entries, equipment: deck.equipment, tier: deck.tier, nightmare: deck.nightmare,
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
      ['Equipment', result.breakdown.equipment],
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
        el('h2', { class: 'grow' }, 'Add card'),
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
      const filtered = q
        ? allCards.filter(c => (c.name + ' ' + (c.description || '')).toLowerCase().includes(q))
        : allCards;
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
        equipment: deck.equipment,
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
  renderEquipment();
  refreshSidebar();
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
