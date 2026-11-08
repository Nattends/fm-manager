// Stats de la saison d'un joueur de la base de scouting : totaux, valeurs par 90 minutes, pourcentages.
import type { ScoutPlayer, SeasonStats } from './scouting'

export const SEASON_STATS = [
  'apps', 'minutes', 'goals', 'assists', 'pom',
  'goals90', 'xg90', 'xgDiff', 'shots90', 'shotsOnTarget90', 'shotAccuracy', 'conversion', 'xgPerShot',
  'assists90', 'xa90', 'passes90', 'passPct', 'dribbles90', 'crosses90', 'crossPct',
  'tacklesWon90', 'tackleWinPct', 'aerialsWon90', 'aerialWinPct', 'fouls90', 'fouled90', 'offsides90',
  'saves90', 'savePct', 'conceded90',
] as const
export type SeasonStat = (typeof SEASON_STATS)[number]

/** total = nombre sur la saison, per90 = pour 90 minutes, pct = pourcentage, ratio = par tir, diff = écart signé. */
export type StatKind = 'total' | 'per90' | 'pct' | 'ratio' | 'diff'

/** Tirs, passes ou tacles minimum pour qu'un pourcentage ait du sens. */
export const MIN_SHOTS = 10
export const MIN_PASSES = 20
export const MIN_TACKLES = 10
export const MIN_AERIALS = 10
export const MIN_CROSSES = 10
/** Tirs cadrés subis (arrêts + buts encaissés). */
export const MIN_SHOTS_FACED = 10

interface StatDef {
  kind: StatKind
  /** Stat détaillée : absente des ligues sans suivi (ni passes ni tirs enregistrés). */
  detailed?: boolean
  /** Stat étendue : absente des bases lues avant la v0.25 (format FMS5). */
  extended?: boolean
  /** Stat de gardien : null quand le joueur n'a ni arrêt ni but encaissé. */
  keeper?: boolean
  /** Moins = mieux (fautes, hors-jeu, buts encaissés) : le percentile est inversé. */
  lowerBetter?: boolean
  value: (s: SeasonStats) => number | null
}

const per90 = (s: SeasonStats, n: number) => (n * 90) / s.minutes
const pct = (n: number, d: number, min: number) => (d >= min ? (n / d) * 100 : null)

export const STAT_DEFS: Record<SeasonStat, StatDef> = {
  apps: { kind: 'total', value: (s) => s.starts + s.subs },
  minutes: { kind: 'total', value: (s) => s.minutes },
  goals: { kind: 'total', value: (s) => s.goals },
  assists: { kind: 'total', value: (s) => s.assists },
  pom: { kind: 'total', value: (s) => s.pom },
  goals90: { kind: 'per90', value: (s) => per90(s, s.goals) },
  xg90: { kind: 'per90', detailed: true, value: (s) => per90(s, s.xg) },
  xgDiff: { kind: 'diff', detailed: true, value: (s) => s.goals - s.xg },
  shots90: { kind: 'per90', detailed: true, value: (s) => per90(s, s.shots) },
  shotsOnTarget90: { kind: 'per90', detailed: true, value: (s) => per90(s, s.shotsOnTarget) },
  shotAccuracy: { kind: 'pct', detailed: true, value: (s) => pct(s.shotsOnTarget, s.shots, MIN_SHOTS) },
  conversion: { kind: 'pct', detailed: true, value: (s) => pct(s.goals, s.shots, MIN_SHOTS) },
  xgPerShot: { kind: 'ratio', detailed: true, value: (s) => (s.shots >= MIN_SHOTS ? s.xg / s.shots : null) },
  assists90: { kind: 'per90', value: (s) => per90(s, s.assists) },
  xa90: { kind: 'per90', detailed: true, value: (s) => per90(s, s.xa) },
  passes90: { kind: 'per90', detailed: true, value: (s) => per90(s, s.passes) },
  passPct: { kind: 'pct', detailed: true, value: (s) => pct(s.passesDone, s.passes, MIN_PASSES) },
  dribbles90: { kind: 'per90', detailed: true, value: (s) => per90(s, s.dribbles) },
  tacklesWon90: { kind: 'per90', detailed: true, value: (s) => per90(s, s.tacklesWon) },
  tackleWinPct: { kind: 'pct', detailed: true, value: (s) => pct(s.tacklesWon, s.tackles, MIN_TACKLES) },
  crosses90: { kind: 'per90', detailed: true, extended: true, value: (s) => per90(s, s.crosses) },
  crossPct: { kind: 'pct', detailed: true, extended: true, value: (s) => pct(s.crossesDone, s.crosses, MIN_CROSSES) },
  aerialsWon90: { kind: 'per90', detailed: true, extended: true, value: (s) => per90(s, s.aerialsWon) },
  aerialWinPct: { kind: 'pct', detailed: true, extended: true, value: (s) => pct(s.aerialsWon, s.aerials, MIN_AERIALS) },
  fouls90: { kind: 'per90', detailed: true, extended: true, lowerBetter: true, value: (s) => per90(s, s.fouls) },
  fouled90: { kind: 'per90', detailed: true, extended: true, value: (s) => per90(s, s.fouled) },
  offsides90: { kind: 'per90', detailed: true, extended: true, lowerBetter: true, value: (s) => per90(s, s.offsides) },
  saves90: { kind: 'per90', detailed: true, extended: true, keeper: true, value: (s) => per90(s, s.saves) },
  savePct: { kind: 'pct', detailed: true, extended: true, keeper: true, value: (s) => pct(s.saves, s.saves + s.conceded, MIN_SHOTS_FACED) },
  conceded90: { kind: 'per90', detailed: true, extended: true, keeper: true, lowerBetter: true, value: (s) => per90(s, s.conceded) },
}

export function isSeasonStat(v: string): v is SeasonStat {
  return v in STAT_DEFS
}

/** Valeur d'une stat, null si elle est inconnue (aucune minute, ligue sans stats détaillées, trop peu de tirs…). */
export function seasonStat(p: Pick<ScoutPlayer, 'stats'>, stat: SeasonStat): number | null {
  const s = p.stats
  if (!s?.minutes) return null
  const def = STAT_DEFS[stat]
  if (def.detailed && !s.passes && !s.shots) return null
  if (def.extended && !s.extended) return null
  if (def.keeper && !s.saves && !s.conceded) return null
  return def.value(s)
}

/** Valeur affichée : entier pour un total, 2 décimales par 90 minutes et par tir, pourcentage arrondi, écart signé. */
export function formatStat(stat: SeasonStat, v: number | null, locale?: string): string {
  if (v === null) return '–'
  const n = (digits: number) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  switch (STAT_DEFS[stat].kind) {
    case 'total': return n(0)
    case 'pct': return `${n(0)}%`
    case 'diff': return `${v > 0 ? '+' : ''}${n(1)}`
    default: return n(2)
  }
}

/** Stats comparées entre joueurs (percentiles) : celles qui ne dépendent pas du temps de jeu. */
export const RATE_STATS = SEASON_STATS.filter((s) => STAT_DEFS[s].kind !== 'total' && STAT_DEFS[s].kind !== 'diff')
