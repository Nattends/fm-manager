ALTER TABLE tactics ADD COLUMN excluded TEXT NOT NULL DEFAULT '[]'; -- JSON [playerId, ...]
