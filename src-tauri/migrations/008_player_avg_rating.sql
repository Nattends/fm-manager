-- Note moyenne en match de la saison et matchs notés (lus dans la sauvegarde FM).
ALTER TABLE players ADD COLUMN avg_rating REAL;
ALTER TABLE players ADD COLUMN rated_matches INTEGER;
