// Faint Memory rules engine — shared between the browser UI and the REST API.

export const CARD_TYPES       = ['character', 'neutral', 'forbidden', 'monster'];
export const MONSTER_RARITIES = ['common', 'rare', 'legendary'];
export const EPIPHANIES       = ['none', 'normal', 'divine'];
export const FLAGS            = ['normal', 'starter', 'duplicate', 'removed'];

export const DUPLICATE_COSTS  = [0, 0, 40, 40];
export const MAX_COPIES       = 4;
// CZN's current removal rules:
//   - Removing a starter card costs a flat 20 FM each.
//   - Removing any non-starter card is free.
export const STARTER_REMOVAL_COST = 20;
export const TIER_MIN = 1;
export const TIER_MAX = 15;

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export function tierCap(tier, nightmare) {
  const t = clamp(Number(tier) || TIER_MIN, TIER_MIN, TIER_MAX);
  return 30 + 10 * (t - 1) + (nightmare ? 10 : 0);
}

export function baseCardCost(card) {
  if (!card) return 0;
  const type = String(card.card_type || '').toLowerCase();
  if (type === 'character' || type === 'unique') return 0;
  if (type === 'neutral') return 20;
  if (type === 'forbidden') return 20;
  if (type === 'monster') {
    switch (String(card.monster_rarity || '').toLowerCase()) {
      case 'common':    return 20;
      case 'rare':      return 50;
      case 'legendary': return 80;
      default:          return 20;
    }
  }
  return 0;
}

// Epiphany cost depends on the card type, not on whether it's a starter:
//   - Character cards (starters + uniques): Normal = 0 (free), Divine = +20
//   - Neutral / Forbidden / Monster cards: Normal = +10, Divine = +30
//
// (In practice starter cards can't take epiphanies from the UI anymore, but we
// still compute the cost correctly for any entry that happens to carry one.)
export function epiphanyCost(epiphany, card) {
  const e = String(epiphany || 'none').toLowerCase();
  if (e === 'none' || e === '') return 0;
  const type = String(card?.card_type || '').toLowerCase();
  const isCharacter = (type === 'character' || type === 'unique');
  if (e === 'normal') return isCharacter ? 0  : 10;
  if (e === 'divine') return isCharacter ? 20 : 30;
  return 0;
}

function entryIsStarter(e) { return e.flag === 'starter' || e.isStarter === true; }
function entryCardId(e) {
  const c = e.card || {};
  return c.id ?? c.name ?? JSON.stringify(c);
}

export function calculateFaintMemory({ entries = [], tier = 1, nightmare = false } = {}) {
  const breakdown = {
    byType: { character: 0, neutral: 0, forbidden: 0, monster: 0 },
    epiphany: 0, duplicates: 0, removals: 0,
  };
  const warnings = [];

  const active     = entries.filter(e => e.flag !== 'duplicate' && e.flag !== 'removed');
  const duplicates = entries.filter(e => e.flag === 'duplicate');
  const removed    = entries.filter(e => e.flag === 'removed');
  const copyCounts = new Map();

  for (const e of active) {
    const type = String(e.card?.card_type || '').toLowerCase();
    const typeKey = (type === 'unique') ? 'character' : type;
    if (breakdown.byType[typeKey] === undefined) breakdown.byType[typeKey] = 0;
    breakdown.byType[typeKey] += baseCardCost(e.card);
    breakdown.epiphany += epiphanyCost(e.epiphany, e.card);
    const id = entryCardId(e);
    copyCounts.set(id, (copyCounts.get(id) || 0) + 1);
  }

  for (const e of duplicates) {
    const id = entryCardId(e);
    const existing = copyCounts.get(id) || 0;
    const copyNum = existing + 1;
    copyCounts.set(id, copyNum);
    if (copyNum > MAX_COPIES) {
      warnings.push(`Too many copies of "${e.card?.name ?? 'card'}" (max ${MAX_COPIES}).`);
      continue;
    }
    breakdown.duplicates += DUPLICATE_COSTS[copyNum - 1] || 0;
    breakdown.epiphany += epiphanyCost(e.epiphany, e.card);
  }

  for (const e of removed) {
    if (entryIsStarter(e) || e.wasStarter === true) {
      breakdown.removals += STARTER_REMOVAL_COST;
    }
  }

  const categoryTotal = Object.values(breakdown.byType).reduce((a, b) => a + b, 0);
  const total = categoryTotal + breakdown.epiphany + breakdown.duplicates + breakdown.removals;
  const cap = tierCap(tier, nightmare);
  const overCap = total > cap;
  if (overCap) warnings.push(`Deck exceeds Faint Memory cap: ${total} / ${cap}.`);
  return { total, cap, overCap, breakdown, warnings };
}
