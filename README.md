# CZN Deck Builder

A deck builder for **Chaos Zero Nightmare** with a live **Faint Memory** calculator that mirrors the in-game rules, local "accounts" for saving decks, **and a JSON REST API** for programmatic access.

- **Live site:** https://bt-wd.github.io/api-full-stack-project-Willem225/
- **API base:** https://&lt;your-cloudflare-pages-deployment&gt;.pages.dev/api/ (see *Deploying the API* below)

## Stack

- **Frontend:** vanilla JS (ES modules), HTML + CSS, dark theme — statically hosted on GitHub Pages
- **Backend:** serverless functions under `functions/api/`, deployable to Cloudflare Pages (V8 isolates, Web Standard Request/Response)
- Card catalog + combatant data live as JSON files in the repo root (`cards.json`, `combatants.json`)
- Accounts + saved decks persist to browser `localStorage` (client-side only)

> ⚠️ Auth is **client-side only**. Passwords live in localStorage in plain text. This is intentional for a static-hosted demo — never do this in production.

## Running locally

### Static site only

Any local web server works. Easiest:

```bash
python3 -m http.server 8000
# or: npx http-server -p 8000
```

Then open http://localhost:8000. (`file://` won't work — browsers block ES modules and `fetch` from `file://`.)

### API locally

```bash
npx wrangler pages dev .           # runs the full stack at :8788
```

Then the static site AND the `/api/*` endpoints are both served at http://localhost:8788. Wrangler auto-installs on first run; no account required for local dev.

## API reference

Base URL: `/api` (relative to your Vercel deployment).

### `GET /api/health`
Service heartbeat. Returns `{ ok, service, version, now }`.

```bash
curl https://<deployment>.pages.dev/api/health
```

### `GET /api/cards`
List cards with optional filters.

| Query param  | Example        | Description                              |
|--------------|----------------|------------------------------------------|
| `q`          | `dragon`       | Text search over name + description      |
| `card_type`  | `monster`      | character / neutral / forbidden / monster |
| `category`   | `Skill`        | Attack / Skill / Upgrade / Status        |
| `rarity`     | `legendary`    | common / rare / legendary / mythic       |
| `combatant`  | `Diana`        | Cards belonging to a combatant           |
| `limit`      | `50`           | Max rows (default + max: 5000)           |

Returns `{ cards: [...], total: number }`.

### `GET /api/cards/:id`
Single card by numeric id or external_id.

```bash
curl https://<deployment>.pages.dev/api/cards/gk715
```

Returns `{ card }` or `404`.

### `GET /api/combatants`
List combatants with optional filters (`q`, `class`, `element`, `rarity`).

```bash
curl 'https://<deployment>.pages.dev/api/combatants?class=Hunter'
```

### `GET /api/combatants/:slug`
Single combatant + their associated cards, grouped into `starters` (basic cards) and `unique`.

```bash
curl https://<deployment>.pages.dev/api/combatants/diana
```

### `POST /api/calculate`
Stateless Faint Memory calculation.

**Body:**

```json
{
  "entries": [
    { "card": { "id": 12, "card_type": "monster", "monster_rarity": "legendary" }, "flag": "normal", "epiphany": "none" },
    { "card": { "id": 15, "card_type": "neutral" }, "flag": "removed", "isStarter": true }
  ],
  "tier": 5,
  "nightmare": false
}
```

**Response:**

```json
{
  "total": 100,
  "cap": 70,
  "overCap": true,
  "breakdown": {
    "byType": { "character": 0, "neutral": 20, "forbidden": 0, "monster": 80 },
    "epiphany": 0, "duplicates": 0, "removals": 20
  },
  "warnings": ["Deck exceeds Faint Memory cap: 100 / 70."]
}
```

## Deploying the API

Cloudflare Pages — free tier, no phone or card required, just email.

1. Sign up / log in at https://dash.cloudflare.com/sign-up (or the main dashboard if you already have an account).
2. Left sidebar → **Workers & Pages** → **Create application** → **Pages** tab → **Connect to Git**.
3. Authorize Cloudflare to read your GitHub repos if prompted, then pick **api-full-stack-project-Willem225**.
4. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave blank)*
   - **Build output directory:** `/` (root)
5. Click **Save and Deploy**. First build takes ~1 minute.

Your API is now live at `https://<project>.pages.dev/api/<endpoint>`. The static site is served from the same deployment root. Every push to `main` auto-rebuilds.

## Layout

```
index.html          SPA shell
cards.json          Card catalog (387 cards)
combatants.json     30 combatants with class / element / rarity
images/             Card artwork (gk<id>.png)
combatants/         Combatant portraits
css/style.css       Dark theme
js/
├── app.js          Hash router
├── api.js          localStorage-backed store (signup/login/decks)
├── faintMemory.js  🔑 Faint Memory rules engine (shared with API)
├── ui.js           el() / clear() / toast()
└── views/          login, signup, cards, decks, builder, combatants
functions/api/
├── _helpers.js            Shared JSON + CORS helpers
├── health.js              GET /api/health
├── calculate.js           POST /api/calculate
├── cards.js               GET /api/cards
├── cards/[id].js          GET /api/cards/:id
├── combatants.js          GET /api/combatants
└── combatants/[slug].js   GET /api/combatants/:slug
_headers                   Cloudflare Pages CORS headers for /api/*
```

## Faint Memory rules

Encoded in `js/faintMemory.js` (shared with `POST /api/calculate`).

| Element                       | Cost                                              |
|-------------------------------|---------------------------------------------------|
| Unique / Character card       | 0 pts                                             |
| Neutral card                  | 20 pts                                            |
| Forbidden card                | 20 pts                                            |
| Monster Common                | 20 pts                                            |
| Monster Rare                  | 50 pts                                            |
| Monster Legendary             | 80 pts                                            |
| Epiphany (non-starter)        | +10 pts                                           |
| Divine Epiphany (non-starter) | +30 pts total                                     |
| Epiphany (starter)            | 0 pts                                             |
| Divine Epiphany (starter)     | +20 pts                                           |
| Duplicates (copy 1→4)         | 0 / 0 / 40 / 40, max 4 copies                     |
| Starter card removal          | 20 FM (flat, per starter)                         |
| Non-starter card removal      | 0 FM (free)                                       |
| Tier cap                      | 30 + 10 × (tier − 1), tiers 1..15; Nightmare +10  |

## Data

All app state lives in these `localStorage` keys:

- `czn_users_v1` — registered accounts
- `czn_decks_v2` — decks keyed by user id
- `czn_token` / `czn_user` — active session

Clearing site data resets everything.

## Hosting

- **Frontend**: GitHub Pages, from `main` / root. Pushes auto-rebuild in ~1 minute.
- **API**: Cloudflare Pages (optional — see *Deploying the API*). Both static site and API served from the Cloudflare domain after linking.
