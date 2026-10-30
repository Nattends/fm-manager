import type { AttributeKey } from './attributes'
import {
  ageAt, displayValue, FM_NATIONS, footFrom, SAVE_POSITIONS, SAVE_VALUES, saveFields, todayGameDate, valueEuros, wageEuros, type GameDate,
} from './fmSave'
import { normalizeText } from './photoMatch'
import type { Position } from './positions'
import { familiarityFactor, ratingWeights, rateWith, scoreFromAverage, type RoleRating } from './rating'
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
  /** Salaire hebdomadaire en euros, null si inconnu. */
  wage: number | null
  /** Valeur de transfert en euros, null si inconnue (ou base lue avant la v0.15). */
  value: number | null
}

export interface ScoutDb {
  refreshedAt: Date
  savePath: string
  gameDate: GameDate | null
  clubs: ScoutClub[]
  players: ScoutPlayer[]
}

/** FMS3 ajoute la valeur de transfert après le salaire ; FMS2 (bases plus anciennes) n'en a pas. */
const MAGICS = ['FMS2', 'FMS3']
const NONE = 0xffffffff

/** Décode la base enregistrée ; null si elle est vide ou d'un autre format. */
export function decodeScouting(bytes: Uint8Array): ScoutDb | null {
  const magic = bytes.length >= 8 ? String.fromCharCode(...bytes.subarray(0, 4)) : ''
  if (!MAGICS.includes(magic)) return null
  const withValue = magic === 'FMS3'
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
    const wage = wageEuros(u32())
    const rawValue = withValue ? u32() : NONE
    const name = text(bytes[p++])
    players.push({
      index: i, name, birth, nationality, positions, values,
      club: club === NONE ? -1 : club, owner: owner === NONE ? -1 : owner, contractEnd, wage,
      value: valueEuros(rawValue === NONE ? null : rawValue),
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
    contractEnd: p.contractEnd, wage: 0, value: null, onLoan: false, hostClub: '',
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
    wage: p.wage,
    value: p.value,
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

export type ScoutSort = 'rating' | 'age' | 'name' | 'wage' | 'value'

export interface ScoutFilters {
  search: string
  /** Postes joués (Compétent ou mieux, l'un d'eux suffit), vide = tous. */
  positions: Position[]
  /** Rôle noté (et classement par cette note), null = meilleure note parmi `roles`. */
  role: RoleDefinition | null
  /** Rôles pris en compte pour la meilleure note. */
  roles: RoleDefinition[]
  minAge: number | null
  maxAge: number | null
  /** Salaire hebdomadaire en euros (bornes incluses), null = pas de borne. Un salaire inconnu ne passe pas une borne. */
  minWage: number | null
  maxWage: number | null
  /** Valeur de transfert en euros (bornes incluses), null = pas de borne. Une valeur inconnue ne passe pas une borne. */
  minValue: number | null
  maxValue: number | null
  /** Code de nationalité, null = toutes. */
  nationality: string | null
  /** Texte recherché dans le nom du club (« libre » pour les joueurs sans club). */
  club: string
  /** Pays du club actuel (code de drapeau), null = tous. */
  clubNation: string | null
  /** Masque les joueurs prêtés par leur club. */
  hideLoaned: boolean
  sort: ScoutSort
  limit: number
}

export interface ScoutRow {
  player: ScoutPlayer
  age: number
  /** Note du rôle choisi, ou meilleure note du joueur. */
  rating: RoleRating | null
  /** Rôle de cette note. */
  ratedRole: RoleDefinition | null
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

/** Rôle préparé pour noter des dizaines de milliers de joueurs : index des valeurs brutes et des postes. */
interface CompiledRole {
  role: RoleDefinition
  values: number[]
  weights: number[]
  total: number
  positions: number[]
}

function compileRole(role: RoleDefinition): CompiledRole {
  const list = ratingWeights(role)
  return {
    role,
    values: list.map(([a]) => VALUE_INDEX[a]),
    weights: list.map(([, w]) => w),
    total: list.reduce((s, [, w]) => s + w, 0),
    positions: role.positions.map((p) => POSITION_INDEX[p]),
  }
}

/** Même note que `rateScout` (sans le détail), calculée directement sur les valeurs brutes. */
function fastScore(p: ScoutPlayer, c: CompiledRole): number {
  if (!c.total) return 0
  let sum = 0
  for (let i = 0; i < c.values.length; i++) sum += displayValue(p.values[c.values[i]]) * c.weights[i]
  let fam = 0
  for (const i of c.positions) if (p.positions[i] > fam) fam = p.positions[i]
  return Math.round(scoreFromAverage(sum / c.total) * familiarityFactor(fam > 1 ? fam : undefined) * 10) / 10
}

/** Meilleure note parmi des rôles, en ne gardant que ceux dont le joueur connaît au moins un poste. */
function bestOf(p: ScoutPlayer, roles: CompiledRole[]): { score: number; role: number } {
  let best = { score: 0, role: -1 }
  for (let r = 0; r < roles.length; r++) {
    if (!roles[r].positions.some((i) => p.positions[i] > 1)) continue
    const score = fastScore(p, roles[r])
    if (score > best.score) best = { score, role: r }
  }
  return best
}

const bestCache = new WeakMap<ScoutDb, { roles: RoleDefinition[]; scores: Float32Array; best: Int16Array }>()

/** Meilleure note de tous les joueurs sur tous les rôles (calculée une fois par base et par liste de rôles). */
function bestAll(db: ScoutDb, roles: RoleDefinition[], compiled: CompiledRole[]) {
  let entry = bestCache.get(db)
  if (entry?.roles !== roles) {
    const scores = new Float32Array(db.players.length)
    const best = new Int16Array(db.players.length)
    for (const p of db.players) {
      const b = bestOf(p, compiled)
      scores[p.index] = b.score
      best[p.index] = b.role
    }
    entry = { roles, scores, best }
    bestCache.set(db, entry)
  }
  return entry
}

/** Montant entre deux bornes facultatives ; un montant inconnu ne passe que s'il n'y a aucune borne. */
function inRange(v: number | null, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true
  return v !== null && (min === null || v >= min) && (max === null || v <= max)
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
  const positionIdx = f.positions.map((p) => POSITION_INDEX[p])
  // meilleure note : sur tous les rôles (gardée en mémoire), ou sur ceux des postes choisis
  const allRoles = f.roles.map(compileRole)
  const cache = !f.role && !f.positions.length ? bestAll(db, f.roles, allRoles) : null
  const roleSubset = f.positions.length ? allRoles.filter((c) => c.role.positions.some((p) => f.positions.includes(p))) : allRoles
  const chosen = f.role ? compileRole(f.role) : null

  const found: { player: ScoutPlayer; age: number; score: number; role: RoleDefinition | null }[] = []
  for (const p of db.players) {
    if (f.hideLoaned && p.owner >= 0) continue
    if (clubQ) {
      const ok = p.club >= 0 ? clubMatch[p.club] : free !== '' && free.startsWith(clubQ)
      if (!ok) continue
    }
    if (f.nationality && p.nationality !== f.nationality) continue
    if (f.clubNation && (p.club < 0 || db.clubs[p.club].nation !== f.clubNation)) continue
    if (positionIdx.length && !positionIdx.some((i) => p.positions[i] >= SCOUT_PLAYS_AT)) continue
    const age = ages[p.index]
    if (f.minAge !== null && age < f.minAge) continue
    if (f.maxAge !== null && age > f.maxAge) continue
    if (!inRange(p.wage, f.minWage, f.maxWage) || !inRange(p.value, f.minValue, f.maxValue)) continue
    if (q && !names?.[p.index].includes(q)) continue
    if (chosen) found.push({ player: p, age, score: fastScore(p, chosen), role: chosen.role })
    else if (cache) {
      const r = cache.best[p.index]
      found.push({ player: p, age, score: cache.scores[p.index], role: r >= 0 ? f.roles[r] : null })
    } else {
      const b = bestOf(p, roleSubset)
      found.push({ player: p, age, score: b.score, role: b.role >= 0 ? roleSubset[b.role].role : null })
    }
  }
  const byName = (a: { player: ScoutPlayer }, b: { player: ScoutPlayer }) => a.player.name.localeCompare(b.player.name)
  if (f.sort === 'rating') found.sort((a, b) => b.score - a.score || byName(a, b))
  else if (f.sort === 'age') found.sort((a, b) => a.age - b.age || byName(a, b))
  else if (f.sort === 'wage') found.sort((a, b) => (b.player.wage ?? -1) - (a.player.wage ?? -1) || byName(a, b))
  else if (f.sort === 'value') found.sort((a, b) => (b.player.value ?? -1) - (a.player.value ?? -1) || byName(a, b))
  else found.sort(byName)
  // note détaillée (badge) seulement pour les lignes affichées
  const rows = found.slice(0, f.limit).map(({ player, age, role }): ScoutRow => ({
    player, age, ratedRole: role, rating: role ? rateScout(player, role) : null,
  }))
  return { rows, total: found.length }
}