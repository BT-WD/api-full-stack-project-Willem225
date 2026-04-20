// Faint Memory rules engine for Chaos Zero Nightmare.
// Authoritative server-side calculator. The client copy in
// public/js/faintMemory.js mirrors this for instant UI feedback — keep them in sync.

const CARD_TYPES = Object.freeze(['character', 'neutral', 'forbidden', 'monster']);
const MONSTER_RARITIES = Object.freeze(['common', 'rare', 'legendary']);
const EPIPHANIES = Object.freeze(['none', 'normal', 'divine']);
const FLAGS = Object.freeze(['normal', 'starter', 'duplicate', 'removed']);

const DUPLICATE_COSTS = Object.freeze([0, 0, 40, 40]);   // cost of Nth copy (1..4)
const MAX_COPIES = 4;

const REMOVAL_COSTS = Object.freeze([0, 10, 30, 50, 70]); // cost of Nth removal (1..5)
const MAX_REMOVALS = 5;
const STARTER_REMOVAL_SURCHARGE = 20;

const EQUIPMENT_PER_LEVEL = 10;
const MAX_EQUIPMENT_LEVEL = 2;

const TIER_MIN = 1;
const TIER_MAX = 13;
const TIER_BASE = 30;
const TIER_STEP = 10;
const NIGHTMARE_BONUS = 10;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function tierCap(tier, nightmare) {
  const t = clamp(Number(tier) || TIER_MIN, TIER_MIN, TIER_MAX);
  return TIER_BASE + TIER_STEP * (t - 1) + (nightmare ? NIGHTMARE_BONUS : 0);
}

function baseCardCost(card) {
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

function epiphanyCost(epiphany, isStarter) {
  const e = String(epiphany || 'none').toLowerCase();
  if (e === 'none' || e === '') return 0;
  if (e === 'normal') return isStarter ? 0 : 10;
  if (e === 'divine') return isStarter ? 20 : 30;
  return 0;
}

function entryIsStarter(entry) {
  return entry.flag === 'starter' || entry.isStarter === true;
}

function entryCardId(entry) {
  const c = entry.card || {};
  return c.id ?? c.name ?? JSON.stringify(c);
}

function calculateFaintMemory(input = {}) {
  const entries   = Array.isArray(input.entries) ? input.entries : [];
  const equipment = Array.isArray(input.equipment) ? input.equipment : [];
  const tier      = input.tier ?? 1;
  const nightmare = Boolean(input.nightmare);

  const breakdown = {
    byType: { character: 0, neutral: 0, forbidden: 0, monster: 0 },
    epiphany: 0,
    duplicates: 0,
    removals: 0,
    equipment: 0,
  };
  const warnings = [];

  const active     = entries.filter(e => e.flag !== 'duplicate' && e.flag !== 'removed');
  const duplicates = entries.filter(e => e.flag === 'duplicate');
  const removed    = entries.filter(e => e.flag === 'removed');

  const copyCounts = new Map();

  for (const e of active) {
    const type = String(e.card?.card_type || '').toLowerCase();
    const typeKey = (type === 'unique') ? 'character' : type;
    const base = baseCardCost(e.card);
    if (breakdown.byType[typeKey] === undefined) breakdown.byType[typeKey] = 0;
    breakdown.byType[typeKey] += base;

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

  removed.forEach((e, i) => {
    if (i >= MAX_REMOVALS) {
      warnings.push(`Too many removals (max ${MAX_REMOVALS}).`);
      return;
    }
    let cost = REMOVAL_COSTS[i];
    if (entryIsStarter(e) || e.wasStarter === true) {
      cost += STARTER_REMOVAL_SURCHARGE;
    }
    breakdown.removals += cost;
  });

  for (const eq of equipment) {
    const lvl = clamp(Number(eq?.level) || 0, 0, MAX_EQUIPMENT_LEVEL);
    breakdown.equipment += lvl * EQUIPMENT_PER_LEVEL;
  }

  const categoryTotal = Object.values(breakdown.byType).reduce((a, b) => a + b, 0);
  const total = categoryTotal
    + breakdown.epiphany
    + breakdown.duplicates
    + breakdown.removals
    + breakdown.equipment;

  const cap = tierCap(tier, nightmare);
  const overCap = total > cap;
  if (overCap) warnings.push(`Deck exceeds Faint Memory cap: ${total} / ${cap}.`);

  return { total, cap, overCap, breakdown, warnings };
}

module.exports = {
  calculateFaintMemory,
  tierCap,
  baseCardCost,
  epiphanyCost,
  CARD_TYPES,
  MONSTER_RARITIES,
  EPIPHANIES,
  FLAGS,
  DUPLICATE_COSTS,
  REMOVAL_COSTS,
  STARTER_REMOVAL_SURCHARGE,
  EQUIPMENT_PER_LEVEL,
  MAX_EQUIPMENT_LEVEL,
  MAX_COPIES,
  MAX_REMOVALS,
  TIER_MIN,
  TIER_MAX,
};
