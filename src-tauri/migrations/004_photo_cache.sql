-- Photos Transfermarkt déjà cherchées, par nom + nationalité normalisés (photo NULL = aucune trouvée).
CREATE TABLE IF NOT EXISTS photo_cache (
  key TEXT PRIMARY KEY,
  photo TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

