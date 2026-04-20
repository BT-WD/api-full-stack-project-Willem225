import { el, clear } from '../ui.js';
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
    character: '',
    tier: 1,
    nightmare: false,
    cards: [],       // [{ card, flag, epiphany, is_starter }]
    equipment: [     // three slots by default
      { slot: 'weapon',    level: 0 },
      { slot: 'armor',     level: 0 },
      { slot: 'accessory', level: 0 },
    ],
  };

  let allCards = [];

  // header + containers
  view.appendChild(el('div', { class: 'row' }, [
    el('h1', { class: 'grow' }, mode === 'edit' ? 'Edit Deck' : 'New Deck'),
    el('button', { class: 'btn btn-ghost', onclick: () => navigate('#/decks') }, '← Back'),
  ]));

  const layout = el('div', { class: 'builder mt-2' });
  view.appendChild(layout);

  const main    = el('div', { class: 'builder-main' });
  const sidebar = el('div', { class: 'fm-sidebar' });
  layout.append(main, sidebar);

  // load deck if editing + load card catalog in parallel
  try {
    const [deckRes, cardsRes] = await Promise.all([
      mode === 'edit' ? api.deck(id) : Promise.resolve(null),
      api.cards({ limit: 5000 }),
    ]);
    allCards = cardsRes.cards;
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
  const charInput = el('input', {
    class: 'input', type: 'text', placeholder: 'Main combatant', value: deck.character,
    oninput: () => { deck.character = charInput.value; },
  });

  main.appendChild(el('div', { class: 'builder-header' }, [
    el('div', { class: 'field' }, [el('label', {}, 'Name'), nameInput]),
    el('div', { class: 'field' }, [el('label', {}, 'Tier'), tierSelect]),
    el('div', { class: 'field' }, [
      el('label', {}, 'Nightmare'),
      el('label', { class: 'row', style: { gap: '6px' } }, [nmCheck, el('span', {}, 'Mode')]),
    ]),
  ]));
  main.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Character'), charInput]));
  main.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Description'), descInput]));

  // ── cards list ──
  main.appendChild(el('h2', { class: 'mt-2' }, 'Cards'));
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
  function renderCardList() {
    clear(cardsWrap);
    if (!deck.cards.length) {
      cardsWrap.appendChild(el('div', { class: 'empty' }, 'No cards yet. Add one to get started.'));
      return;
    }
    deck.cards.forEach((entry, idx) => cardsWrap.appendChild(cardRow(entry, idx)));
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
      el('div', {}, [
        el('div', { class: 'card-label' }, entry.card.name),
        el('div', { class: 'card-sublabel' }, [
          entry.card.card_type || '',
          entry.card.monster_rarity ? ` · ${entry.card.monster_rarity}` : '',
          entry.card.character ? ` · ${entry.card.character}` : '',
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
        el('div', { class: 'card-label' }, eq.slot),
        levelSelect,
        el('div', {}, `+${eq.level * 10} pts`),
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
        const tile = el('div', {
          class: 'card-tile',
          onclick: () => {
            deck.cards.push({ card: c, flag: 'normal', epiphany: 'none', is_starter: false });
            close();
            renderCardList();
            refreshSidebar();
          },
        }, [
          el('div', { class: 'card-name' }, c.name),
          el('div', { class: 'card-meta' }, [
            el('span', { class: `tag tag-${(c.card_type || 'neutral').toLowerCase()}` }, c.card_type || ''),
            c.character ? el('span', {}, ` · ${c.character}`) : null,
          ].filter(Boolean)),
        ]);
        list.appendChild(tile);
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

  renderCardList();
  renderEquipment();
  refreshSidebar();
}
