import { DEFAULT_ROLE_BY_POSITION, DEFAULT_ROLES } from './defaultRoles'
import {
  CUSTOM_FORMATION_ID, getFormation, makeSlot, matchPreset, type Formation, type FormationSlot,
} from './formations'
import { hungarianMax } from './hungarian'
import { formationName, isFieldCell, positionAt } from './pitch'
import type { Position } from './positions'
import { rateRole, type RoleRating } from './rating'
import type { Player, RoleDefinition, TacticSlot } from './types'

export const BACKUPS_PER_SLOT = 2

export interface RatedPlayer {
  player: Player
  rating: RoleRating
}

export interface LineupSlot {
  slot: FormationSlot
  tacticSlot: TacticSlot
  role: RoleDefinition
  starter: RatedPlayer | null
  locked: boolean
  backups: RatedPlayer[]
}

export interface Lineup {
  slots: LineupSlot[]
  totalScore: number
  /** Joueurs disponibles hors XI. */
  bench: Player[]
}

/** Partie modifiable d'une tactique par glisser-déposer. */
export interface Assignment {
  slots: TacticSlot[]
  excludedPlayerIds: number[]
}

/** Slots de tactique par défaut pour une formation (rôle par défaut, aucun verrou). */
export function defaultTacticSlots(formation: Formation): TacticSlot[] {
  return formation.slots.map((s) => ({
    slotId: s.id, row: s.row, col: s.col, roleId: s.defaultRole, duty: 'auto', lockedPlayerId: null,
  }))
}

/**
 * Complète les slots d'une tactique enregistrée avant l'arrivée de la grille
 * (sans row/col) à partir de sa formation prédéfinie.
 */
export function normalizeTacticSlots(slots: Partial<TacticSlot>[], formationId: string): TacticSlot[] {
  if (slots.length > 0 && slots.every((s) => s.row !== undefined && s.col !== undefined)) return slots as TacticSlot[]
  const preset = getFormation(formationId)
  return preset.slots.map((p) => {
    const s = slots.find((x) => x.slotId === p.id)
    return {
      slotId: p.id,
      row: s?.row ?? p.row,
      col: s?.col ?? p.col,
      roleId: s?.roleId ?? p.defaultRole,
      duty: s?.duty ?? 'auto',
      lockedPlayerId: s?.lockedPlayerId ?? null,
    }
  })
}

/** Disposition sur le terrain issue des cases des slots de la tactique. */
export function layoutOf(slots: TacticSlot[]): FormationSlot[] {
  return slots.map((s) => {
    const position = positionAt(s.row, s.col) ?? 'MC'
    return makeSlot(s.slotId, s.row, s.col, DEFAULT_ROLE_BY_POSITION[position])
  })
}

/** Disposition : formation prédéfinie si elle correspond, et forme déduite des lignes (ex. « 4-1-1-3-1 »). */
export function layoutName(slots: TacticSlot[]): { presetId: string; shape: string } {
  const preset = matchPreset(slots)
  return { presetId: preset?.id ?? CUSTOM_FORMATION_ID, shape: formationName(slots) }
}

/**
 * Déplace une carte de poste vers une case. Si la case est occupée, les deux cartes
 * échangent leur place. Un rôle qui n'existe pas au nouveau poste est remplacé par
 * le rôle par défaut de ce poste (et le devoir remis à « auto »).
 */
export function moveSlot(slots: TacticSlot[], slotId: string, row: number, col: number, roles: RoleDefinition[]): TacticSlot[] {
  const moving = slots.find((s) => s.slotId === slotId)
  if (!moving || !isFieldCell(row, col) || !isFieldCell(moving.row, moving.col)) return slots
  if (moving.row === row && moving.col === col) return slots
  const occupant = slots.find((s) => s.row === row && s.col === col)

  const relocate = (s: TacticSlot, r: number, c: number): TacticSlot => {
    const position = positionAt(r, c)!
    const role = resolveRole(s.roleId, roles, position)
    const keepRole = role.id === s.roleId && role.positions.includes(position)
    return keepRole
      ? { ...s, row: r, col: c }
      : { ...s, row: r, col: c, roleId: DEFAULT_ROLE_BY_POSITION[position], duty: 'auto' }
  }

  return slots.map((s) => {
    if (s.slotId === slotId) return relocate(s, row, col)
    if (occupant && s.slotId === occupant.slotId) return relocate(s, moving.row, moving.col)
    return s
  })
}

/**
 * Rôle d'un poste. Si l'identifiant n'existe plus (ancienne tactique, rôle supprimé),
 * prend le profil par défaut du poste, puis le premier rôle disponible à ce poste.
 */
export function resolveRole(roleId: string, roles: RoleDefinition[], position: Position): RoleDefinition {
  const byId = (id: string) => roles.find((r) => r.id === id) ?? DEFAULT_ROLES.find((r) => r.id === id)
  return (
    byId(roleId) ??
    byId(DEFAULT_ROLE_BY_POSITION[position]) ??
    roles.find((r) => r.positions.includes(position)) ??
    DEFAULT_ROLES[0]
  )
}

export function isAvailable(p: Player): boolean {
  return p.status !== 'unavailable'
}

/**
 * Calcule le meilleur XI : les joueurs verrouillés sont placés d'abord,
 * puis les postes restants sont pourvus par affectation optimale (algorithme hongrois)
 * en maximisant la somme des notes de rôle.
 */
export function computeLineup(
  tacticSlots: TacticSlot[],
  players: Player[],
  roles: RoleDefinition[],
  excludedPlayerIds: number[] = [],
): Lineup {
  const available = players.filter(isAvailable)
  const byId = new Map(available.map((p) => [p.id, p]))
  const excluded = new Set(excludedPlayerIds)

  const layout = layoutOf(tacticSlots)
  const entries = tacticSlots.map((tacticSlot, i) => ({
    slot: layout[i],
    tacticSlot,
    role: resolveRole(tacticSlot.roleId, roles, layout[i].position),
  }))

  const used = new Set<number>()
  const starters = new Map<string, RatedPlayer>()
  const lockedSlots = new Set<string>()

  for (const e of entries) {
    const id = e.tacticSlot.lockedPlayerId
    const p = id !== null ? byId.get(id) : undefined
    if (p && !used.has(p.id)) {
      used.add(p.id)
      lockedSlots.add(e.slot.id)
      starters.set(e.slot.id, { player: p, rating: rateRole(p, e.role, e.slot.position) })
    }
  }

  const freeSlots = entries.filter((e) => !lockedSlots.has(e.slot.id))
  const pool = available.filter((p) => !used.has(p.id) && !excluded.has(p.id))

  if (freeSlots.length > 0 && pool.length > 0) {
    const ratings = freeSlots.map((e) => pool.map((p) => rateRole(p, e.role, e.slot.position)))
    // Colonnes fictives (score 0) si moins de joueurs que de postes : poste laissé vide.
    const padding = Math.max(0, freeSlots.length - pool.length)
    const matrix = ratings.map((row) => [...row.map((r) => r.score), ...new Array<number>(padding).fill(0)])
    const assignment = hungarianMax(matrix)
    assignment.forEach((col, row) => {
      if (col < pool.length) {
        const p = pool[col]
        used.add(p.id)
        starters.set(freeSlots[row].slot.id, { player: p, rating: ratings[row][col] })
      }
    })
  }

  const bench = available.filter((p) => !used.has(p.id) && !excluded.has(p.id))

  const slots: LineupSlot[] = entries.map((e) => ({
    ...e,
    starter: starters.get(e.slot.id) ?? null,
    locked: lockedSlots.has(e.slot.id),
    backups: bench
      .map((p) => ({ player: p, rating: rateRole(p, e.role, e.slot.position) }))
      .sort((a, b) => b.rating.score - a.rating.score)
      .slice(0, BACKUPS_PER_SLOT),
  }))

  const totalScore = slots.reduce((sum, s) => sum + (s.starter?.rating.score ?? 0), 0)
  return { slots, totalScore: Math.round(totalScore * 10) / 10, bench }
}

/**
 * Place un joueur sur un poste (verrouillé). S'il venait d'un autre poste du XI,
 * le titulaire du poste visé prend sa place (échange).
 */
export function placePlayer(lineup: Lineup, excludedPlayerIds: number[], playerId: number, targetSlotId: string): Assignment {
  const source = lineup.slots.find((s) => s.starter?.player.id === playerId)?.slot.id
  const target = lineup.slots.find((s) => s.slot.id === targetSlotId)
  const displaced = target?.starter && target.starter.player.id !== playerId ? target.starter.player.id : null

  const slots = lineup.slots.map(({ tacticSlot: s }) => {
    if (s.slotId === targetSlotId) return { ...s, lockedPlayerId: playerId }
    if (source && s.slotId === source) return { ...s, lockedPlayerId: displaced }
    if (s.lockedPlayerId === playerId) return { ...s, lockedPlayerId: null }
    return s
  })
  return { slots, excludedPlayerIds: excludedPlayerIds.filter((id) => id !== playerId) }
}

/** Retire un joueur du XI : il ne sera plus choisi automatiquement pour cette tactique. */
export function benchPlayer(lineup: Lineup, excludedPlayerIds: number[], playerId: number): Assignment {
  return {
    slots: lineup.slots.map(({ tacticSlot: s }) => (s.lockedPlayerId === playerId ? { ...s, lockedPlayerId: null } : s)),
    excludedPlayerIds: excludedPlayerIds.includes(playerId) ? excludedPlayerIds : [...excludedPlayerIds, playerId],
  }
}

export type PitchLine = 'defence' | 'midfield' | 'attack'

const LINE_OF: Record<Position, PitchLine> = {
  GK: 'defence', DL: 'defence', DC: 'defence', DR: 'defence', WBL: 'defence', WBR: 'defence',
  DM: 'midfield', ML: 'midfield', MC: 'midfield', MR: 'midfield',
  AML: 'attack', AMC: 'attack', AMR: 'attack', ST: 'attack',
}

/** Ligne (défense, milieu, attaque) d'un poste ; le gardien compte en défense. */
export function lineOf(position: Position): PitchLine {
  return LINE_OF[position]
}

/** En dessous de « Confirmé » (17), un titulaire est considéré hors de son poste. */
export const OUT_OF_POSITION_BELOW = 17

export function isOutOfPosition(player: Player, position: Position): boolean {
  return (player.positions[position] ?? 0) < OUT_OF_POSITION_BELOW
}

export interface LineupSummary {
  /** Note moyenne du XI (postes vides comptés 0). */
  average: number
  /** Âge moyen des titulaires (null si aucun). */
  averageAge: number | null
  /** Note moyenne des titulaires de chaque ligne (null si aucun titulaire notable). */
  lines: Record<PitchLine, number | null>
  outOfPosition: number
  emptySlots: number
}

export function summarizeLineup(lineup: Lineup): LineupSummary {
  const starters = lineup.slots.flatMap((s) => (s.starter ? [{ ...s.starter, position: s.slot.position }] : []))
  const avg = (ns: number[]) => (ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10 : null)
  const lineAvg = (line: PitchLine) =>
    avg(starters.filter((s) => LINE_OF[s.position] === line && s.rating.rated).map((s) => s.rating.score))
  return {
    average: lineup.slots.length ? Math.round((lineup.totalScore / lineup.slots.length) * 10) / 10 : 0,
    averageAge: avg(starters.map((s) => s.player.age)),
    lines: { defence: lineAvg('defence'), midfield: lineAvg('midfield'), attack: lineAvg('attack') },
    outOfPosition: starters.filter((s) => isOutOfPosition(s.player, s.position)).length,
    emptySlots: lineup.slots.length - starters.length,
  }
}
