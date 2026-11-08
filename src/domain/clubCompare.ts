import type { GameDate } from './fmSave'
import { clearEleven, computeLineup, summarizeLineup, type Lineup, type LineupSummary } from './lineup'
import { normalizeText } from './photoMatch'
import { scoutAsPlayer, type ScoutDb } from './scouting'
import type { Player, RoleDefinition, TacticSlot } from './types'

/**
 * Comparaison de deux clubs de la sauvegarde (par exemple avant un entretien d'embauche) : chaque effectif
 * est aligné dans la même tactique (meilleur XI automatique, comme l'onglet Tactique) et résumé.
 */

/** Joueurs retenus pour le niveau du club (comme `clubLevels` du Moneyball). */
export const CLUB_LEVEL_TOP = 16

export interface ClubReport {
  club: number
  /** Joueurs du club (ceux qu'il prête ailleurs n'y sont pas, ceux qu'il accueille en prêt y sont). */
  players: Player[]
  /** Meilleur XI dans la tactique, phase avec ballon (doublures comprises). */
  lineup: Lineup
  /** Même XI vu sans ballon (cases et rôles sans ballon). */
  oop: Lineup
  summary: LineupSummary
  /** Note globale moyenne des premières doublures de chaque poste (poste sans doublure compté 0). */
  depth: number
  /** Moyenne de la meilleure note des `CLUB_LEVEL_TOP` meilleurs joueurs (tous rôles), null si trop peu de joueurs. */
  level: number | null
  /** Âge moyen de l'effectif. */
  averageAge: number | null
  /** Somme des valeurs de transfert connues et nombre de joueurs dont la valeur est connue. */
  value: { total: number; known: number }
  /** Plus gros salaire hebdomadaire connu (euros), null si aucun. */
  topWage: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10
const mean = (ns: number[]) => (ns.length ? round1(ns.reduce((s, x) => s + x, 0) / ns.length) : null)

/** Joueurs actuellement au club, sous la forme de joueurs de l'application (prêtés chez lui = disponibles). */
export function clubPlayers(db: ScoutDb, club: number, today: GameDate): Player[] {
  return db.players.filter((p) => p.club === club).map((p) => ({ ...scoutAsPlayer(p, db, today), onLoan: false }))
}

/**
 * Bilan d'un club dans une tactique. `bestScore` donne la meilleure note d'un joueur (tous rôles),
 * pour le niveau du club ; à défaut, la note du XI seule est calculée.
 */
export function clubReport(
  db: ScoutDb, club: number, slots: TacticSlot[], roles: RoleDefinition[], today: GameDate, bestScore: (p: Player) => number,
): ClubReport {
  const players = clubPlayers(db, club, today)
  const free = clearEleven(slots)
  const lineup = computeLineup(free, players, roles, [], 'ip')
  const oop = computeLineup(free, players, roles, [], 'oop')
  const best = players.map(bestScore).sort((a, b) => b - a)
  const values = players.flatMap((p) => (p.value !== null ? [p.value] : []))
  const wages = players.flatMap((p) => (p.wage !== null && p.wage > 0 ? [p.wage] : []))
  return {
    club,
    players,
    lineup,
    oop,
    summary: summarizeLineup(lineup),
    depth: lineup.slots.length ? round1(lineup.slots.reduce((s, x) => s + (x.backups[0]?.overall ?? 0), 0) / lineup.slots.length) : 0,
    level: best.length >= CLUB_LEVEL_TOP / 2 ? mean(best.slice(0, CLUB_LEVEL_TOP)) : null,
    averageAge: mean(players.map((p) => p.age)),
    value: { total: values.reduce((s, v) => s + v, 0), known: values.length },
    topWage: wages.length ? Math.max(...wages) : null,
  }
}

/** Clubs dont le nom contient chaque mot recherché (sans accents), au plus `limit`, dans l'ordre de `order`. */
export function searchClubs(db: ScoutDb, query: string, order: readonly number[], limit: number): number[] {
  const words = normalizeText(query).split(' ').filter(Boolean)
  const out: number[] = []
  for (const i of order) {
    const name = normalizeText(db.clubs[i]?.name ?? '')
    if (words.every((w) => name.includes(w))) out.push(i)
    if (out.length >= limit) break
  }
  return out
}
