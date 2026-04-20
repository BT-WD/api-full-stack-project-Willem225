# CZN Deck Builder

A deck builder for **Chaos Zero Nightmare** with a live **Faint Memory** calculator that mirrors the in-game rules, plus local "accounts" for saving decks.

**Live demo:** https://bt-wd.github.io/api-full-stack-project-Willem225/

## Stack

Pure static site — no backend.

- Vanilla JS (ES modules)
- HTML + CSS (dark theme)
- Card catalog loaded from `cards.json`
- Accounts + decks persisted to browser `localStorage`

> ⚠️ Auth is **client-side only**. Passwords live in localStorage in plain text. This is intentional for a static-hosted demo — never do this in production.

## Running locally

It's pure static — any local web server works. Easiest options:

```bash
# Python
python3 -m http.server 8000

# Node (without installing anything globally)
npx http-server -p 8000
```

Then open http://localhost:8000.

Opening `index.html` directly via `file://` **won't work** — the browser blocks ES module imports and `fetch('cards.json')` over `file://`.

## Layout

```
index.html          SPA shell
cards.json          Static card catalog (loaded on startup)
css/style.css       Dark theme
js/
├── app.js          Hash router
├── api.js          localStorage-backed store (signup/login/decks)
├── faintMemory.js  🔑 Faint Memory rules engine
├── ui.js           el() / clear() / toast()
└── views/
    ├── login.js
    ├── signup.js
    ├── cards.js    Card browser w/ filters
    ├── decks.js    Saved decks list
    └── builder.js  Deck builder + live FM sidebar
```

## Faint Memory rules

Encoded in `js/faintMemory.js`.

| Element                    | Cost                                              |
|----------------------------|---------------------------------------------------|
| Unique / Character card    | 0 pts                                             |
| Neutral card               | 20 pts                                            |
| Forbidden card             | 20 pts                                            |
| Monster Common             | 20 pts                                            |
| Monster Rare               | 50 pts                                            |
| Monster Legendary          | 80 pts                                            |
| Epiphany (non-starter)     | +10 pts                                           |
| Divine Epiphany (non-starter) | +30 pts total                                  |
| Epiphany (starter)         | 0 pts                                             |
| Divine Epiphany (starter)  | +20 pts                                           |
| Duplicates (copy 1→4)      | 0 / 0 / 40 / 40, max 4 copies                     |
| Removals (1st→5th)         | 0 / 10 / 30 / 50 / 70, max 5                      |
| Starter removal surcharge  | +20                                               |
| Equipment per level        | +10 pts (0/10/20 for off/upgrade 1/upgrade 2)     |
| Tier cap                   | 30 + 10 × (tier − 1), tiers 1..13; Nightmare +10  |

## Data

All app state lives in these `localStorage` keys:

- `czn_users_v1` — registered accounts
- `czn_decks_v1` — decks keyed by user id
- `czn_token` / `czn_user` — active session

Clearing site data resets everything.

## Hosting

Deployed via **GitHub Pages** from `main` / root. Pushes to `main` auto-rebuild within ~1 minute.
