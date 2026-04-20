// Best-effort scraper for Chaos Zero Nightmare card data.
// Hits Offbanner (Next.js — pulls __NEXT_DATA__) and chaoszeronightmare.org (HTML + Cheerio).
// Selectors are guesses; inspect data/cache/*.html and refine when running for real.

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const db = require('../db/connection');

const CACHE_DIR = path.resolve(process.cwd(), 'data/cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const OFFBANNER_URL = 'https://offbanner.com/cards';
const CZN_ORG_URL   = 'https://chaoszeronightmare.org/cards';

async function fetchText(url, cachePath) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'CZNDeckBuilder/0.1 (+scraper)' } });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const html = await res.text();
    fs.writeFileSync(cachePath, html);
    return html;
  } catch (err) {
    console.warn(`[scrape] fetch failed for ${url}: ${err.message}`);
    if (fs.existsSync(cachePath)) {
      console.warn(`[scrape] falling back to cache: ${cachePath}`);
      return fs.readFileSync(cachePath, 'utf8');
    }
    return null;
  }
}

function normalizeOffbannerCard(raw) {
  // Best-effort field mapping. Adjust when the real shape is known.
  if (!raw || typeof raw !== 'object') return null;
  const name = raw.name || raw.title || raw.cardName;
  if (!name) return null;
  return {
    external_id: raw.id || raw.slug || `offbanner:${name}`,
    name,
    character: raw.character || raw.owner || raw.combatant || null,
    card_type: normalizeCardType(raw.type || raw.cardType || raw.category),
    category: raw.category || raw.type || null,
    monster_rarity: normalizeRarity(raw.rarity || raw.monsterRarity),
    description: raw.description || raw.text || raw.effect || null,
    image_url: raw.image || raw.imageUrl || raw.icon || null,
    source: 'offbanner',
  };
}

function normalizeCardType(t) {
  const s = String(t || '').toLowerCase();
  if (s.includes('charact') || s.includes('unique')) return 'character';
  if (s.includes('neutral')) return 'neutral';
  if (s.includes('forbidden')) return 'forbidden';
  if (s.includes('monster') || s.includes('beast')) return 'monster';
  return 'neutral';
}

function normalizeRarity(r) {
  const s = String(r || '').toLowerCase();
  if (s.includes('legend')) return 'legendary';
  if (s.includes('rare')) return 'rare';
  if (s.includes('common')) return 'common';
  return null;
}

async function fetchOffbanner() {
  const html = await fetchText(OFFBANNER_URL, path.join(CACHE_DIR, 'offbanner.html'));
  if (!html) return [];

  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    console.warn('[scrape] offbanner: __NEXT_DATA__ not found');
    return [];
  }
  let data;
  try { data = JSON.parse(match[1]); }
  catch (e) { console.warn('[scrape] offbanner: JSON parse failed', e.message); return []; }

  const pageProps = data?.props?.pageProps || {};
  const candidates = [
    pageProps.cards,
    pageProps.data?.cards,
    pageProps.initialData?.cards,
    pageProps.allCards,
  ].find(Array.isArray);
  if (!candidates) {
    console.warn('[scrape] offbanner: pageProps keys are', Object.keys(pageProps));
    return [];
  }
  return candidates.map(normalizeOffbannerCard).filter(Boolean);
}

async function fetchCznOrg() {
  const html = await fetchText(CZN_ORG_URL, path.join(CACHE_DIR, 'cznorg.html'));
  if (!html) return [];

  const $ = cheerio.load(html);
  const nodes = $('[data-card], .card-entry, .card-item, article.card');
  const cards = [];

  nodes.each((_, el) => {
    const $el = $(el);
    const name = $el.find('.card-name, h2, h3').first().text().trim()
      || $el.attr('data-name');
    if (!name) return;
    cards.push({
      external_id: $el.attr('data-id') || $el.attr('id') || `cznorg:${name}`,
      name,
      character: $el.find('.card-character, .character').first().text().trim() || null,
      card_type: normalizeCardType($el.attr('data-type') || $el.find('.card-type').first().text()),
      category: $el.find('.card-category').first().text().trim() || null,
      monster_rarity: normalizeRarity($el.attr('data-rarity') || $el.find('.card-rarity').first().text()),
      description: $el.find('.card-description, .card-text').first().text().trim() || null,
      image_url: $el.find('img').first().attr('src') || null,
      source: 'cznorg',
    });
  });

  return cards;
}

function upsertCards(cards) {
  const stmt = db.prepare(`
    INSERT INTO cards (external_id, name, character, card_type, category, monster_rarity, description, image_url, source)
    VALUES (@external_id, @name, @character, @card_type, @category, @monster_rarity, @description, @image_url, @source)
    ON CONFLICT(external_id) DO UPDATE SET
      name           = excluded.name,
      character      = excluded.character,
      card_type      = excluded.card_type,
      category       = excluded.category,
      monster_rarity = excluded.monster_rarity,
      description    = excluded.description,
      image_url      = excluded.image_url,
      source         = excluded.source,
      updated_at     = datetime('now')
  `);
  const run = db.transaction(rows => { for (const r of rows) stmt.run(r); });
  run(cards);
}

async function main() {
  require('../db/init'); // ensure schema exists
  const [offbanner, cznorg] = await Promise.all([fetchOffbanner(), fetchCznOrg()]);
  const all = [...offbanner, ...cznorg];
  console.log(`[scrape] offbanner=${offbanner.length} cznorg=${cznorg.length} total=${all.length}`);
  if (!all.length) {
    console.warn('[scrape] no cards found; inspect data/cache/*.html and tune selectors.');
    return;
  }
  upsertCards(all);
  console.log('[scrape] done.');
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { fetchOffbanner, fetchCznOrg, upsertCards };
