# CZN Deck Builder

Full-stack deck builder for **Chaos Zero Nightmare**, with a live **Faint Memory** calculator that mirrors the in-game rules and per-user saved decks.

## Stack

- **Backend:** Node.js + Express + SQLite (`better-sqlite3`)
- **Auth:** JWT + `bcryptjs` (pure-JS, no native build step)
- **Frontend:** Vanilla JS ES modules, hash-based SPA, dark theme

## Getting it running

```bash
npm install
cp .env.example .env        # edit JWT_SECRET
npm run init-db             # create SQLite schema at data/app.db
npm run load-sample         # seed 10 sample cards
npm start                   # → http://localhost:3000
```

Optional:

```bash
npm run scrape              # best-effort scrape from Offbanner + chaoszeronightmare.org
npm test                    # run Faint Memory unit tests (Node built-in runner)
```

## Layout

```
server/
├── index.js                Express entry
├── db/{init,connection}.js Schema + shared SQLite singleton (WAL, FK on)
├── lib/faintMemory.js      🔑 rules engine — authoritative
├── middleware/auth.js      signToken + requireAuth
├── routes/{auth,cards,decks}.js
└── scraper/{scrape,load-sample}.js
public/
├── index.html              SPA shell
├── css/style.css           Dark theme
└── js/
    ├── app.js              Hash router
    ├── api.js              Fetch wrapper with auth header + token persistence
    ├── faintMemory.js      🔑 client mirror of server rules engine — keep in sync
    ├── ui.js               el() / clear() / toast()
    └── views/{login,signup,cards,decks,builder}.js
data/
├── cards.sample.json       10 sample cards for out-of-box use
└── cache/                  raw scraper HTML (created on demand)
test/
└── faintMemory.test.js     24 unit tests covering every calc edge case
```

## Faint Memory rules

Encoded in `server/lib/faintMemory.js` (mirrored in `public/js/faintMemory.js`).

| Element                    | Cost                                              |
|----------------------------|---------------------------------------------------|
| Unique / Character card    | 0 pts (vivid memory, always saved)                |
| Neutral card               | 20 pts                                            |
| Forbidden card             | 20 pts                                            |
| Monster Common             | 20 pts                                            |
| Monster Rare               | 50 pts                                            |
| Monster Legendary          | 80 pts                                            |
| Epiphany (non-starter)     | +10 pts                                           |
| Divine Epiphany (non-starter) | +30 pts total                                  |
| Epiphany (starter)         | 0 pts                                             |
| Divine Epiphany (starter)  | +20 pts                                           |
| Duplicates (1st → 4th)     | 0 / 0 / 40 / 40, max 4 copies                     |
| Removals (1st → 5th)       | 0 / 10 / 30 / 50 / 70, max 5                      |
| Starter removal surcharge  | +20                                               |
| Equipment per level        | +10 pts (0/10/20 for off/upgrade 1/upgrade 2)     |
| Tier cap                   | 30 + 10 × (tier − 1), tiers 1..13; Nightmare +10  |

## Gotchas

1. **Keep `server/lib/faintMemory.js` and `public/js/faintMemory.js` in sync.** Same rules, two copies — client for instant UI feedback, server for authoritative validation.
2. **`better-sqlite3` is synchronous.** No `await` on DB calls. Wrap multi-statement mutations in `db.transaction(...)`.
3. **JWT stored in `localStorage`** as `czn_token`; user object as `czn_user`. Fetch wrapper auto-injects the Bearer header.
4. **Hash-based routing.** `#/cards`, `#/decks/123`, etc. Express SPA fallback serves `index.html` for any non-API path.
5. **Starter epiphany quirk:** normal epiphany is free on starters (0), but divine still costs +20. See tests for full coverage.
6. **`nightmare` is stored as `INTEGER` 0/1** (SQLite has no bool). Decks route converts on the way in/out.

## What's NOT done

- **Scraper selectors are guesses** — couldn't hit the live community sites from my sandbox. Run `npm run scrape` once, inspect `data/cache/offbanner.html` (look for `__NEXT_DATA__`) and `data/cache/cznorg.html`, then refine the selectors in `server/scraper/scrape.js`.
- Card catalog currently ships with 10 sample cards (`data/cards.sample.json`).
- No rate limiting on `/api/auth/*`, no email verification, no password reset.
- Builder's "Add Card" modal loads up to 5000 cards at once — fine for a few hundred, paginate when the catalog grows.

## Next features

- Public/shareable deck URLs (add `public BOOLEAN` col to `decks`, new `GET /api/decks/shared/:id`)
- Deck import/export via base64 URL fragment
- Dedicated equipment database (separate `equipment` table + picker)
- Partner card slots
- Tier list overlay (scrape Prydwen/Game8)
