-- Grille du terrain : 5 couloirs (anciennes tactiques) ou 9 colonnes avec les demi-espaces.
-- Les tactiques à 5 couloirs sont converties à la lecture puis enregistrées en 9 colonnes.
ALTER TABLE tactics ADD COLUMN grid INTEGER NOT NULL DEFAULT 5;
