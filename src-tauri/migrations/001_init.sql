CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  age           INTEGER NOT NULL,
  nationality   TEXT    NOT NULL DEFAULT '',
  foot          TEXT    NOT NULL DEFAULT 'right',
  positions     TEXT    NOT NULL DEFAULT '{}', -- JSON { "DC": 20, "DM": 14 }
  ca_stars      REAL    NOT NULL DEFAULT 2.5,
  pa_stars      REAL    NOT NULL DEFAULT 2.5,
  contract_end  TEXT,
  wage          INTEGER,
  value         INTEGER,
  status        TEXT    NOT NULL DEFAULT 'rotation',
  notes         TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS player_attributes (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  attr      TEXT    NOT NULL,
  value     INTEGER NOT NULL CHECK (value BETWEEN 1 AND 20),
  PRIMARY KEY (player_id, attr)
);

CREATE TABLE IF NOT EXISTS tactics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  formation  TEXT NOT NULL,
  slots      TEXT NOT NULL DEFAULT '[]', -- JSON [{ slotId, roleId, duty, lockedPlayerId }]
  notes      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
