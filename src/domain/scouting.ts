import type { AttributeKey } from './attributes'
import { ageAt, displayValue, FM_NATIONS, footFrom, SAVE_POSITIONS, SAVE_VALUES, saveFields, todayGameDate, type GameDate } from './fmSave'
import { normalizeText } from './photoMatch'
import type { Position } from './positions'
import { rateWith, type RoleRating } from './rating'
import type { Foot, Player, RoleDefinition } from './types'

/**
 * Base de scouting : tous les joueurs d'une sauvegarde FM27, enregistrés par la commande Rust `fm_scout_refresh`
 * dans un format binaire compact (voir `scouting_snapshot` dans src-tauri/src/fm_save.rs).
 */

export interface ScoutClub {
  name: string
  nation: string
}

export interface ScoutPlayer {
  index: number
  name: string
  birth: GameDate
  nationality: string
  /** Familiarité brute (1-20) dans l'ordre de `SAVE_POSITIONS`. */
  positions: Uint8Array
  /** Valeurs brutes (1-100) dans l'ordre de `SAVE_VALUES`. */
  values: Uint8Array
  /** Club actuel (index dans `clubs`), -1 = sans club. */
  club: number
  /** Club propriétaire quand le joueur est prêté, sinon -1. */
  owner: number
  contractEnd: GameDate | null
}

export interface ScoutDb {
  refreshedAt: Date
  savePath: string
  gameDate: GameDate | null
  clubs: ScoutClub[]
  players: ScoutPlayer[]
}

const MAGIC = 'FMS1'
const NONE = 0xffffffff

/** Décode la base enregistrée ; null si elle est vide ou d'un autre format. */
export function decodeScouting(bytes: Uint8Array): ScoutDb | null {
  if (bytes.length < 8 || String.fromCharCode(...bytes.subarray(0, 4)) !== MAGIC) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const utf8 = new TextDecoder()
  let p = 4
  const u16 = () => { const v = view.getUint16(p, true); p += 2; return v }
  const u32 = () => { const v = view.getUint32(p, true); p += 4; return v }
  const text = (len: number) => { const s = utf8.decode(bytes.subarray(p, p + len)); p += len; return s }
  const date = (): GameDate | null => { const day = u16(); const year = u16(); return year ? { day, year } : null }

  const refreshedAt = new Date(Number(view.getBigUint64(p, true)))
  p += 8
  const savePath = text(u16())
  const gameDate = date()
  const clubs: ScoutClub[] = []
  for (let n = u32(), i = 0; i < n; i++) {
    const nation = FM_NATIONS[u16()] ?? ''
    clubs.push({ name: text(u16()), nation })
  }
  const players: ScoutPlayer[] = []
  for (let n = u32(), i = 0; i < n; i++) {
    const positions = bytes.subarray(p, p + 15)
    const values = bytes.subarray(p + 15, p + 69)
    p += 69
    const birth = date() ?? { day: 1, year: 2000 }
    const nationality = FM_NATIONS[u16()] ?? ''
    const club = u32()
    const owner = u32()
    const contractEnd = date()
    const name = text(bytes[p++])
    players.push({
      index: i, name, birth, nationality, positions, values,
      club: club === NONE ? -1 : club, owner: owner === NONE ? -1 : owner, contractEnd,
    })
  }
  return { refreshedAt, savePath, gameDate, clubs, players }
}

const VALUE_INDEX = Object.fromEntries(SAVE_VALUES.map((k, i) => [k, i]).filter(([k]) => k)) as Record<AttributeKey, number>
const POSITION_INDEX = Object.fromEntries(SAVE_POSITIONS.map((k, i) => [k, i]).filter(([k]) => k)) as Record<Position, number>

/** Familiarité (1-20) à un poste, undefined si le joueur n'y a jamais joué. */
export function scoutFamiliarity(p: ScoutPlayer, position: Position): number | undefined {
  const v = p.positions[POSITION_INDEX[position]]
  return v > 1 ? v : undefined
}

/** Pied fort d'un joueur de la base. */
export function scoutFoot(p: ScoutPlayer): Foot {
  return footFrom(p.values[SAVE_VALUES.indexOf('leftFoot')], p.values[SAVE_VALUES.indexOf('rightFoot')])
}

/** Note d'un joueur de la base pour un rôle (même calcul que pour l'effectif). */
export function rateScout(p: ScoutPlayer, role: RoleDefinition, position?: Position): RoleRating {
  let familiarity: number | undefined
  for (const pos of position ? [position] : role.positions) {
    const f = scoutFamiliarity(p, pos)
    if (f !== undefined && (familiarity === undefined || f > familiarity)) familiarity = f
  }
  return rateWith((attr) => displayValue(p.values[VALUE_INDEX[attr]]), familiarity, role)
}

/** Joueur de la base sous la forme d'un joueur de l'application (pour la fiche et les notes par rôle). */
export function scoutAsPlayer(p: ScoutPlayer, db: ScoutDb, today: GameDate): Player {
  const f = saveFields({
    name: p.name, firstName: '', lastName: '', birth: p.birth, nation: -1, positions: p.positions, values: p.values,
    contractEnd: p.contractEnd, onLoan: false, hostClub: '',
  }, today)
  return {
    ...f,
    id: -(p.index + 1),
    nationality: p.nationality,
    clubId: 0,
    club: clubName(db, p.club),
    onLoan: p.owner >= 0,
    caStars: 0,
    paStars: 0,
    wage: null,
    value: null,
    status: 'rotation',
    notes: '',
    photo: null,
    photoLookup: null,
  }
}

export function clubName(db: ScoutDb, index: number): string {
  return index >= 0 ? db.clubs[index]?.name ?? '' : ''
}

/** Date du jeu de la base, ou la date réelle si elle est inconnue. */
export function scoutToday(db: ScoutDb): GameDate {
  return db.gameDate ?? todayGameDate()
}

export type ScoutSort = 'rating' | 'age' | 'name'

export interface ScoutFilters {
  search: string
  /** Poste joué (Compétent ou mieux), null = tous. */
  position: Position | null
  /** Rôle noté (et classement par cette note), null = aucun. */
  role: RoleDefinition | null
  minAge: number | null
  maxAge: number | null
  /** Code de nationalité, null = toutes. */
  nationality: string | null
  /** Texte recherché dans le nom du club (« libre » pour les joueurs sans club). */
  club: string
  sort: ScoutSort
  limit: number
}

export interface ScoutRow {
  player: ScoutPlayer
  age: number
  rating: RoleRating | null
}

/** Familiarité minimale pour qu'un joueur « joue » à un poste (Compétent). */
export const SCOUT_PLAYS_AT = 14

const searchNames = new WeakMap<ScoutDb, string[]>()
const agesCache = new WeakMap<ScoutDb, { key: string; ages: Int16Array }>()

/** Âges de tous les joueurs à une date (calculés une fois par base et par date). */
function agesAt(db: ScoutDb, today: GameDate): Int16Array {
  const key = `${today.year}-${today.day}`
  let entry = agesCache.get(db)
  if (entry?.key !== key) {
    entry = { key, ages: Int16Array.from(db.players, (p) => ageAt(p.birth, today)) }
    agesCache.set(db, entry)
  }
  return entry.ages
}

/** Joueurs qui passent les filtres, classés, au plus `limit` ; `total` compte tous ceux qui passent. */
export function searchScouts(db: ScoutDb, f: ScoutFilters, today: GameDate, freeLabel = ''): { rows: ScoutRow[]; total: number } {
  const q = normalizeText(f.search)
  let names = searchNames.get(db)
  if (q && !names) {
    names = db.players.map((p) => normalizeText(p.name))
    searchNames.set(db, names)
  }
  const clubQ = normalizeText(f.club)
  const free = normalizeText(freeLabel)
  const clubMatch = db.clubs.map((c) => !clubQ || normalizeText(c.name).includes(clubQ))
  const ages = agesAt(db, today)
  const rows: ScoutRow[] = []
  for (const p of db.players) {
    if (clubQ) {
      const ok = p.club >= 0 ? clubMatch[p.club] : free !== '' && free.startsWith(clubQ)
      if (!ok) continue
    }
    if (f.nationality && p.nationality !== f.nationality) continue
    if (f.position && (scoutFamiliarity(p, f.position) ?? 0) < SCOUT_PLAYS_AT) continue
    const age = ages[p.index]
    if (f.minAge !== null && age < f.minAge) continue
    if (f.maxAge !== null && age > f.maxAge) continue
    if (q && !names?.[p.index].includes(q)) continue
    rows.push({ player: p, age, rating: f.role ? rateScout(p, f.role, f.position ?? undefined) : null })
  }
  const byName = (a: ScoutRow, b: ScoutRow) => a.player.name.localeCompare(b.player.name)
  if (f.sort === 'rating' && f.role) rows.sort((a, b) => (b.rating?.score ?? 0) - (a.rating?.score ?? 0) || byName(a, b))
  else if (f.sort === 'age') rows.sort((a, b) => a.age - b.age || byName(a, b))
  else rows.sort(byName)
  return { rows: rows.slice(0, f.limit), total: rows.length }
}
