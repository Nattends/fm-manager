# FM27 Manager

Application Windows de gestion d'équipe pour **Football Manager 27** : effectif et attributs, notes de chaque joueur par rôle, composition automatique du meilleur XI et tactiques par glisser-déposer.

La saisie est **manuelle** pour l'instant (l'export Ctrl+P n'existe plus dans FM27). La lecture directe de la mémoire du jeu est prévue dans une version future, via l'interface `DataSource`.

## Fonctionnalités

### Clubs
- **Plusieurs clubs**, un par partie de FM : chacun a son effectif et ses tactiques (les rôles sont communs). Choix du club dans la barre du haut ; création, renommage, suppression.
- **Logos Transfermarkt automatiques** d'après le nom du club (club géré comme clubs de prêt), mis en cache, sur une pastille claire pour rester lisibles.

### Effectif
- Tableau triable et filtrable (recherche, poste, statut, âge max), colonnes au choix (dont les 47 attributs), mémorisées. Colonne **Club** avec logo.
- Vue **Tous / Au club / Prêtés**. Les joueurs prêtés sont hors effectif et jamais alignés ; leur club d'accueil est affiché avec son logo.
- **Nationalité avec drapeau**, choisie dans une liste alphabétique avec recherche (pays, nations britanniques, Kosovo).
- Fiche joueur : photo, club, étoiles niveau actuel / potentiel, mini-terrain des postes coloré par familiarité, meilleur rôle, onglets **Attributs / Rôles / Contrat & notes**.
- Formulaire avec infos de base obligatoires, attributs détaillés facultatifs et choix des postes sur un mini-terrain.
- **Photos Transfermarkt automatiques** : recherche par nom, filtrée par âge et nationalité, mise en cache locale. Les joueurs générés par le jeu ou introuvables ont un avatar « inconnu ». Actions « Rechercher à nouveau » et « Mauvaise photo ».

### Notes par rôle
- 95 rôles : 10 profils du notebook *position score calculator* et 85 rôles FM (`roles.json`, poids 5 / 3 / 1).
- Note sur 100 = moyenne pondérée des attributs (1-20), passée dans une courbe qui écarte bien les bons joueurs (≈ 77) des excellents (≈ 92), puis multipliée par la **familiarité au poste** (Naturel ×1 … jamais joué ×0,5).
- Note partielle (`~`) si peu d'attributs sont saisis, pas de note (`—`) s'il n'y en a aucun.
- Écran **Roles** : liste groupée et filtrable, poids réglables au clic (×5 → ×3 → ×1 → ×0), postes du rôle.

### Tactique
- **Avec ballon / sans ballon** : chaque poste a sa case et son rôle dans les deux phases (bouton pour recopier la phase avec ballon), et une vue **Les deux** affiche les deux terrains côte à côte. Le meilleur XI maximise la moyenne des deux notes.
- **Demi-espaces** : en plus des 5 couloirs de FM, une carte peut se placer entre deux couloirs (poste axial de la ligne), tant qu'elle ne chevauche pas une voisine.
- 8 formations prédéfinies, ou formation libre en **déplaçant les cartes de poste** sur la grille du terrain (6 lignes × 9 colonnes : 5 couloirs et 4 demi-espaces).
- **Meilleur XI automatique** par affectation optimale (algorithme hongrois) qui maximise la somme des notes (moyenne avec / sans ballon). Joueurs verrouillés, écartés ou indisponibles respectés.
- Glisser-déposer des joueurs (placement, échange, mise à l'écart), doublures par poste.
- Cartes colorées par ligne : photo, note, familiarité au poste, rôle avec recherche, devoir, verrou, première doublure.
- Résumé de l'équipe : note du XI, notes par ligne, âge moyen, joueurs hors poste, postes vides.
- **Grande vue** plein écran avec terrain horizontal.

### Divers
- Interface **anglais / français**.
- Fenêtre standard de 1500 de large (hauteur 950 à 1300) et **mode portrait 1080×1920** pour un écran vertical.
- Sauvegarde / restauration en JSON, **équipe de démo** (vrais et faux joueurs) chargeable et retirable d'un clic.

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
src-tauri/     Application Rust : plugins, migrations SQL, commande transfermarkt_get
```

## Versions

Les versions sont marquées par des tags git (`v0.1.0`, `v0.2.0`, …), avec une [release GitHub](https://github.com/Nattends/fm-manager/releases) et son installateur Windows. Voir `git tag -n` pour le résumé de chacune.
