// Percentiles des stats de la saison : un joueur comparé aux joueurs de son groupe de postes ayant assez joué.
import { OUTPUT_GROUP_OF, primaryPosition, type OutputGroup } from './moneyball'
import type { ScoutDb, ScoutPlayer } from './scouting'
import { RATE_STATS, seasonStat, STAT_DEFS, type SeasonStat } from './seasonStats'

/** Minutes jouées pour entrer dans l'échantillon de comparaison. */
export const PERCENTILE_MIN_MINUTES = 900
/** En dessous de ce nombre de valeurs connues, pas de percentile. */
export const PERCENTILE_MIN_SAMPLE = 30

type Table = Map<OutputGroup, Map<SeasonStat, Float64Array>>
const cache = new WeakMap<ScoutDb, Table>()

export function statGroupOf(p: ScoutPlayer): OutputGroup | null {
  const pos = primaryPosition(p)
  return pos ? OUTPUT_GROUP_OF[pos] : null
}

/** Valeurs triées de chaque stat, par groupe de postes (calculées une fois par base). */
function tableOf(db: ScoutDb): Table {
  let table = cache.get(db)
  if (table) return table
  const lists = new Map<OutputGroup, Map<SeasonStat, number[]>>()
  for (const p of db.players) {
    if ((p.stats?.minutes ?? 0) < PERCENTILE_MIN_MINUTES) continue
    const group = statGroupOf(p)
    if (!group) continue
    if (!lists.has(group)) lists.set(group, new Map(RATE_STATS.map((s) => [s, []])))
    const byStat = lists.get(group)!
    for (const stat of RATE_STATS) {
      const v = seasonStat(p, stat)
      if (v !== null) byStat.get(stat)!.push(v)
    }
  }
  table = new Map([...lists].map(([g, byStat]) => [g, new Map([...byStat].map(([s, v]) => [s, Float64Array.from(v).sort()]))]))
  cache.set(db, table)
  return table
}

/** Nombre de joueurs de l'échantillon du groupe (pour la stat la plus renseignée). */
export function sampleSize(db: ScoutDb, group: OutputGroup): number {
  const byStat = tableOf(db).get(group)
  return byStat ? Math.max(0, ...[...byStat.values()].map((v) => v.length)) : 0
}

/** Part (0-100) des joueurs du groupe qui font moins bien (valeur plus basse, ou plus haute si lowerBetter) ; les égalités comptent pour moitié. null si inconnu. */
export function statPercentile(db: ScoutDb, p: ScoutPlayer, stat: SeasonStat, group = statGroupOf(p)): number | null {
  const v = seasonStat(p, stat)
  const sorted = group ? tableOf(db).get(group)?.get(stat) : undefined
  if (v === null || !sorted || sorted.length < PERCENTILE_MIN_SAMPLE) return null
  let below = 0
  let equal = 0
  for (const x of sorted) {
    if (x < v) below++
    else if (x === v) equal++
    else break
  }
  const pct = Math.round(((below + equal / 2) / sorted.length) * 100)
  return STAT_DEFS[stat].lowerBetter ? 100 - pct : pct
}
