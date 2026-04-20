const db = require('./connection');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id     TEXT    UNIQUE,
  name            TEXT    NOT NULL,
  character       TEXT,
  card_type       TEXT    NOT NULL CHECK (card_type IN ('character','neutral','forbidden','monster','unique')),
  category        TEXT,
  monster_rarity  TEXT,
  description     TEXT,
  image_url       TEXT,
  source          TEXT,
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cards_name      ON cards (name);
CREATE INDEX IF NOT EXISTS idx_cards_character ON cards (character);
CREATE INDEX IF NOT EXISTS idx_cards_type      ON cards (card_type);
CREATE INDEX IF NOT EXISTS idx_cards_category  ON cards (category);

CREATE TABLE IF NOT EXISTS decks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  description TEXT,
  character   TEXT,
  tier        INTEGER NOT NULL DEFAULT 1,
  nightmare   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_decks_user ON decks (user_id);

CREATE TABLE IF NOT EXISTS deck_cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id     INTEGER NOT NULL,
  card_id     INTEGER NOT NULL,
  flag        TEXT    NOT NULL DEFAULT 'normal' CHECK (flag IN ('normal','starter','duplicate','removed')),
  epiphany    TEXT    NOT NULL DEFAULT 'none'   CHECK (epiphany IN ('none','normal','divine')),
  is_starter  INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards (deck_id);

CREATE TABLE IF NOT EXISTS deck_equipment (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id  INTEGER NOT NULL,
  slot     TEXT    NOT NULL,
  level    INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 2),
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deck_equipment_deck ON deck_equipment (deck_id);
`;

db.exec(schema);

if (require.main === module) {
  console.log('Schema initialized at', process.env.DB_PATH || 'data/app.db');
}

module.exports = db;
