-- Plusieurs clubs gérés (une partie de FM par club) : chacun a son effectif et ses tactiques.
CREATE TABLE IF NOT EXISTS clubs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Les données existantes vont dans un premier club, à renommer depuis la barre du haut.
INSERT INTO clubs (id, name) VALUES (1, 'My club');

ALTER TABLE players ADD COLUMN club_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tactics ADD COLUMN club_id INTEGER NOT NULL DEFAULT 1;

-- Logos des clubs trouvés sur Transfermarkt (null = aucun logo trouvé), par nom normalisé.
CREATE TABLE IF NOT EXISTS club_logo_cache (
  key        TEXT PRIMARY KEY,
  logo       TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
