import type { AttributeKey } from './attributes'
import type { Position } from './positions'
import { findExisting, type ImportPlan } from './screen/squadImport'
import type { Attributes, Club, Foot, NewPlayer, Player, PositionFamiliarity } from './types'

/**
 * Données lues dans une sauvegarde FM27 (.fm) par la commande Rust `fm_save_*` (src-tauri/src/fm_save.rs).
 * Les valeurs sont brutes : cette fonction les convertit en joueurs de l'application.
 */

/** Date FM : jour de l'année (1 = 1er janvier) et année. */
export interface GameDate {
  day: number
  year: number
}

export interface SaveClub {
  id: number
  name: string
  shortName: string
  nation: number
  players: number
}

export interface SaveSummary {
  manager: string
  managedClubId: number | null
  gameDate: GameDate | null
  clubs: SaveClub[]
  totalPlayers: number
}

export interface SavePlayer {
  name: string
  firstName: string
  lastName: string
  birth: GameDate
  nation: number
  /** Familiarité 1-20 dans l'ordre de `SAVE_POSITIONS`. */
  positions: number[]
  /** 54 valeurs 1-100 dans l'ordre de `SAVE_VALUES`. */
  values: number[]
  contractEnd: GameDate | null
  onLoan: boolean
  hostClub: string
}

/** Ordre des 15 postes dans la sauvegarde (le libéro n'existe pas dans l'application). */
export const SAVE_POSITIONS: (Position | null)[] = [
  'GK', null, 'DL', 'DC', 'DR', 'DM', 'ML', 'MC', 'MR', 'AML', 'AMC', 'AMR', 'ST', 'WBL', 'WBR',
]

/** Ordre des 54 valeurs : 47 attributs, les pieds (gauche, droit) et 5 valeurs cachées (null). */
export const SAVE_VALUES: (AttributeKey | 'leftFoot' | 'rightFoot' | null)[] = [
  'crossing', 'dribbling', 'finishing', 'heading', 'longShots', 'marking', 'offTheBall', 'passing', 'penaltyTaking', 'tackling',
  'vision', 'handling', 'aerialReach', 'commandOfArea', 'communication', 'kicking', 'throwing', 'anticipation', 'decisions', 'oneOnOnes',
  'positioning', 'reflexes', 'firstTouch', 'technique', 'leftFoot', 'rightFoot', 'flair', 'corners', 'teamwork', 'workRate',
  'longThrows', 'eccentricity', 'rushingOut', 'punching', 'acceleration', 'freeKick', 'strength', 'stamina', 'pace', 'jumpingReach',
  'leadership', null, 'balance', 'bravery', null, 'aggression', 'agility', null, null, null,
  'naturalFitness', 'determination', 'composure', 'concentration',
]

/**
 * Nations de FM (identifiant interne → code flag-icons). Les identifiants suivent l'ordre alphabétique anglais
 * par continent : Afrique, Asie, Amérique du Nord et centrale, Europe, Océanie, Amérique du Sud, puis les ajouts.
 * Établi d'après les clubs de chaque nation dans une sauvegarde.
 */
export const FM_NATIONS: Record<number, string> = {
  0: 'dz', 1: 'ao', 2: 'bj', 3: 'bw', 4: 'bf', 5: 'bi', 6: 'cm', 7: 'cv', 8: 'cf', 9: 'td',
  10: 'dj', 11: 'eg', 12: 'gq', 13: 'et', 14: 'ga', 15: 'gm', 16: 'gh', 17: 'gn', 18: 'gw', 19: 'ci',
  20: 'ke', 21: 'ls', 22: 'lr', 23: 'ly', 24: 'mg', 25: 'mw', 26: 'ml', 27: 'mr', 28: 'mu', 29: 'ma',
  30: 'mz', 31: 'na', 32: 'ne', 33: 'ng', 34: 'rw', 35: 'st', 36: 'sn', 37: 'sc', 38: 'sl', 39: 'so',
  40: 'za', 41: 'sd', 42: 'sz', 43: 'tz', 44: 'cg', 45: 'tg', 46: 'tn', 47: 'ug', 48: 'cd', 49: 'zm',
  50: 'zw', 51: 'af', 52: 'bh', 53: 'bd', 54: 'bn', 55: 'cn', 56: 'hk', 57: 'in', 58: 'id', 59: 'ir',
  60: 'iq', 61: 'jp', 62: 'jo', 63: 'kh', 64: 'kz', 65: 'kw', 66: 'kg', 67: 'la', 68: 'lb', 69: 'mo',
  70: 'my', 71: 'mv', 72: 'mm', 73: 'np', 74: 'kp', 75: 'om', 76: 'pk', 77: 'qa', 78: 'sa', 79: 'sg',
  80: 'kr', 81: 'lk', 82: 'sy', 83: 'tw', 84: 'tj', 85: 'th', 86: 'ph', 87: 'tm', 88: 'ae', 89: 'uz',
  90: 'vn', 91: 'ye', 92: 'ag', 93: 'aw', 94: 'bb', 95: 'bz', 96: 'bm', 97: 'ca', 98: 'ky', 99: 'cr',
  100: 'cu', 101: 'dm', 102: 'sv', 103: 'gd', 104: 'gt', 105: 'gy', 106: 'ht', 107: 'hn', 108: 'jm', 109: 'mx',
  110: 'cw', 111: 'ni', 112: 'pa', 113: 'pr', 114: 'lc', 115: 'kn', 116: 'vc', 117: 'sr', 118: 'bs', 119: 'tt',
  120: 'us', 126: 'al', 127: 'ad', 128: 'am', 129: 'at', 130: 'az', 131: 'be', 132: 'by', 133: 'ba', 134: 'bg',
  135: 'hr', 136: 'cy', 137: 'cz', 138: 'dk', 139: 'gb-eng', 140: 'ee', 141: 'fo', 142: 'fi', 143: 'fr', 144: 'ge',
  145: 'de', 146: 'gr', 147: 'hu', 148: 'is', 149: 'il', 150: 'it', 151: 'lv', 152: 'li', 153: 'lt', 154: 'lu',
  155: 'mk', 156: 'mt', 157: 'md', 158: 'nl', 159: 'gb-nir', 160: 'no', 161: 'pl', 162: 'pt', 163: 'ie', 164: 'ro',
  165: 'ru', 166: 'sm', 167: 'gb-sct', 168: 'sk', 169: 'si', 170: 'es', 171: 'se', 172: 'ch', 173: 'tr', 174: 'ua',
  175: 'gb-wls', 176: 'rs', 177: 'au', 178: 'ck', 179: 'fj', 180: 'nz', 181: 'pg', 182: 'sb', 183: 'pf', 184: 'to',
  185: 'vu', 186: 'ws', 187: 'ar', 188: 'bo', 189: 'br', 190: 'cl', 191: 'co', 192: 'ec', 193: 'py', 194: 'pe',
  195: 'uy', 196: 've', 197: 'ps', 201: 'as', 202: 'mn', 203: 'gu', 204: 'er', 205: 'ai', 206: 'vg', 207: 'ms',
  208: 'vi', 209: 'tc', 210: 'nc', 211: 'bt', 212: 'do', 215: 'ki', 216: 'gi', 217: 'bq', 219: 'xk', 225: 'gf',
  226: 'gp', 227: 'mq', 228: 'sx', 229: 'mf', 230: 're', 231: 'yt', 232: 'wf', 233: 'pm', 234: 'km', 236: 'tl',
  239: 'tz', 240: 'ss', 242: 'fm', 243: 'mp', 244: 'tv', 247: 'me', 249: 'bl',
}

/** Valeur interne (1-100) → attribut affiché (1-20). */
export function displayValue(raw: number): number {
  return Math.min(20, Math.max(1, Math.round(raw / 5)))
}

/** Date ISO (AAAA-MM-JJ) d'un jour de l'année. */
export function isoDate(d: GameDate): string {
  const date = new Date(Date.UTC(d.year, 0, d.day))
  return date.toISOString().slice(0, 10)
}

/** Âge à la date du jeu. */
export function ageAt(birth: GameDate, today: GameDate): number {
  const b = new Date(Date.UTC(birth.year, 0, birth.day))
  const t = new Date(Date.UTC(today.year, 0, today.day))
  let age = t.getUTCFullYear() - b.getUTCFullYear()
  if (t.getUTCMonth() < b.getUTCMonth() || (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate())) age--
  return age
}

/** Pied fort : les deux si le plus faible est au moins « fort » (80/100). */
export function footFrom(left: number, right: number): Foot {
  if (Math.min(left, right) >= 80) return 'both'
  return left > right ? 'left' : 'right'
}

export interface SaveFields {
  name: string
  age: number
  nationality: string
  foot: Foot
  positions: PositionFamiliarity
  attributes: Attributes
  contractEnd: string | null
  onLoan: boolean
  club: string
}

/** Champs de l'application tirés d'un joueur de la sauvegarde. */
export function saveFields(p: SavePlayer, today: GameDate): SaveFields {
  const attributes: Attributes = {}
  let left = 0
  let right = 0
  SAVE_VALUES.forEach((key, i) => {
    const raw = p.values[i]
    if (key === 'leftFoot') left = raw
    else if (key === 'rightFoot') right = raw
    else if (key) attributes[key] = displayValue(raw)
  })
  const positions: PositionFamiliarity = {}
  SAVE_POSITIONS.forEach((pos, i) => {
    // 1 = jamais joué à ce poste
    if (pos && p.positions[i] > 1) positions[pos] = p.positions[i]
  })
  return {
    name: p.name,
    age: ageAt(p.birth, today),
    nationality: FM_NATIONS[p.nation] ?? '',
    foot: footFrom(left, right),
    positions,
    attributes,
    contractEnd: p.contractEnd ? isoDate(p.contractEnd) : null,
    onLoan: p.onLoan,
    club: p.onLoan ? p.hostClub : '',
  }
}

export type SaveImportAction =
  | { kind: 'create'; player: NewPlayer; source: SavePlayer }
  | { kind: 'update'; player: NewPlayer; source: SavePlayer; existing: Player }

export type SaveImportPlan = Pick<ImportPlan, 'missing'> & { actions: SaveImportAction[] }

/**
 * Écritures à faire : les joueurs déjà connus sont mis à jour (âge, nationalité, postes, attributs, contrat),
 * en gardant ce que la sauvegarde ne donne pas (étoiles, salaire, valeur, statut, notes, photo).
 */
export function planSaveImport(players: SavePlayer[], existing: Player[], club: Club, today: GameDate): SaveImportPlan {
  const taken = new Set<number>()
  const actions: SaveImportAction[] = []
  for (const source of players) {
    const f = saveFields(source, today)
    const found = findExisting(f.name, f.age, existing, taken)
    if (found) {
      taken.add(found.id)
      // le nom existant est gardé : le changer relancerait la recherche de photo
      const player: NewPlayer = {
        ...found,
        age: f.age,
        nationality: f.nationality || found.nationality,
        foot: f.foot,
        positions: f.positions,
        attributes: { ...found.attributes, ...f.attributes },
        contractEnd: f.contractEnd ?? found.contractEnd,
        onLoan: f.onLoan,
        club: f.onLoan ? f.club : found.club,
      }
      actions.push({ kind: 'update', player, source, existing: found })
    } else {
      const player: NewPlayer = {
        ...f,
        clubId: club.id,
        caStars: 2.5,
        paStars: 3,
        wage: null,
        value: null,
        status: 'rotation',
        notes: '',
      }
      actions.push({ kind: 'create', player, source })
    }
  }
  const missing = existing.filter((p) => !taken.has(p.id) && p.clubId === club.id)
  return { actions, missing }
}
