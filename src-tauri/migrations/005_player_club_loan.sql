-- Club actuel du joueur et prêt (un joueur prêté ne fait plus partie de l'effectif).
ALTER TABLE players ADD COLUMN club TEXT NOT NULL DEFAULT '';
ALTER TABLE players ADD COLUMN on_loan INTEGER NOT NULL DEFAULT 0;
