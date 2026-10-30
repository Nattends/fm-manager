# FM27 Manager

Application Windows de gestion d'équipe pour **Football Manager 27** : effectif et attributs, notes de chaque joueur par rôle, composition automatique du meilleur XI et tactiques par glisser-déposer.

L'effectif s'importe **directement depuis une sauvegarde FM27** (fichier `.fm`), par captures d'écran du jeu, ou se saisit à la main (l'export Ctrl+P n'existe plus dans FM27).

## Fonctionnalités

### Clubs
- **Plusieurs clubs**, un par partie de FM : chacun a son effectif et ses tactiques (les rôles sont communs). Choix du club dans la barre du haut ; création, renommage, suppression.
- **Logos Transfermarkt automatiques** d'après le nom du club (club géré comme clubs de prêt), mis en cache. Rendu au choix dans les réglages (halo, contour, pastille blanche ou aucun) pour que les écussons sombres restent lisibles.

### Effectif
- **Import depuis une sauvegarde** (`.fm`, jeu fermé ou non, fichier jamais modifié) : choix du club (club géré présélectionné), puis équipe première et joueurs prêtés avec les 47 attributs, la familiarité aux postes, le pied, l'âge à la date du jeu, la nationalité, la fin de contrat et le salaire. Les joueurs connus sont mis à jour (étoiles, valeur, statut, notes et photo conservés), les autres créés.
- Tableau triable et filtrable (recherche, poste, statut, âge max), colonnes au choix (dont les 47 attributs), mémorisées. Colonne **Club** avec logo.
- Vue **Tous / Au club / Prêtés**. Les joueurs prêtés sont hors effectif et jamais alignés ; leur club d'accueil est affiché avec son logo.
- **Nationalité avec drapeau**, choisie dans une liste alphabétique avec recherche (pays, nations britanniques, Kosovo).
- Fiche joueur : photo, club, étoiles niveau actuel / potentiel, mini-terrain des postes coloré par familiarité, meilleur rôle, onglets **Attributs / Rôles / Contrat & notes**.
- Formulaire avec infos de base obligatoires, attributs détaillés facultatifs et choix des postes sur un mini-terrain.
- **Photos Transfermarkt automatiques** : recherche par nom, filtrée par âge et nationalité, mise en cache locale. Les joueurs générés par le jeu ou introuvables ont un avatar « inconnu ». Actions « Rechercher à nouveau » et « Mauvaise photo ».

### Scouting
- **Tous les joueurs du jeu** (environ 83 000), lus dans la sauvegarde : recherche par nom, **plusieurs postes**, rôle, âge, nationalité, club (« Libre » pour les joueurs sans club) et pays du club ; option pour masquer les joueurs prêtés. **Meilleure note** affichée par défaut (rôles avec ballon), ou note du rôle choisi. Classement par note, salaire, âge ou nom ; club actuel et club propriétaire des joueurs prêtés, fin de contrat, **salaire hebdomadaire**.
- Fiche du joueur sélectionné : attributs, mini-terrain des postes, meilleurs rôles.
- **Réglages › Rafraîchir les données** : relit la sauvegarde liée au club actif (retenue lors de l'import), met à jour l'effectif (nouvelles recrues créées) et la base de scouting. « Changer de sauvegarde… » pour en lier une autre.

### Notes par rôle
- Les 68 rôles FM26/FM27 (40 avec ballon, 28 sans ballon), avec leurs attributs clés (poids 3) et préférés (poids 1), plus les attributs physiques de la ligne (poids 5). Chaque poste a un rôle avec ballon et un rôle sans ballon par défaut ; dans la tactique, le choix du rôle propose d'abord ceux du poste et de la phase affichée.
- Note sur 100 = moyenne pondérée des attributs (1-20 ; poids du rôle, et au moins ×0,5 pour tous les autres attributs, ceux de gardien seulement pour les gardiens), passée dans une courbe qui écarte bien les bons joueurs (≈ 77) des excellents (≈ 92), puis multipliée par la **familiarité au poste** (Naturel ×1 … jamais joué ×0,5).
- Note partielle (`~`) si peu d'attributs sont saisis, pas de note (`—`) s'il n'y en a aucun.
- Écran **Roles** : liste groupée et filtrable, poids réglables au clic (×5 → ×3 → ×1 → ×0), postes du rôle.

### Tactique
- **Avec ballon / sans ballon** : chaque poste a sa case et son rôle dans les deux phases (bouton pour recopier la phase avec ballon), et une vue **Les deux** (par défaut) affiche les deux terrains côte à côte. Le meilleur XI maximise la moyenne des deux notes.
- **Demi-espaces** : en plus des 5 couloirs de FM, une carte peut se placer entre deux couloirs (poste axial de la ligne), tant qu'elle ne chevauche pas une voisine.
- 8 formations prédéfinies, ou formation libre en **déplaçant les cartes de poste** sur la grille du terrain (6 lignes × 9 colonnes : 5 couloirs et 4 demi-espaces).
- Terrain **vide par défaut** : on place les joueurs à la main, ou avec **Combler les postes vides** (meilleurs joueurs disponibles sur les postes libres, sans toucher aux autres) et **Meilleur XI** (tout l'effectif remplacé par la meilleure composition). Affectation optimale par algorithme hongrois sur la moyenne des notes avec / sans ballon ; joueurs écartés et indisponibles respectés.
- Choix du rôle d'un poste avec la **note du joueur placé pour chaque rôle**, triés de la meilleure à la moins bonne.
- Glisser-déposer des joueurs : un remplaçant déposé sur un titulaire le **remplace** (le titulaire sort du XI sans chambouler les autres postes), deux titulaires s'échangent, mise à l'écart ; doublures par poste.
- **Comparaison au survol** : en glissant un joueur sur un poste occupé, une fiche compare le titulaire et l'arrivant (notes avec / sans ballon, note globale, attributs clés du poste, écart).
- Cartes colorées par ligne (sans photo) : note, nom, âge, nationalité, familiarité au poste, rôle avec recherche, verrou, première doublure.
- Résumé de l'équipe : note du XI, notes par ligne, âge moyen, joueurs hors poste, postes vides.
- **Grande vue** plein écran avec terrain horizontal.

### Divers
- Interface **anglais / français**.
- Fenêtre standard de 1500 de large (hauteur 950 à 1300) et **mode portrait 1080×1920** pour un écran vertical.
- Sauvegarde / restauration en JSON, **équipe de démo** (vrais et faux joueurs) chargeable et retirable d'un clic.
- **Équipes de test aléatoires** : un nouveau club réel (avec logo) et 27 joueurs tirés au sort, dont environ un tiers de vrais joueurs, pour comparer d'une équipe à l'autre.

## Stack

| Couche | Outils |
|---|---|
| Application de bureau | [Tauri 2](https://tauri.app) (Rust) : SQLite (`tauri-plugin-sql`), dialogues, fichiers, commande HTTP pour Transfermarkt |
| Interface | React 19, TypeScript, Vite 8, Tailwind CSS v4, shadcn/ui (Radix), lucide-react, flag-icons |
| Tableaux / glisser-déposer | TanStack Table v8, dnd-kit |
| Qualité | Vitest, oxlint, `tsc` |

## Prérequis

- Windows 10/11 avec WebView2 (inclus dans Windows 11)
- [Node.js](https://nodejs.org) 24+
- [Rust](https://rustup.rs) (stable) et les **MSVC Build Tools** (C++)

## Démarrage

```powershell
npm install
npm run tauri dev      # appli en mode développement, rechargement à chaud
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm run tauri dev` | Appli de développement (modifs de l'interface appliquées en direct) |
| `npx vitest run` | Tests du domaine (notes, composition, rôles, photos, démo) |
| `npx tsc -b` | Vérification des types |
| `npx oxlint` | Lint |
| `npx tauri build` | Installateurs `.msi` et `.exe` (NSIS) dans `src-tauri/target/release/bundle/` |

## Données

- Base SQLite locale : `%APPDATA%\com.fm27.manager\fm27.db` (migrations dans `src-tauri/migrations/`).
- Rien n'est envoyé ailleurs, sauf les recherches de photos et de logos sur transfermarkt.com (nom du joueur ou du club).

## Structure

```
src/
  domain/      Logique pure et testée : types, attributs, postes, notes (rating), rôles,
               formations, grille du terrain, composition (lineup + hungarian), démo, photos
  data/        Accès aux données : DataSource, ManualSource (SQLite), transfermarkt
  i18n/        Textes EN / FR (en.ts définit le type Messages)
  components/  Composants métier (cartes, badges, mini-terrain, RolePicker) ; ui/ = shadcn
  pages/       Écrans : Squad, PlayerSheet, PlayerForm, Tactic, Roles, Settings
  lib/         Utilitaires : confirmations, modes de fenêtre, cn
src-tauri/     Application Rust : plugins, migrations SQL, commande transfermarkt_get,
               lecture des sauvegardes FM27 (fm_save.rs), captures et OCR (fm_screen.rs)
```

## Versions

Les versions sont marquées par des tags git annotés (`v0.1.0`, `v0.2.0`, …). Pousser un tag `vX.Y.Z` lance **GitHub Actions** (`.github/workflows/release.yml`) : vérifications, compilation des installateurs Windows et publication de la [release GitHub](https://github.com/Nattends/fm-manager/releases), avec pour titre et notes le message du tag.

L'appli installée **se met à jour toute seule** : au démarrage, elle vérifie la dernière release et propose de l'installer (Settings › Mises à jour pour vérifier à la main). Les mises à jour sont signées : la clé privée (`~/.tauri/fm27-manager.key`) est aussi enregistrée dans le secret `TAURI_SIGNING_PRIVATE_KEY` du dépôt.
