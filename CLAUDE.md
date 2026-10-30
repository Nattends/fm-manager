# CLAUDE.md — FM27 Manager

Windows desktop app (Tauri 2 + React 19 + TypeScript) to manage a Football Manager 27 squad: players and attributes, role ratings, automatic best XI, drag-and-drop tactics. See README.md for the feature list.

The user is French: **answer in French**. UI strings exist in English (default) and French.

## Commands

The PATH in Claude Code sessions can be stale on this machine. Prefix commands with:
`$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`

- `npx tsc -b`, `npx vitest run`, `npx oxlint`: run all three after every change (they must stay clean; one known warning in `src/store.tsx`).
- `npm run tauri dev`: hot-reload dev app (run in background). While it runs, front-end edits apply live: **don't rebuild after each change**.
- **Releases are built by GitHub Actions** (`.github/workflows/release.yml`) on every pushed `vX.Y.Z` tag: it runs tsc + vitest, builds the NSIS/MSI installers, signs the updater artifacts and publishes the release with `latest.json`. The release title is the tag message's first line, the notes are the rest (Markdown). Routine for a new version: bump the version (3 files + package-lock), commit, `git tag -a vX.Y.Z -F <message file>`, `git push origin main`, `git push origin vX.Y.Z`. Don't build locally.
- The installed app updates itself (tauri-plugin-updater): at startup it reads `https://github.com/Nattends/fm-manager/releases/latest/download/latest.json`, offers the update in a toast, installs it (passive NSIS) and relaunches. Settings › Updates has a manual check. The signing private key is `~/.tauri/fm27-manager.key` (no password), also stored in the repo secret `TAURI_SIGNING_PRIVATE_KEY`; the public key is in `tauri.conf.json` (`plugins.updater.pubkey`). Losing the private key breaks updates.
- Local build (only if needed, e.g. CI down): set `$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content ~/.tauri/fm27-manager.key -Raw` first (createUpdaterArtifacts needs it), then:
  1. Stop the installed app (allowed without asking). The dev exe has the same process name: only kill the one under `%LOCALAPPDATA%\FM27 Manager`.
  2. `npx tauri build`
  3. `Start-Process "src-tauri\target\release\bundle\nsis\FM27 Manager_0.8.0_x64-setup.exe" -ArgumentList '/S' -Wait`
  4. Check the exe's LastWriteTime.
  Do this when dev mode isn't running, or when the user asks for it.
- Never take screenshots or steal focus: the user is often playing on the same machine.

## Architecture

- `src/domain/`: **pure logic, no React or Tauri**, covered by Vitest (`*.test.ts`). Put new calculation logic here, with tests.
  - `rating.ts`: weighted attribute average (1-20; attributes outside the role share `OTHER_ATTRIBUTES_SHARE` = 15 % of the weight) → `RATING_CURVE` (score /100, calibrated on a full FM27 database: best player ≈ 97, top 1000 ≈ 74) × `FAMILIARITY_CURVE` factor (never played ×0.5). Stars (CA/PA) are **not** used in ratings.
  - `lineup.ts`: `computeLineup` (locked players first, then Hungarian assignment maximising the overall score = mean of the in-possession and out-of-possession ratings), `placePlayer` / `benchPlayer` / `moveSlot`, `summarizeLineup`, `lineOf`. The Tactics page calls it with `autoFill = false`: only placed (locked) players are starters; `fillEmptySlots` / `bestEleven` / `clearEleven` write the auto choice into the locks.
  - Phases: a `TacticSlot`'s `row/col/roleId` are the **in-possession** shape and `oop` the **out-of-possession** shape (same player). UI edits go through `phaseSlots` (view of a phase) → existing helpers (`moveSlot`…) → `mergePhase` / `patchShape`. `normalizeTacticSlots` fills `oop` for older tactics and drops the FM24 `duty` (no duties in FM26/27).
  - The Tactics page never shows player photos (cards: rating before the name, age · flag · familiarity, next backup).
  - `pitch.ts`: grid of 6 rows (0 = ST … 5 = GK) × FM's 5 lanes: 5 cells in the D, DM, M and AM rows, 3 in the ST row (central lanes). A card's position comes from its cell (`positionAt`); cards 19 % wide fit side by side. Tactics saved with the former 9-column half-space grid (`tactics.grid = 9`, backups v3) go through `narrowHalfSpaceGrid` (lineup.ts) / `narrowCells`; grid 5 rows and backups v1, v2, v4 are already on lanes.
  - The Tactics page pitch is always vertical (own goal at the bottom, no landscape view) and takes the full height of its area (width up to `PITCH_RATIO`).
  - `defaultRoles.ts`: `DEFAULT_ROLES` = `FM_ROLES` only (the notebook profiles were removed) (`fmRoles.ts`, generated from the sortitoutsi page « FM26: Important Attributes for Every Role »: 68 FM26/27 roles with `phase` ip/oop, weights 5 = line physical attributes, 3 = key, 1 = preferred, ids prefixed `fm-`). Obsolete roles (FM24, notebook ids) are stripped from a stored custom list at load (`cleanStoredRoles`). `DEFAULT_ROLE_BY_POSITION` / `DEFAULT_OOP_ROLE_BY_POSITION` (`defaultRoleFor(position, phase)`) pick the default in / out of possession role per position.
  - `nationalities.ts`: nationality = flag-icons code (`fr`, `gb-eng`…), names from `Intl.DisplayNames`; `nationCode` also resolves old free-text values (« Brésil »). Photo search compares the English name.
  - `clubMatch.ts`: picks the Transfermarkt club for a name (exact name, then all words, skipping reserve/youth teams unless asked).
  - `photoMatch.ts`: picks the Transfermarkt candidate (name tokens, age gap −1…+10, nationality preferred; French country names mapped via `Intl.DisplayNames`).
  - `fmSave.ts`: converts the raw players of an FM27 save (`SavePlayer`) into app players: `SAVE_VALUES` (order of the 54 raw values, 1-100 shown as `round(v / 5)`), `SAVE_POSITIONS`, `FM_NATIONS` (internal nation id → flag code), `planSaveImport` (updates keep name, stars, wage, value, status, notes, photo).
  - `scouting.ts`: decodes the scouting database (every player of the save, binary written by `scouting_snapshot` in `fm_save.rs`, stored as `scouting.bin` in the app data dir by `fm_scout_refresh`), `rateScout` (same rating as the squad, via `rateWith`, on raw values), `searchScouts` (filters, sort, limit). The Scouting page keeps the decoded database in memory (`loadScouting` in `src/data/fmSave.ts`).
  - Each app club remembers its save (`src/lib/saveLink.ts`, localStorage). `src/lib/refreshFromSave.ts` (Settings › Refresh data) re-reads it: squad import without preview, then scouting database.
- `src-tauri/src/fm_save.rs`: reads a `.fm` save (zstd frames, ~400 MB decompressed, ~2 s): name tables, player blocks (15 position bytes + 54 values, then the identity record), contracts, clubs and their teams, header (manager, managed club, game date). The last save read is cached (key: path + size + modification time). Commands `fm_save_scan` / `fm_save_players`; ignored test `reads_real_save` runs on a real file (`FM_SAVE=… cargo test --release -- --ignored`). Wage = u32 17 bytes into the contract record, weekly in GBP (`EUR_PER_GBP` in `fmSave.ts`). Transfer value = u32 in GBP right after the 54 values (block + 69); `FFFFFFFF` and exactly 300 000 000 (placeholder of ~2 000 players without a computed value) mean unknown; the game shows a range around it. The scouting database stores it since format `FMS3` (`FMS2` still decodes, without values). Average match rating of the season (`season_ratings`): player stats records are sorted by internal id (u32 at block − 43); each ends with a season summary (8-byte entries `02 [sum of ratings×10 u16] ? [matches] …`, one per competition), `10`, 16 slots of 3 bytes `[rating×10][competition][06]` (last ratings), `01`, then the next record's id; player X's block is the first one after the marker `01 [X+1]`. Average = Σsum / Σmatches / 10 (game value within ±0.03, ratings being rounded to 0.1). Stored as `FMS4` in the scouting database and in `players.avg_rating` / `rated_matches` (migration 008). League and CA/PA stars are not decoded (league: not stored on the club record).
- `src/data/`: the `DataSource` interface is implemented by `ManualSource` (SQLite). A future `MemorySource` (reading FM27 memory) must implement the same interface. `transfermarkt.ts` fetches through the Rust command `transfermarkt_get` (host whitelist in `src-tauri/src/lib.rs`).
- `src/store.tsx`: global state, plus the photo search queue (one player at a time, 1.5 s pause, cache table `photo_cache` keyed by name + nationality) and the club logo queue (`club_logo_cache`, keyed by normalised club name).
  - **Clubs**: one managed club = one FM save. `players` and `tactics` exposed by the store are those of the **active club** (`activeClub`, remembered in localStorage); the source returns all clubs. Roles are shared. `App` remounts the page when the club changes.
  - Loaned-out players (`onLoan`, `club` = host club) are out of the squad: separate tab in Squad, filtered out of Tactics, never picked by `computeLineup`.
- `src/i18n/`: `en.ts` defines the `Messages` type, and `fr.ts` must implement every key. **Every new text goes in both files.**
- `src/components/ui/`: generated by shadcn (radix-nova style), excluded from lint. Don't hand-edit them except for real fixes (e.g. `sonner.tsx` uses a fixed dark theme).
  - Tables (Squad, Scouting): click a header to sort (Scouting: second click reverses; `ScoutFilters.desc`, unknown values always last), columns can be hidden from the « Columns » menu and reordered by dragging headers (`ColumnDnd` / `ReorderableTh` in `ReorderableColumns.tsx`, pure logic in `domain/columnLayout.ts`, persisted in localStorage by `lib/columnPrefs.ts`: `squad.columns` + `squad.columnOrder`, `scouting.columns`).
  - Business components live in `src/components/`: `ui.tsx` (`PlayerAvatar`, `RatingBadge`, `Stars`), `chips.tsx`, `layout.tsx` (`PageHeader`, `Panel`, `StatTile`…), `RolePicker.tsx`, `PositionPitch.tsx`.
  - `styles.ts` is the single source of colours (scores, attributes, familiarity, statuses, pitch lines).
- `src-tauri/`: plugins (sql, dialog, fs), SQL migrations (`migrations/00N_*.sql`, declared in `lib.rs`; add new ones, never edit existing ones), window permissions in `capabilities/default.json`.

## Conventions and pitfalls

- **Never use `window.confirm` / `alert`**: the Tauri dialog plugin replaces them with async versions (a Promise is always "true"). Use `askConfirm()` from `src/lib/confirm.ts`.
- sqlx stores a checksum of each migration's exact bytes: a migration applied from a CRLF working copy fails on a CI build ("migration N was previously applied but has been modified"). `lib.rs` normalises the SQL to LF; keep migration files in LF.
- Radix `Select` doesn't accept `value=""`: use a sentinel (`'all'`, `'new'`).
- dnd-kit: drop zones must stay mounted. The "Squad" tab of Tactics uses `forceMount`.
- Colours: dark theme only (slate surfaces, emerald accent); variables live in `src/index.css`. Use `cn()` (from `@/lib/utils`) for classes.
- `@/` alias → `src/`.
- Window: standard mode is 1500 wide, 950–1300 high (`tauri.conf.json` + `src/lib/windowMode.ts`). Portrait mode is 1080×1920 on a vertical screen and lifts the limits.
- Code comments are written in French. Match the style of the surrounding code.
- Demo players are tagged `[demo]` at the start of their notes (`DEMO_MARKER`). `randomSquad.ts` (`randomTeam(seed)`) builds random test teams: a real club from `RANDOM_CLUBS`, a pool of real players by profile/side, invented names per nationality.

## Git

- `main` branch. Annotated version tags `vX.Y.Z`, whose message summarises the changes.
- Keep the version in sync in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. If it changes, the NSIS installer name changes too.
