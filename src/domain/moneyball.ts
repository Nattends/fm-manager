import { ageAt, SAVE_POSITIONS, type GameDate } from './fmSave'
import { clearEleven, computeLineup } from './lineup'
import { normalizeText } from './photoMatch'
import type { Position } from './positions'
import { bestScores, scoutKey, scoutScorer, type ScoutDb, type ScoutPlayer } from './scouting'
import { seasonStat } from './seasonStats'
import type { Player, RoleDefinition, TacticSlot } from './types'

/**
 * Moneyball : repérer les joueurs que le marché sous-évalue et qui renforcent vraiment l'équipe.
 * Quatre critères, tous exprimés en points de note (même échelle que les notes de rôle) pour pouvoir les additionner :
 * - gain : hausse de la note du titulaire (et, en partie, du remplaçant) au meilleur poste de la tactique ;
 * - surplus : note du joueur moins la note habituelle d'un joueur du même coût, de la même ligne et du même âge ;
 * - rendement : production sur le terrain (xG, xA, tirs, dribbles, tacles, passes, duels aériens, centres, arrêts, note…) au-dessus ou
 *   en dessous de celle attendue d'après ses attributs et le niveau de son club, convertie en points de note ;
 * - contrat : surplus gagné grâce à une indemnité réduite (libre, fin de contrat proche).
 * Tous les coefficients sont dans `MoneyballParams` (réglables dans Settings) ; les valeurs par défaut sont ci-dessous.
 */

/** Gain minimal (points de note) pour « renforce mon équipe » : en dessous, le joueur ne change rien. */
export const MIN_GAIN = 1
/** Part du gain sur le remplaçant comptée dans le gain d'équipe (la profondeur compte, moins que le XI). */
export const DEPTH_SHARE = 0.3
/** Minutes minimum dans la saison pour juger le rendement d'un joueur (et pour apprendre le modèle). */
export const OUTPUT_MIN_MINUTES = 450
/** Minutes « fictives » au rendement attendu : un écart sur 450 minutes compte un tiers, sur 30 matchs presque entièrement. */
export const OUTPUT_PRIOR_MINUTES = 900
/** Points de note par écart-type de rendement : 1 écart-type au-dessus de l'attendu ≈ un joueur 4 points meilleur. */
export const OUTPUT_POINTS_PER_SD = 4
/** Écart de rendement maximal, en points de note (3 écarts-types). */
export const OUTPUT_CAP = 12

export type Line = 'gk' | 'def' | 'mid' | 'att'

const LINE_OF: Record<Position, Line> = {
  GK: 'gk',
  DL: 'def', DC: 'def', DR: 'def', WBL: 'def', WBR: 'def',
  DM: 'mid', ML: 'mid', MC: 'mid', MR: 'mid',
  AML: 'att', AMC: 'att', AMR: 'att', ST: 'att',
}

/**
 * Bornes hautes des tranches d'âge du marché (la dernière tranche va au-delà) : à note égale, les jeunes coûtent plus
 * cher (on paie leur potentiel) et les plus de 30 ans de moins en moins (déclin).
 */
export const AGE_BANDS = [20, 23, 27, 30, 32, 34]

/** Valeur de transfert connue : 0 € (un quart des joueurs sous contrat, souvent hors des ligues chargées) veut dire non calculée. */
export function knownValue(p: Pick<ScoutPlayer, 'value'>): number | null {
  return p.value !== null && p.value > 0 ? p.value : null
}

function ageBand(age: number, bands: readonly number[]): number {
  const i = bands.findIndex((max) => age <= max)
  return i < 0 ? bands.length : i
}

/** Poste le plus familier du joueur, null s'il n'en a aucun. */
export function primaryPosition(p: ScoutPlayer): Position | null {
  let best: Position | null = null
  let fam = 1
  SAVE_POSITIONS.forEach((pos, i) => {
    if (pos && p.positions[i] > fam) {
      fam = p.positions[i]
      best = pos
    }
  })
  return best
}

/** Jours avant la fin du contrat (négatif s'il est fini), null si inconnue. */
export function contractDays(end: GameDate | null, today: GameDate): number | null {
  if (!end) return null
  return Math.round((Date.UTC(end.year, 0, end.day) - Date.UTC(today.year, 0, today.day)) / 86400000)
}

/** Réduction de l'indemnité selon la fin de contrat. */
export interface FeeParams {
  /** Part payée pour un contrat terminé. */
  expired: number
  /** Jours restants en dessous desquels on paie `short` (pré-contrat possible). */
  shortDays: number
  short: number
  /** Jours restants en dessous desquels on paie `year`. */
  yearDays: number
  year: number
}

export const DEFAULT_FEE: FeeParams = { expired: 0, shortDays: 183, short: 0.35, yearDays: 365, year: 0.7 }

/**
 * Part de la valeur à payer, selon le contrat (estimation) : rien pour un contrat fini, environ un tiers à moins
 * de 6 mois (pré-contrat possible), 70 % à moins d'un an. Fin de contrat inconnue (environ la moitié de la base) :
 * valeur entière. « Sans club » ne veut pas dire libre : le club de certains joueurs n'est pas décodé.
 */
export function feeFactor(p: Pick<ScoutPlayer, 'contractEnd'>, today: GameDate, fee: FeeParams = DEFAULT_FEE): number {
  const days = contractDays(p.contractEnd, today)
  if (days === null) return 1
  if (days <= 0) return fee.expired
  if (days <= fee.shortDays) return fee.short
  if (days <= fee.yearDays) return fee.year
  return 1
}

// --- courbes ---------------------------------------------------------------------------------------------

/** Courbe croissante (x, y), lue par interpolation linéaire, bornée aux extrémités. */
export type Curve = [x: number, y: number][]

export function readCurve(curve: Curve, x: number): number {
  if (!curve.length) return 0
  if (x <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]
    if (x <= x1) {
      const [x0, y0] = curve[i - 1]
      return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return curve[curve.length - 1][1]
}

const median = (sorted: number[]) => {
  const m = sorted.length >> 1
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2
}

/**
 * Courbe croissante qui suit des points : paquets de `binSize` points (médianes de x et de y),
 * puis régression isotone (les paquets qui descendent sont fusionnés) pour que y ne baisse jamais quand x monte.
 */
export function fitCurve(points: { x: number; y: number }[], binSize: number): Curve {
  if (!points.length) return []
  const sorted = [...points].sort((a, b) => a.x - b.x)
  const count = Math.max(1, Math.round(sorted.length / Math.max(1, binSize)))
  const bins: { x: number; y: number; w: number }[] = []
  for (let b = 0; b < count; b++) {
    const chunk = sorted.slice(Math.floor((b * sorted.length) / count), Math.floor(((b + 1) * sorted.length) / count))
    if (!chunk.length) continue
    bins.push({ x: median(chunk.map((p) => p.x)), y: median(chunk.map((p) => p.y).sort((u, v) => u - v)), w: chunk.length })
  }
  // fusion des paquets voisins qui ne montent pas (pool adjacent violators)
  const pools: { x: number; y: number; w: number }[] = []
  for (const bin of bins) {
    pools.push({ ...bin })
    while (pools.length > 1 && pools[pools.length - 2].y >= pools[pools.length - 1].y) {
      const b = pools.pop()!
      const a = pools.pop()!
      const w = a.w + b.w
      pools.push({ x: (a.x * a.w + b.x * b.w) / w, y: (a.y * a.w + b.y * b.w) / w, w })
    }
  }
  return pools.map((p) => [p.x, p.y])
}

// --- paramètres -----------------------------------------------------------------------------------------

/**
 * Groupes de comparaison du rendement : plus fins que les lignes, un sentinelle ne produit pas comme un relayeur
 * ni un latéral comme un axial.
 */
export type OutputGroup = 'gk' | 'cb' | 'fb' | 'dm' | 'mid' | 'att'
export const OUTPUT_GROUPS: OutputGroup[] = ['gk', 'cb', 'fb', 'dm', 'mid', 'att']

export type OutputStat =
  | 'xg' | 'goals' | 'xa' | 'shotsOnTarget' | 'dribbles' | 'tacklesWon' | 'passes' | 'passPct'
  | 'aerialsWon' | 'aerialPct' | 'crossPct' | 'savePct' | 'conceded' | 'rating'
export const OUTPUT_STATS: OutputStat[] = [
  'xg', 'goals', 'xa', 'shotsOnTarget', 'dribbles', 'tacklesWon', 'passes', 'passPct',
  'aerialsWon', 'aerialPct', 'crossPct', 'savePct', 'conceded', 'rating',
]
/** Pourcentages (affichés en %), et stats où moins = mieux (comptées en négatif dans l'indice). */
export const OUTPUT_PCT_STATS: OutputStat[] = ['passPct', 'aerialPct', 'crossPct', 'savePct']
export const OUTPUT_LOWER_BETTER: OutputStat[] = ['conceded']

export type OutputWeights = Record<OutputGroup, Partial<Record<OutputStat, number>>>

/**
 * Poids des stats dans l'indice de chaque ligne : ce qui fait un bon attaquant n'est pas ce qui fait un bon défenseur.
 * Les xG pèsent plus que les buts (la finition varie beaucoup d'une saison à l'autre). Les duels aériens comptent
 * surtout pour les défenseurs centraux ; les gardiens sont jugés sur le % d'arrêts et les buts encaissés (qui dépendent
 * aussi de la défense : le niveau du club, dans la régression, en corrige une partie).
 */
export const OUTPUT_WEIGHTS: OutputWeights = {
  att: { xg: 2, goals: 1, xa: 1, shotsOnTarget: 0.5, dribbles: 0.5, aerialsWon: 0.25, rating: 1 },
  mid: { xa: 1.5, xg: 0.75, passes: 0.75, passPct: 0.5, tacklesWon: 0.75, dribbles: 0.5, rating: 1 },
  dm: { tacklesWon: 1.25, passes: 0.75, passPct: 0.75, xa: 0.5, xg: 0.25, aerialPct: 0.25, rating: 1 },
  fb: { tacklesWon: 0.75, xa: 1, dribbles: 0.5, passPct: 0.5, passes: 0.25, crossPct: 0.25, rating: 1.5 },
  cb: { tacklesWon: 1, aerialsWon: 0.5, aerialPct: 0.75, passPct: 0.75, passes: 0.5, xg: 0.25, rating: 1.5 },
  gk: { savePct: 2, conceded: 0.75, passPct: 0.5, rating: 1.5 },
}

export interface MoneyballWeights {
  gain: number
  surplus: number
  perf: number
  contract: number
}

/**
 * Poids par défaut : le gain d'équipe compte entier ; le surplus et le contrat à moitié (la valeur FM baisse déjà
 * quand le contrat se termine, et un très bon rapport note / prix ne sert à rien s'il ne renforce pas l'équipe).
 */
export const DEFAULT_WEIGHTS: MoneyballWeights = { gain: 1, surplus: 0.5, perf: 1, contract: 0.5 }

/** Tous les réglages du Moneyball. */
export interface MoneyballParams {
  /** Poids des quatre critères dans le score. */
  weights: MoneyballWeights
  minGain: number
  depthShare: number
  outputMinMinutes: number
  outputPriorMinutes: number
  outputPointsPerSd: number
  outputCap: number
  outputWeights: OutputWeights
  fee: FeeParams
  /** Bornes hautes des tranches d'âge du marché, croissantes. */
  ageBands: number[]
  /** Joueurs minimum d'une tranche (ligne × âge) pour lui apprendre sa propre courbe de marché. */
  marketMinGroup: number
  /** Joueurs comptés dans le niveau d'un club, et minimum pour qu'il soit connu. */
  clubTop: number
  clubMinPlayers: number
  /** Mode réaliste. */
  reachClubMargin: number
  reachLevelMargin: number
  reachFeeTop: number
  reachWageFactor: number
}

export const DEFAULT_MONEYBALL_PARAMS: MoneyballParams = {
  weights: DEFAULT_WEIGHTS,
  minGain: MIN_GAIN,
  depthShare: DEPTH_SHARE,
  outputMinMinutes: OUTPUT_MIN_MINUTES,
  outputPriorMinutes: OUTPUT_PRIOR_MINUTES,
  outputPointsPerSd: OUTPUT_POINTS_PER_SD,
  outputCap: OUTPUT_CAP,
  outputWeights: OUTPUT_WEIGHTS,
  fee: DEFAULT_FEE,
  ageBands: AGE_BANDS,
  marketMinGroup: 100,
  clubTop: 16,
  clubMinPlayers: 11,
  reachClubMargin: 3,
  reachLevelMargin: 12,
  reachFeeTop: 11,
  reachWageFactor: 1.2,
}

/** Réglages enregistrés remis d'aplomb : valeur manquante ou invalide = valeur par défaut, bornes appliquées. */
export function normalizeMoneyballParams(raw: unknown): MoneyballParams {
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
  const r = obj(raw)
  const d = DEFAULT_MONEYBALL_PARAMS
  const num = (v: unknown, def: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def
  const int = (v: unknown, def: number, min: number, max: number) => Math.round(num(v, def, min, max))
  const w = obj(r.weights)
  const f = obj(r.fee)
  const ow = obj(r.outputWeights)
  const outputWeights = Object.fromEntries(OUTPUT_GROUPS.map((g) => {
    const stored = ow[g]
    if (!stored || typeof stored !== 'object') return [g, d.outputWeights[g]]
    const s = obj(stored)
    const entries = OUTPUT_STATS.flatMap((stat) => {
      const v = num(s[stat], 0, 0, 10)
      return v > 0 ? [[stat, v] as const] : []
    })
    return [g, Object.fromEntries(entries)]
  })) as OutputWeights
  const bands = Array.isArray(r.ageBands)
    ? [...new Set(r.ageBands.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 14 && v <= 45).map(Math.round))].sort((a, b) => a - b)
    : d.ageBands
  return {
    weights: {
      gain: num(w.gain, d.weights.gain, 0, 5),
      surplus: num(w.surplus, d.weights.surplus, 0, 5),
      perf: num(w.perf, d.weights.perf, 0, 5),
      contract: num(w.contract, d.weights.contract, 0, 5),
    },
    minGain: num(r.minGain, d.minGain, 0, 30),
    depthShare: num(r.depthShare, d.depthShare, 0, 1),
    outputMinMinutes: int(r.outputMinMinutes, d.outputMinMinutes, 0, 5000),
    outputPriorMinutes: int(r.outputPriorMinutes, d.outputPriorMinutes, 0, 10000),
    outputPointsPerSd: num(r.outputPointsPerSd, d.outputPointsPerSd, 0, 20),
    outputCap: num(r.outputCap, d.outputCap, 0, 50),
    outputWeights,
    fee: {
      expired: num(f.expired, d.fee.expired, 0, 1),
      shortDays: int(f.shortDays, d.fee.shortDays, 0, 3650),
      short: num(f.short, d.fee.short, 0, 1),
      yearDays: int(f.yearDays, d.fee.yearDays, 0, 3650),
      year: num(f.year, d.fee.year, 0, 1),
    },
    ageBands: bands,
    marketMinGroup: int(r.marketMinGroup, d.marketMinGroup, 10, 100000),
    clubTop: int(r.clubTop, d.clubTop, 1, 60),
    clubMinPlayers: int(r.clubMinPlayers, d.clubMinPlayers, 1, 60),
    reachClubMargin: num(r.reachClubMargin, d.reachClubMargin, -50, 100),
    reachLevelMargin: num(r.reachLevelMargin, d.reachLevelMargin, -50, 100),
    reachFeeTop: int(r.reachFeeTop, d.reachFeeTop, 1, 60),
    reachWageFactor: num(r.reachWageFactor, d.reachWageFactor, 0, 20),
  }
}

/** Partie des réglages utilisée pour apprendre le modèle (les autres ne demandent pas de le recalculer). */
export function modelParamsKey(p: MoneyballParams): string {
  return JSON.stringify([p.outputMinMinutes, p.outputWeights, p.ageBands, p.marketMinGroup, p.clubTop, p.clubMinPlayers])
}

// --- modèles appris sur la base ------------------------------------------------------------------------

export interface MarketModel {
  /** Note habituelle par ligne et tranche d'âge, selon le log10 du coût. */
  byGroup: Map<string, Curve>
  /** Repli par ligne (tous âges) quand une tranche a trop peu de joueurs. */
  byLine: Map<Line, Curve>
  /** Tranches d'âge utilisées pour apprendre `byGroup`. */
  ageBands: readonly number[]
}

/**
 * Rendement : un indice de production par ligne (moyenne pondérée des écarts réduits de ses stats), comparé à celui
 * attendu d'après la note du joueur et le niveau de son club (la ligue n'est pas connue : un club fort joue en général
 * dans une ligue forte, contre de meilleurs adversaires).
 */
export interface OutputModel {
  /** Moyenne et écart-type de chaque stat, par ligne (joueurs ayant assez joué). */
  norms: Map<OutputGroup, Map<OutputStat, { mean: number; sd: number }>>
  /** Indice attendu = a + b × note + c × niveau du club ; sd = écart-type des écarts à l'attendu, level = niveau moyen. */
  fits: Map<OutputGroup, OutputFit>
  /** Poids des stats utilisés pour apprendre le modèle. */
  weights: OutputWeights
}

export interface OutputFit {
  a: number
  b: number
  c: number
  sd: number
  level: number
}

export interface MoneyballModel {
  market: MarketModel
  output: OutputModel
  /** Meilleure note de chaque joueur (par `index`). */
  scores: Float32Array
  /** Niveau de chaque club (par index de club), NaN si trop peu de joueurs : voir `clubLevels`. */
  clubLevels: Float32Array
}

/**
 * Niveau de chaque club : moyenne des meilleures notes de ses `top` meilleurs joueurs (prêtés compris, au club
 * qui les accueille), NaN sous `minPlayers` joueurs. Sert de réputation : la sauvegarde ne la donne pas.
 */
export function clubLevels(db: ScoutDb, scores: Float32Array, top = DEFAULT_MONEYBALL_PARAMS.clubTop, minPlayers = DEFAULT_MONEYBALL_PARAMS.clubMinPlayers): Float32Array {
  const byClub: number[][] = db.clubs.map(() => [])
  for (const p of db.players) if (p.club >= 0) byClub[p.club]?.push(scores[p.index])
  return Float32Array.from(byClub, (list) => {
    if (list.length < minPlayers) return NaN
    const best = list.sort((a, b) => b - a).slice(0, top)
    return best.reduce((s, x) => s + x, 0) / best.length
  })
}

/** Plafonds du mode réaliste ; null = pas de plafond. */
export interface Reach {
  /** Niveau de club maximal d'où un joueur accepterait de venir. */
  clubLevel: number | null
  /** Note maximale d'un joueur qui accepterait de venir. */
  level: number | null
  /** Indemnité estimée maximale, en euros. */
  fee: number | null
  /** Salaire hebdomadaire maximal, en euros. */
  wage: number | null
}

/** Marge au-dessus du niveau du club : un joueur d'un club un peu plus fort peut venir, pas d'un club bien plus fort. */
export const REACH_CLUB_MARGIN = DEFAULT_MONEYBALL_PARAMS.reachClubMargin
/** Note maximale d'une recrue, au-dessus du niveau du club. */
export const REACH_LEVEL_MARGIN = DEFAULT_MONEYBALL_PARAMS.reachLevelMargin
/** Salaire maximal : plus gros salaire de l'effectif × ce facteur. */
export const REACH_WAGE_FACTOR = DEFAULT_MONEYBALL_PARAMS.reachWageFactor

/**
 * Plafonds du mode réaliste, d'après le niveau du club dans la base et les valeurs et salaires de l'effectif :
 * indemnité ≤ moyenne des valeurs des `reachFeeTop` joueurs les plus chers, salaire ≤ plus gros salaire × `reachWageFactor`.
 */
export function reachOf(levels: Float32Array, ownClub: number, squad: Pick<Player, 'value' | 'wage'>[], params: MoneyballParams = DEFAULT_MONEYBALL_PARAMS): Reach {
  const own = ownClub >= 0 ? levels[ownClub] : NaN
  const values = squad.map((p) => p.value ?? 0).filter((v) => v > 0).sort((a, b) => b - a).slice(0, params.reachFeeTop)
  const wages = squad.map((p) => p.wage ?? 0).filter((v) => v > 0)
  return {
    clubLevel: Number.isNaN(own) ? null : own + params.reachClubMargin,
    level: Number.isNaN(own) ? null : own + params.reachLevelMargin,
    fee: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null,
    wage: wages.length ? Math.max(...wages) * params.reachWageFactor : null,
  }
}

/** Le joueur entre-t-il dans les plafonds ? Montant ou niveau de club inconnu : accepté. */
export function withinReach(reach: Reach, row: Pick<MoneyballRow, 'player' | 'fee'>, model: MoneyballModel): boolean {
  const p = row.player
  if (reach.level !== null && model.scores[p.index] > reach.level) return false
  const club = p.club >= 0 ? model.clubLevels[p.club] : NaN
  if (reach.clubLevel !== null && !Number.isNaN(club) && club > reach.clubLevel) return false
  if (reach.fee !== null && row.fee !== null && row.fee > reach.fee) return false
  if (reach.wage !== null && p.wage !== null && p.wage > reach.wage) return false
  return true
}

const groupKey = (line: Line, band: number) => `${line}:${band}`
const logCost = (cost: number) => Math.log10(Math.max(cost, 1e4))

/** Apprend sur toute la base ce que coûte une note (marché) et ce qu'une note donne en match. */
export function buildModel(db: ScoutDb, roles: RoleDefinition[], today: GameDate, params: MoneyballParams = DEFAULT_MONEYBALL_PARAMS): MoneyballModel {
  const { scores } = bestScores(db, roles)
  const groups = new Map<string, { x: number; y: number }[]>()
  const lines = new Map<Line, { x: number; y: number }[]>()
  const levels = clubLevels(db, scores, params.clubTop, params.clubMinPlayers)
  const played: OutputSample[] = []
  for (const p of db.players) {
    const score = scores[p.index]
    const pos = primaryPosition(p)
    if (score <= 0 || !pos) continue
    if ((p.stats?.minutes ?? 0) >= params.outputMinMinutes) played.push({ p, group: OUTPUT_GROUP_OF[pos], score, level: p.club >= 0 ? levels[p.club] : NaN })
    // marché : joueurs d'un club connu avec une valeur connue
    const value = knownValue(p)
    if (p.club < 0 || value === null) continue
    // coût = valeur de transfert seule : le salaire est inconnu pour près de la moitié de la base
    const point = { x: logCost(value), y: score }
    const line = LINE_OF[pos]
    const key = groupKey(line, ageBand(ageAt(p.birth, today), params.ageBands))
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(point)
    if (!lines.has(line)) lines.set(line, [])
    lines.get(line)!.push(point)
  }
  const fit = (pts: { x: number; y: number }[]) => fitCurve(pts, Math.max(40, Math.ceil(pts.length / 25)))
  const byGroup = new Map<string, Curve>()
  for (const [key, pts] of groups) if (pts.length >= params.marketMinGroup) byGroup.set(key, fit(pts))
  const byLine = new Map<Line, Curve>()
  for (const [line, pts] of lines) byLine.set(line, fit(pts))

  return { market: { byGroup, byLine, ageBands: params.ageBands }, output: buildOutput(played, params.outputWeights), scores, clubLevels: levels }
}

// --- rendement ------------------------------------------------------------------------------------------

export const OUTPUT_GROUP_OF: Record<Position, OutputGroup> = {
  GK: 'gk',
  DC: 'cb', DL: 'fb', DR: 'fb', WBL: 'fb', WBR: 'fb',
  DM: 'dm', ML: 'mid', MC: 'mid', MR: 'mid',
  AML: 'att', AMC: 'att', AMR: 'att', ST: 'att',
}

/**
 * Valeur d'une stat de la saison : par 90 minutes, sauf le pourcentage de passes réussies et la note moyenne.
 * null si elle n'est pas connue (pas de stats, aucune passe : certaines ligues n'ont que buts et notes).
 */
export function statValue(p: Pick<ScoutPlayer, 'stats' | 'avgRating'>, stat: OutputStat): number | null {
  const s = p.stats
  if (stat === 'rating') return p.avgRating
  if (!s?.minutes) return null
  const per90 = (n: number) => (n * 90) / s.minutes
  switch (stat) {
    case 'goals': return per90(s.goals)
    case 'passPct': return s.passes >= 20 ? (s.passesDone / s.passes) * 100 : null
    // stats étendues (base FMS6), mêmes règles que la fiche Scouting
    case 'aerialsWon': return seasonStat(p, 'aerialsWon90')
    case 'aerialPct': return seasonStat(p, 'aerialWinPct')
    case 'crossPct': return seasonStat(p, 'crossPct')
    case 'savePct': return seasonStat(p, 'savePct')
    case 'conceded': return seasonStat(p, 'conceded90')
    default:
      // stats détaillées absentes (ligue sans suivi) : ni passes ni tirs
      if (!s.passes && !s.shots) return null
      return per90({ xg: s.xg, xa: s.xa, shotsOnTarget: s.shotsOnTarget, dribbles: s.dribbles, tacklesWon: s.tacklesWon, passes: s.passes }[stat])
  }
}

interface OutputSample {
  p: ScoutPlayer
  group: OutputGroup
  score: number
  /** Niveau du club (NaN si inconnu). */
  level: number
}

/** Indice de production d'un joueur : moyenne pondérée des écarts réduits de ses stats ; null sans stat connue. */
export function outputIndex(
  norms: Map<OutputStat, { mean: number; sd: number }> | undefined, p: Pick<ScoutPlayer, 'stats' | 'avgRating'>, group: OutputGroup,
  weights: OutputWeights = OUTPUT_WEIGHTS,
): number | null {
  if (!norms) return null
  let sum = 0
  let weight = 0
  for (const [stat, w] of Object.entries(weights[group]) as [OutputStat, number][]) {
    const v = statValue(p, stat)
    const n = norms.get(stat)
    if (v === null || !n || !n.sd || !w) continue
    const sign = OUTPUT_LOWER_BETTER.includes(stat) ? -1 : 1
    sum += (sign * w * (v - n.mean)) / n.sd
    weight += w
  }
  return weight ? sum / weight : null
}

/** Moyennes et écarts-types des stats par groupe, puis régression de l'indice sur la note et le niveau du club. */
export function buildOutput(samples: OutputSample[], weights: OutputWeights = OUTPUT_WEIGHTS): OutputModel {
  const norms = new Map<OutputGroup, Map<OutputStat, { mean: number; sd: number }>>()
  const fits = new Map<OutputGroup, OutputFit>()
  for (const group of OUTPUT_GROUPS) {
    const list = samples.filter((s) => s.group === group)
    const stats = new Map<OutputStat, { mean: number; sd: number }>()
    for (const stat of Object.keys(weights[group]) as OutputStat[]) {
      const vs = list.map((s) => statValue(s.p, stat)).filter((v): v is number => v !== null)
      if (vs.length < 50) continue
      const mean = vs.reduce((a, v) => a + v, 0) / vs.length
      const sd = Math.sqrt(vs.reduce((a, v) => a + (v - mean) ** 2, 0) / vs.length)
      stats.set(stat, { mean, sd })
    }
    norms.set(group, stats)
    const known = list.filter((s) => !Number.isNaN(s.level))
    const level = known.length ? known.reduce((a, s) => a + s.level, 0) / known.length : 0
    const points = list
      .map((s) => ({ x1: s.score, x2: Number.isNaN(s.level) ? level : s.level, y: outputIndex(stats, s.p, group, weights) }))
      .filter((q): q is { x1: number; x2: number; y: number } => q.y !== null)
    if (points.length < 100) continue
    const fit = regress2(points)
    if (!fit) continue
    const sd = Math.sqrt(points.reduce((s, q) => s + (q.y - fit.a - fit.b * q.x1 - fit.c * q.x2) ** 2, 0) / points.length)
    if (sd > 0) fits.set(group, { ...fit, sd, level })
  }
  return { norms, fits, weights }
}

/** Moindres carrés y = a + b × x1 + c × x2 ; null si les variables sont colinéaires. */
export function regress2(points: { x1: number; x2: number; y: number }[]): { a: number; b: number; c: number } | null {
  const n = points.length
  const m1 = points.reduce((s, q) => s + q.x1, 0) / n
  const m2 = points.reduce((s, q) => s + q.x2, 0) / n
  const my = points.reduce((s, q) => s + q.y, 0) / n
  let s11 = 0, s22 = 0, s12 = 0, s1y = 0, s2y = 0
  for (const q of points) {
    const d1 = q.x1 - m1, d2 = q.x2 - m2, dy = q.y - my
    s11 += d1 * d1; s22 += d2 * d2; s12 += d1 * d2; s1y += d1 * dy; s2y += d2 * dy
  }
  const det = s11 * s22 - s12 * s12
  if (Math.abs(det) < 1e-9) return null
  const b = (s1y * s22 - s2y * s12) / det
  const c = (s2y * s11 - s1y * s12) / det
  return { a: my - b * m1 - c * m2, b, c }
}

/**
 * Écart de rendement en points de note : indice de production au-dessus (ou en dessous) de celui attendu pour sa note
 * et le niveau de son club, en écarts-types (× outputPointsPerSd), réduit s'il a peu joué.
 * La production suit peu les attributs : diviser par la pente donnerait des écarts démesurés.
 * null si pas assez de minutes ou de stats.
 */
export function outputPoints(
  model: OutputModel, p: Pick<ScoutPlayer, 'stats' | 'avgRating'>, group: OutputGroup, score: number, level: number,
  params: MoneyballParams = DEFAULT_MONEYBALL_PARAMS,
): number | null {
  const minutes = p.stats?.minutes ?? 0
  const fit = model.fits.get(group)
  if (minutes < params.outputMinMinutes || !fit) return null
  const index = outputIndex(model.norms.get(group), p, group, model.weights)
  if (index === null) return null
  const expected = fit.a + fit.b * score + fit.c * (Number.isNaN(level) ? fit.level : level)
  const gap = ((index - expected) / fit.sd) * params.outputPointsPerSd * (minutes / (minutes + params.outputPriorMinutes))
  return Math.max(-params.outputCap, Math.min(params.outputCap, gap))
}

/** Note habituelle d'un joueur de cette ligne et de cet âge pour ce coût ; null sans courbe. */
export function expectedScore(market: MarketModel, line: Line, age: number, cost: number): number | null {
  const curve = market.byGroup.get(groupKey(line, ageBand(age, market.ageBands))) ?? market.byLine.get(line)
  return curve?.length ? readCurve(curve, logCost(cost)) : null
}

// --- équipe ---------------------------------------------------------------------------------------------

export interface TeamSlot {
  slotId: string
  ip: { role: RoleDefinition; position: Position }
  oop: { role: RoleDefinition; position: Position }
  /** Note globale du titulaire du meilleur XI (0 = poste vide). */
  starter: number
  starterName: string | null
  /** Note globale du meilleur remplaçant (0 = aucun). */
  backup: number
}

/** Postes de la tactique avec le titulaire et le remplaçant du meilleur XI (placements ignorés). */
export function teamSlots(slots: TacticSlot[], players: Player[], roles: RoleDefinition[]): TeamSlot[] {
  const free = clearEleven(slots)
  const ip = computeLineup(free, players, roles, [], 'ip')
  const oop = computeLineup(free, players, roles, [], 'oop')
  return ip.slots.map((s, i) => ({
    slotId: s.tacticSlot.slotId,
    ip: { role: s.role, position: s.slot.position },
    oop: { role: oop.slots[i].role, position: oop.slots[i].slot.position },
    starter: s.starter?.overall ?? 0,
    starterName: s.starter?.player.name ?? null,
    backup: s.backups[0]?.overall ?? 0,
  }))
}

/** Gain d'équipe d'un joueur noté `rating` sur un poste : nouveau titulaire, et en partie (`depthShare`) nouvelle doublure. */
export function slotGain(rating: number, slot: Pick<TeamSlot, 'starter' | 'backup'>, depthShare = DEPTH_SHARE): number {
  const starter = Math.max(rating, slot.starter)
  const backup = Math.max(Math.min(rating, slot.starter), slot.backup)
  return starter - slot.starter + depthShare * (backup - slot.backup)
}

/**
 * Index du club de l'effectif dans la base : club (propriétaire pour un prêté) le plus fréquent parmi les joueurs
 * de l'effectif retrouvés par nom et nationalité ; -1 si moins de 3 sont retrouvés.
 */
export function squadClubIndex(db: ScoutDb, squad: Player[]): number {
  const wanted = new Set(squad.map((p) => `${normalizeText(p.name)}|${p.nationality}`))
  const counts = new Map<number, number>()
  for (const p of db.players) {
    if (!wanted.has(`${normalizeText(p.name)}|${p.nationality}`)) continue
    const club = p.owner >= 0 ? p.owner : p.club
    if (club >= 0) counts.set(club, (counts.get(club) ?? 0) + 1)
  }
  let best = -1
  let n = 2
  for (const [club, c] of counts) if (c > n) { best = club; n = c }
  return best
}

// --- recherche ------------------------------------------------------------------------------------------

export type MoneyballSort =
  | 'score' | 'gain' | 'surplus' | 'perf' | 'contract' | 'slotRating' | 'fee' | 'wage' | 'age' | 'name'
  | 'rating' | 'value' | 'contractEnd' | 'avgRating' | 'minutes' | 'goals' | 'assists' | 'xg' | 'xa' | 'clubLevel'

/** Filtres qui décident quels joueurs sont évalués (le tri et les poids sont appliqués ensuite, sans tout recalculer). */
export interface MoneyballFilters {
  search: string
  /** Poste de la tactique visé, null = le meilleur poste du joueur. */
  slotId: string | null
  minAge: number | null
  maxAge: number | null
  /** Indemnité estimée maximale (après réduction de contrat), en euros. */
  maxFee: number | null
  /** Salaire hebdomadaire maximal, en euros (un salaire inconnu passe : il l'est pour près de la moitié de la base). */
  maxWage: number | null
  hideLoaned: boolean
  /** Seulement les joueurs qui améliorent l'équipe d'au moins `params.minGain`. */
  onlyGain: boolean
  /** Club de l'effectif dans la base (ses joueurs sont écartés), -1 = aucun. */
  ownClub: number
  /** Mode réaliste : seulement les joueurs qui viendraient et que le club peut payer ; null = tous. */
  reach?: Reach | null
  only?: ReadonlySet<string> | null
}

export interface MoneyballRank {
  weights: MoneyballWeights
  sort: MoneyballSort
  desc?: boolean | null
  limit: number
}

export interface MoneyballRow {
  player: ScoutPlayer
  age: number
  /** Poste de la tactique où il apporte le plus (ou le poste visé). */
  slot: TeamSlot | null
  /** Note globale sur ce poste (moyenne avec et sans ballon). */
  slotRating: number
  /** Meilleure note du joueur (tous rôles avec ballon). */
  rating: number
  /** Niveau de son club, null s'il n'est pas connu. */
  clubLevel: number | null
  gain: number
  /** Null si sa valeur est inconnue. */
  surplus: number | null
  /** Écart de rendement (stats de la saison) ; null s'il a trop peu joué ou si ses stats ne sont pas suivies. */
  perf: number | null
  contract: number
  /** Indemnité estimée (valeur × réduction de contrat), null si la valeur est inconnue. */
  fee: number | null
  /** Somme pondérée des critères (calculée au classement, d'après les poids). */
  score: number
}

/** Sens d'un premier clic : meilleures valeurs d'abord ; nom, âge, montants et fin de contrat croissants. */
export function moneyballDescending(sort: MoneyballSort): boolean {
  return !(sort === 'name' || sort === 'age' || sort === 'fee' || sort === 'wage' || sort === 'value' || sort === 'contractEnd')
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Score d'une ligne : somme des critères multipliés par leur poids. */
export function weightedScore(r: Pick<MoneyballRow, 'gain' | 'surplus' | 'perf' | 'contract'>, w: MoneyballWeights): number {
  return round1(w.gain * r.gain + w.surplus * (r.surplus ?? 0) + w.perf * (r.perf ?? 0) + w.contract * r.contract)
}

/** Note un joueur pour l'équipe et le marché (score calculé avec `params.weights`). */
export function evaluate(
  p: ScoutPlayer, age: number, model: MoneyballModel, slots: TeamSlot[], scorers: Map<string, (p: ScoutPlayer) => number>,
  today: GameDate, params: MoneyballParams = DEFAULT_MONEYBALL_PARAMS,
): MoneyballRow {
  const rate = (r: RoleDefinition, pos: Position) => scorers.get(`${r.id}@${pos}`)!(p)
  let best: { slot: TeamSlot | null; rating: number; gain: number } = { slot: null, rating: 0, gain: -1 }
  for (const s of slots) {
    const rating = (rate(s.ip.role, s.ip.position) + rate(s.oop.role, s.oop.position)) / 2
    const gain = slotGain(rating, s, params.depthShare)
    if (gain > best.gain || (gain === best.gain && rating > best.rating)) best = { slot: s, rating, gain }
  }
  const score = model.scores[p.index]
  const club = p.club >= 0 ? model.clubLevels[p.club] : NaN
  const pos = primaryPosition(p)
  const value = knownValue(p)
  const fee = value === null ? null : value * feeFactor(p, today, params.fee)
  let surplus: number | null = null
  let contract = 0
  let perf: number | null = null
  if (pos && score > 0) {
    const line = LINE_OF[pos]
    perf = outputPoints(model.output, p, OUTPUT_GROUP_OF[pos], score, club, params)
    const full = value === null ? null : expectedScore(model.market, line, age, value)
    if (full !== null) {
      surplus = score - full
      // contrat : note qu'on peut s'offrir en plus grâce à l'indemnité réduite
      contract = Math.max(0, full - expectedScore(model.market, line, age, fee!)!)
    }
  }
  const row = {
    player: p, age, slot: best.slot, slotRating: round1(best.rating), rating: score, clubLevel: Number.isNaN(club) ? null : round1(club),
    gain: round1(Math.max(0, best.gain)), surplus: surplus === null ? null : round1(surplus), perf: perf === null ? null : round1(perf),
    contract: round1(contract), fee, score: 0,
  }
  row.score = weightedScore(row, params.weights)
  return row
}

/** Notes rapides de tous les couples rôle / poste de la tactique. */
export function slotScorers(slots: TeamSlot[]): Map<string, (p: ScoutPlayer) => number> {
  const scorers = new Map<string, (p: ScoutPlayer) => number>()
  for (const s of slots) {
    for (const { role, position } of [s.ip, s.oop]) {
      const key = `${role.id}@${position}`
      if (!scorers.has(key)) scorers.set(key, scoutScorer(role, position))
    }
  }
  return scorers
}

/**
 * Joueurs de la base qui passent les filtres, évalués (la partie lente : toute la base est notée sur chaque poste).
 * Le classement (`rankMoneyball`) se fait ensuite : changer de tri ou de poids ne refait pas ce calcul.
 */
export function evaluateMoneyball(
  db: ScoutDb, model: MoneyballModel, team: TeamSlot[], f: MoneyballFilters, today: GameDate, params: MoneyballParams = DEFAULT_MONEYBALL_PARAMS,
): MoneyballRow[] {
  const slots = f.slotId ? team.filter((s) => s.slotId === f.slotId) : team
  if (!slots.length) return []
  const scorers = slotScorers(slots)
  const q = normalizeText(f.search)
  const found: MoneyballRow[] = []
  for (const p of db.players) {
    if (f.hideLoaned && p.owner >= 0) continue
    if (f.ownClub >= 0 && (p.owner >= 0 ? p.owner : p.club) === f.ownClub) continue
    if (f.only && !f.only.has(scoutKey(p))) continue
    if (f.maxWage !== null && p.wage !== null && p.wage > f.maxWage) continue
    if (model.scores[p.index] <= 0) continue
    const age = ageAt(p.birth, today)
    if (f.minAge !== null && age < f.minAge) continue
    if (f.maxAge !== null && age > f.maxAge) continue
    if (q && !normalizeText(p.name).includes(q)) continue
    const row = evaluate(p, age, model, slots, scorers, today, params)
    if (f.maxFee !== null && (row.fee === null || row.fee > f.maxFee)) continue
    if (f.onlyGain && row.gain < params.minGain) continue
    if (f.reach && !withinReach(f.reach, row, model)) continue
    found.push(row)
  }
  return found
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

/** Valeur triée de chaque colonne ; null = inconnue (toujours en dernier). */
const SORT_KEY: Record<MoneyballSort, (r: MoneyballRow) => number | string | null> = {
  score: (r) => r.score,
  gain: (r) => r.gain,
  surplus: (r) => r.surplus,
  perf: (r) => r.perf,
  contract: (r) => r.contract,
  slotRating: (r) => r.slotRating,
  fee: (r) => r.fee,
  wage: (r) => r.player.wage,
  age: (r) => r.age,
  name: (r) => r.player.name,
  rating: (r) => r.rating,
  value: (r) => knownValue(r.player),
  contractEnd: (r) => (r.player.contractEnd ? r.player.contractEnd.year * 1000 + r.player.contractEnd.day : null),
  avgRating: (r) => r.player.avgRating,
  minutes: (r) => r.player.stats?.minutes ?? null,
  goals: (r) => r.player.stats?.goals ?? null,
  assists: (r) => r.player.stats?.assists ?? null,
  xg: (r) => statValue(r.player, 'xg'),
  xa: (r) => statValue(r.player, 'xa'),
  clubLevel: (r) => r.clubLevel,
}

/**
 * Classement des joueurs évalués : score recalculé avec les poids, tri par colonne (valeurs inconnues en dernier,
 * puis score et ordre de la base à égalité), au plus `limit` lignes.
 */
export function rankMoneyball(rows: MoneyballRow[], rank: MoneyballRank): { rows: MoneyballRow[]; total: number } {
  const scored = rows.map((r) => ({ ...r, score: weightedScore(r, rank.weights) }))
  const k = SORT_KEY[rank.sort]
  const dir = (rank.desc ?? moneyballDescending(rank.sort)) ? -1 : 1
  // clés calculées une fois (le tri en compare des centaines de milliers de paires)
  const keyed = scored.map((r) => ({ r, k: k(r) }))
  keyed.sort((a, b) => {
    const x = a.k
    const y = b.k
    if (x === null || y === null) {
      if (x !== y) return x === null ? 1 : -1
    } else if (x !== y) {
      return (typeof x === 'string' ? collator.compare(x, String(y)) : x - Number(y)) * dir
    }
    return b.r.score - a.r.score || a.r.player.index - b.r.player.index
  })
  return { rows: keyed.slice(0, rank.limit).map((e) => e.r), total: keyed.length }
}

/** Joueurs de la base qui passent les filtres, classés par critère moneyball, au plus `limit`. */
export function searchMoneyball(
  db: ScoutDb, model: MoneyballModel, team: TeamSlot[], f: MoneyballFilters & MoneyballRank, today: GameDate,
  params: MoneyballParams = DEFAULT_MONEYBALL_PARAMS,
): { rows: MoneyballRow[]; total: number } {
  return rankMoneyball(evaluateMoneyball(db, model, team, f, today, params), f)
}
