// Client-side MIRROR of server/lib/faintMemory.js.
// Keep the two in sync — same rules, same return shape.
// The server copy is authoritative; this exists purely for instant UI feedback.

export const CARD_TYPES       = ['character', 'neutral', 'forbidden', 'monster'];
export const MONSTER_RARITIES = ['common', 'rare', 'legendary'];
export const EPIPHANIES       = ['none', 'normal', 'divine'];
export const FLAGS            = ['normal', 'starter', 'duplicate', 'removed'];

export const DUPLICATE_COSTS  = [0, 0, 40, 40];
export const MAX_COPIES       = 4;
export const REMOVAL_COSTS    = [0, 10, 30, 50, 70];
export const MAX_REMOVALS     = 5;
export const STARTER_REMOVAL_COST = 20;     // flat cost per starter removed
export const STARTER_REMOVAL_SURCHARGE = 20; // legacy alias, kept for compatibility
export const EQUIPMENT_PER_LEVEL = 10;
export const MAX_EQUIPMENT_LEVEL = 2;
export const TIER_MIN = 1;
export const TIER_MAX = 13;

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

export function epiphanyCost(epiphany, isStarter) {
  const e = String(epiphany || 'none').toLowerCase();
  if (e === 'none' || e === '') return 0;
  if (e === 'normal') return isStarter ? 0 : 10;
  if (e === 'divine') return isStarter ? 20 : 30;
  return 0;
}

function entryIsStarter(e) { return e.flag === 'starter' || e.isStarter === true; }
function entryCardId(e) {
  const c = e.card || {};
  return c.id ?? c.name ?? JSON.stringify(c);
}

export function calculateFaintMemory({ entries = [], equipment = [], tier = 1, nightmare = false } = {}) {
  const breakdown = {
    byType: { character: 0, neutral: 0, forbidden: 0, monster: 0 },
    epiphany: 0, duplicates: 0, removals: 0, equipment: 0,
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
    breakdown.epiphany += epiphanyCost(e.epiphany, entryIsStarter(e));
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
    breakdown.epiphany += epiphanyCost(e.epiphany, false);
  }

  // Starter removals are flat-cost (20 each) and tracked separately from the
  // removal ladder. Non-starter removals still follow 0 / 10 / 30 / 50 / 70.
  const nonStarterRemovals = removed.filter(e => !(entryIsStarter(e) || e.wasStarter === true));
  const starterRemovals    = removed.filter(e =>  (entryIsStarter(e) || e.wasStarter === true));

  nonStarterRemovals.forEach((e, i) => {
    if (i >= MAX_REMOVALS) { warnings.push(`Too many removals (max ${MAX_REMOVALS}).`); return; }
    breakdown.removals += REMOVAL_COSTS[i];
  });
  starterRemovals.forEach(() => {
    breakdown.removals += STARTER_REMOVAL_COST;
  });

  for (const eq of equipment) {
    const lvl = clamp(Number(eq?.level) || 0, 0, MAX_EQUIPMENT_LEVEL);
    breakdown.equipment += lvl * EQUIPMENT_PER_LEVEL;
  }

  const categoryTotal = Object.values(breakdown.byType).reduce((a, b) => a + b, 0);
  const total = categoryTotal + breakdown.epiphany + breakdown.duplicates + breakdown.removals + breakdown.equipment;
  const cap = tierCap(tier, nightmare);
  const overCap = total > cap;
  if (overCap) warnings.push(`Deck exceeds Faint Memory cap: ${total} / ${cap}.`);
  return { total, cap, overCap, breakdown, warnings };
}
