const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateFaintMemory, tierCap, baseCardCost, epiphanyCost,
} = require('../server/lib/faintMemory');

const UNIQUE    = { id: 1, name: 'Akane Unique',     card_type: 'character' };
const NEUTRAL   = { id: 2, name: 'Neutral Card',     card_type: 'neutral' };
const FORBIDDEN = { id: 3, name: 'Forbidden Card',   card_type: 'forbidden' };
const M_COMMON  = { id: 4, name: 'Slime',            card_type: 'monster', monster_rarity: 'common' };
const M_RARE    = { id: 5, name: 'Griffon',          card_type: 'monster', monster_rarity: 'rare' };
const M_LEG     = { id: 6, name: 'Crimson Dragon',   card_type: 'monster', monster_rarity: 'legendary' };

function entry(card, flag = 'normal', epiphany = 'none', extra = {}) {
  return { card, flag, epiphany, ...extra };
}

test('tier cap: tier 1 is 30', () => {
  assert.equal(tierCap(1, false), 30);
});

test('tier cap: tier 13 is 150', () => {
  assert.equal(tierCap(13, false), 150);
});

test('tier cap: Nightmare adds +10', () => {
  assert.equal(tierCap(1, true), 40);
  assert.equal(tierCap(13, true), 160);
});

test('base cost: unique/character card = 0', () => {
  assert.equal(baseCardCost(UNIQUE), 0);
});

test('base cost: neutral = 20', () => {
  assert.equal(baseCardCost(NEUTRAL), 20);
});

test('base cost: forbidden = 20', () => {
  assert.equal(baseCardCost(FORBIDDEN), 20);
});

test('base cost: monster common = 20', () => {
  assert.equal(baseCardCost(M_COMMON), 20);
});

test('base cost: monster rare = 50', () => {
  assert.equal(baseCardCost(M_RARE), 50);
});

test('base cost: monster legendary = 80', () => {
  assert.equal(baseCardCost(M_LEG), 80);
});

test('epiphany: normal on non-starter = +10', () => {
  assert.equal(epiphanyCost('normal', false), 10);
});

test('epiphany: divine on non-starter = +30', () => {
  assert.equal(epiphanyCost('divine', false), 30);
});

test('epiphany: normal on starter = 0 (free)', () => {
  assert.equal(epiphanyCost('normal', true), 0);
});

test('epiphany: divine on starter = +20', () => {
  assert.equal(epiphanyCost('divine', true), 20);
});

test('duplicates: 1st and 2nd copy free, 3rd and 4th cost 40 each', () => {
  const entries = [
    entry(NEUTRAL, 'normal'),       // 1st copy (base 20)
    entry(NEUTRAL, 'duplicate'),    // 2nd copy: free
    entry(NEUTRAL, 'duplicate'),    // 3rd copy: 40
    entry(NEUTRAL, 'duplicate'),    // 4th copy: 40
  ];
  const r = calculateFaintMemory({ entries, tier: 13, nightmare: true });
  assert.equal(r.breakdown.byType.neutral, 20);
  assert.equal(r.breakdown.duplicates, 80);
});

test('duplicates: 5th copy warns, not counted', () => {
  const entries = [
    entry(NEUTRAL, 'normal'),
    entry(NEUTRAL, 'duplicate'),
    entry(NEUTRAL, 'duplicate'),
    entry(NEUTRAL, 'duplicate'),
    entry(NEUTRAL, 'duplicate'), // 5th — over limit
  ];
  const r = calculateFaintMemory({ entries, tier: 13, nightmare: true });
  assert.ok(r.warnings.some(w => /Too many copies/.test(w)));
  assert.equal(r.breakdown.duplicates, 80);
});

test('removals: 1st through 5th progression 0/10/30/50/70', () => {
  const entries = [
    entry(NEUTRAL, 'removed'), entry(NEUTRAL, 'removed'), entry(NEUTRAL, 'removed'),
    entry(NEUTRAL, 'removed'), entry(NEUTRAL, 'removed'),
  ];
  const r = calculateFaintMemory({ entries, tier: 13, nightmare: true });
  assert.equal(r.breakdown.removals, 0 + 10 + 30 + 50 + 70);
});

test('removals: 6th warns, not counted', () => {
  const entries = Array.from({ length: 6 }, () => entry(NEUTRAL, 'removed'));
  const r = calculateFaintMemory({ entries, tier: 13, nightmare: true });
  assert.ok(r.warnings.some(w => /Too many removals/.test(w)));
  assert.equal(r.breakdown.removals, 160);
});

test('starter removal adds +20 surcharge', () => {
  const entries = [entry(NEUTRAL, 'removed', 'none', { isStarter: true })];
  const r = calculateFaintMemory({ entries, tier: 13, nightmare: true });
  assert.equal(r.breakdown.removals, 20); // 1st removal base 0 + 20 starter
});

test('equipment level 0 = 0 pts', () => {
  const r = calculateFaintMemory({ equipment: [{ slot: 'weapon', level: 0 }] });
  assert.equal(r.breakdown.equipment, 0);
});

test('equipment level 1 = +10 pts', () => {
  const r = calculateFaintMemory({ equipment: [{ slot: 'weapon', level: 1 }] });
  assert.equal(r.breakdown.equipment, 10);
});

test('equipment level 2 = +20 pts', () => {
  const r = calculateFaintMemory({ equipment: [{ slot: 'weapon', level: 2 }] });
  assert.equal(r.breakdown.equipment, 20);
});

test('starter card with normal epiphany costs 0 total (unique) + 0 epiphany', () => {
  const entries = [entry(UNIQUE, 'starter', 'normal')];
  const r = calculateFaintMemory({ entries });
  assert.equal(r.total, 0);
});

test('starter card with divine epiphany = +20', () => {
  const entries = [entry(UNIQUE, 'starter', 'divine')];
  const r = calculateFaintMemory({ entries });
  assert.equal(r.total, 20);
});

test('non-starter card with divine epiphany on neutral = 20 + 30 = 50', () => {
  const entries = [entry(NEUTRAL, 'normal', 'divine')];
  const r = calculateFaintMemory({ entries });
  assert.equal(r.total, 50);
});

test('realistic over-cap deck triggers warning', () => {
  const entries = [
    entry(M_LEG, 'normal'),       // 80
    entry(M_LEG, 'normal'),       // 80
    entry(M_RARE, 'normal'),      // 50
    entry(NEUTRAL, 'normal', 'divine'), // 20 + 30
  ];
  const r = calculateFaintMemory({ entries, tier: 5, nightmare: false });
  assert.equal(r.total, 80 + 80 + 50 + 50);
  assert.ok(r.overCap);
  assert.ok(r.warnings.some(w => /exceeds/.test(w)));
});

test('empty deck: total 0, cap matches tier', () => {
  const r = calculateFaintMemory({ tier: 3, nightmare: false });
  assert.equal(r.total, 0);
  assert.equal(r.cap, 50);
  assert.equal(r.overCap, false);
});

test('forbidden cards contribute to their own category bucket', () => {
  const entries = [entry(FORBIDDEN, 'normal'), entry(FORBIDDEN, 'normal')];
  const r = calculateFaintMemory({ entries, tier: 13, nightmare: true });
  assert.equal(r.breakdown.byType.forbidden, 40);
});
