import { layoutOf, phaseSlots, resolveRole } from './lineup'
import { normalizeText } from './photoMatch'
import type { Position } from './positions'
import { rateRole, type RoleRating } from './rating'
import { ageAt, type GameDate } from './fmSave'
import { rateScout, scoutScorer, type ScoutDb, type ScoutPlayer } from './scouting'
import type { Player, RoleDefinition, Tactic } from './types'

/**
 * Remplaçants d'un joueur : joueurs dont la note sur une cible égale ou dépasse la sienne.
 * La cible est un poste d'une tactique (moyenne des notes avec et sans ballon, comme le meilleur XI)
 * ou un rôle seul. Les notes sont comparées arrondies à l'unité, comme elles sont affichées.
 */

/** Un rôle noté, à un poste donné (sinon au meilleur poste du rôle). */
export interface TargetPart {
  role: RoleDefinition
  position?: Position
}

/** Poste d'une tactique : rôle et poste avec ballon, puis sans ballon. */
export interface TacticTarget {
  tacticId: number
  slotId: string
  ip: Required<TargetPart>
  oop: Required<TargetPart>
  /** Joueur placé sur ce poste (null = vide). */
  playerId: number | null
}

export interface TargetRating {
  /** Note de la cible : moyenne des parties, arrondie au dixième. */
  score: number
  /** Note de chaque partie (avec ballon, sans ballon). */
  parts: RoleRating[]
}

export interface SquadReplacement extends TargetRating {
  player: Player
}

export interface ScoutReplacement extends TargetRating {
  player: ScoutPlayer
  age: number
}

const round1 = (n: number) => Math.round(n * 10) / 10
const mean = (xs: number[]) => round1(xs.reduce((s, x) => s + x, 0) / xs.length)
const shown = (score: number) => Math.round(score)

/** Postes d'une tactique avec leurs rôles résolus dans chaque phase. */
export function tacticTargets(tactic: Tactic, roles: RoleDefinition[]): TacticTarget[] {
  const ip = phaseSlots(tactic.slots, 'ip')
  const oop = phaseSlots(tactic.slots, 'oop')
  const ipLayout = layoutOf(ip)
  const oopLayout = layoutOf(oop)
  return tactic.slots.map((s, i) => ({
    tacticId: tactic.id,
    slotId: s.slotId,
    ip: { role: resolveRole(ip[i].roleId, roles, ipLayout[i].position, 'ip'), position: ipLayout[i].position },
    oop: { role: resolveRole(oop[i].roleId, roles, oopLayout[i].position, 'oop'), position: oopLayout[i].position },
    playerId: s.lockedPlayerId,
  }))
}

/** Parties notées d'un poste de tactique. */
export const targetParts = (t: TacticTarget): TargetPart[] => [t.ip, t.oop]

/** Note d'un joueur de l'effectif sur une cible. */
export function rateTarget(player: Player, parts: readonly TargetPart[]): TargetRating {
  const rated = parts.map((p) => rateRole(player, p.role, p.position))
  return { score: mean(rated.map((r) => r.score)), parts: rated }
}

/**
 * Poste proposé d'abord : celui où le joueur est placé dans une tactique, sinon le poste
 * (toutes tactiques confondues) où sa note est la meilleure. Null sans tactique.
 */
export function defaultTarget(player: Player, targets: readonly TacticTarget[]): TacticTarget | null {
  const placed = targets.find((t) => t.playerId === player.id)
  if (placed) return placed
  let best: { t: TacticTarget; score: number } | null = null
  for (const t of targets) {
    const score = rateTarget(player, targetParts(t)).score
    if (!best || score > best.score) best = { t, score }
  }
  return best?.t ?? null
}

/** Identité d'un joueur de l'effectif dans la base de scouting (même clé que `squadClubIndex`). */
const identity = (p: { name: string; nationality: string }) => `${normalizeText(p.name)}|${p.nationality}`

/** Coéquipiers (hors prêtés) qui font aussi bien ou mieux sur la cible, du meilleur au moins bon. */
export function squadReplacements(player: Player, squad: readonly Player[], parts: readonly TargetPart[]): SquadReplacement[] {
  const target = shown(rateTarget(player, parts).score)
  return squad
    .filter((p) => p.id !== player.id && !p.onLoan)
    .map((p) => ({ player: p, ...rateTarget(p, parts) }))
    .filter((r) => r.parts.every((x) => x.rated) && shown(r.score) >= target)
    .sort((a, b) => b.score - a.score || a.player.age - b.player.age)
}

export interface ScoutReplacementOptions {
  /** Âge maximal (inclus), null = pas de limite. */
  maxAge: number | null
  /** Masque les joueurs prêtés par leur club. */
  hideLoaned: boolean
  limit: number
}

/**
 * Joueurs de la base de scouting qui font aussi bien ou mieux que `player` sur la cible, sans les joueurs
 * de l'effectif (déjà listés à part). `total` compte tous ceux qui passent.
 */
export function scoutReplacements(
  player: Player, squad: readonly Player[], db: ScoutDb, parts: readonly TargetPart[], today: GameDate, opts: ScoutReplacementOptions,
): { rows: ScoutReplacement[]; total: number } {
  const target = shown(rateTarget(player, parts).score)
  const inSquad = new Set([player, ...squad].map(identity))
  const scorers = parts.map((p) => scoutScorer(p.role, p.position))
  const found: { player: ScoutPlayer; age: number; score: number }[] = []
  for (const p of db.players) {
    if (opts.hideLoaned && p.owner >= 0) continue
    const s = mean(scorers.map((score) => score(p)))
    if (shown(s) < target) continue
    const age = ageAt(p.birth, today)
    if (opts.maxAge !== null && age > opts.maxAge) continue
    if (inSquad.has(identity(p))) continue
    found.push({ player: p, age, score: s })
  }
  found.sort((a, b) => b.score - a.score || a.age - b.age)
  return {
    rows: found.slice(0, opts.limit).map((r) => ({
      player: r.player, age: r.age, score: r.score, parts: parts.map((x) => rateScout(r.player, x.role, x.position)),
    })),
    total: found.length,
  }
}
