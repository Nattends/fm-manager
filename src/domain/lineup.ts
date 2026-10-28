import { DEFAULT_ROLE_BY_POSITION, DEFAULT_ROLES } from './defaultRoles'
import {
  CUSTOM_FORMATION_ID, getFormation, makeSlot, matchPreset, type Formation, type FormationSlot,
} from './formations'
import { hungarianMax } from './hungarian'
import { formationName, isFieldCell, laneCol, positionAt } from './pitch'
import type { Position } from './positions'
import { rateRole, type RoleRating } from './rating'
import type { Phase, Player, RoleDefinition, SlotShape, TacticSlot } from './types'

export const BACKUPS_PER_SLOT = 2

export interface RatedPlayer {
  player: Player
  /** Note dans la phase affichée. */
  rating: RoleRating
  /** Note globale : moyenne des notes avec et sans ballon (critère du meilleur XI). */
  overall: number
}

export interface LineupSlot {
  /** Disposition du poste dans la phase affichée (case, poste, coordonnées). */
  slot: FormationSlot
  /** Poste enregistré dans la tactique (les deux phases). */
  tacticSlot: TacticSlot
  /** Case, rôle et devoir dans la phase affichée. */
  shape: SlotShape
  role: RoleDefinition
  starter: RatedPlayer | null
  locked: boolean
  backups: RatedPlayer[]
}

export interface Lineup {
  slots: LineupSlot[]
  /** Somme des notes globales des titulaires. */
  totalScore: number
  /** Somme des notes des titulaires dans chaque phase. */
  phaseScores: Record<Phase, number>
  /** Joueurs disponibles hors XI. */
  bench: Player[]
}

function shapeOf(s: SlotShape): SlotShape {
  return { row: s.row, col: s.col, roleId: s.roleId, duty: s.duty }
}

/** Les postes vus dans une phase : row / col / rôle / devoir de cette phase. */
export function phaseSlots(slots: TacticSlot[], phase: Phase): TacticSlot[] {
  return phase === 'ip' ? slots : slots.map((s) => ({ ...s, ...shapeOf(s.oop) }))
}

/** Réécrit dans la tactique les postes modifiés dans la vue d'une phase (inverse de phaseSlots). */
export function mergePhase(slots: TacticSlot[], phase: Phase, view: TacticSlot[]): TacticSlot[] {
  return slots.map((s) => {
    const v = view.find((x) => x.slotId === s.slotId)
    if (!v) return s
    return phase === 'ip'
      ? { ...s, ...shapeOf(v), lockedPlayerId: v.lockedPlayerId }
      : { ...s, oop: shapeOf(v), lockedPlayerId: v.lockedPlayerId }
  })
}

/** Modifie la case, le rôle ou le devoir d'un poste dans une phase. */
export function patchShape(slots: TacticSlot[], phase: Phase, slotId: string, patch: Partial<SlotShape>): TacticSlot[] {
  return slots.map((s) => {
    if (s.slotId !== slotId) return s
    return phase === 'ip' ? { ...s, ...patch } : { ...s, oop: { ...s.oop, ...patch } }
  })
}

/** Sans ballon = avec ballon (même case, même rôle) pour tous les postes. */
export function copyInPossession(slots: TacticSlot[]): TacticSlot[] {
  return slots.map((s) => ({ ...s, oop: shapeOf(s) }))
}

/** Partie modifiable d'une tactique par glisser-déposer. */
export interface Assignment {
  slots: TacticSlot[]
  excludedPlayerIds: number[]
}

/** Slots de tactique par défaut pour une formation (rôle par défaut, aucun verrou). */
export function defaultTacticSlots(formation: Formation): TacticSlot[] {
  return formation.slots.map((s) => {
    const shape: SlotShape = { row: s.row, col: s.col, roleId: s.defaultRole, duty: 'auto' }
    return { slotId: s.id, ...shape, oop: { ...shape }, lockedPlayerId: null }
  })
}

/**
 * Complète les slots d'une tactique enregistrée avant l'arrivée de la grille
 * (sans row/col) à partir de sa formation prédéfinie.
 */
export function normalizeTacticSlots(slots: Partial<TacticSlot>[], formationId: string): TacticSlot[] {
  const withCells = slots.length > 0 && slots.every((s) => s.row !== undefined && s.col !== undefined)
  const base: Partial<TacticSlot>[] = withCells ? slots : getFormation(formationId).slots.map((p) => {
    const s = slots.find((x) => x.slotId === p.id)
    return { ...s, slotId: p.id, row: s?.row ?? p.row, col: s?.col ?? p.col, roleId: s?.roleId ?? p.defaultRole }
  })
  // Tactiques enregistrées avant les phases de jeu : sans ballon = avec ballon.
  return base.map((s) => {
    const shape: SlotShape = { row: s.row!, col: s.col!, roleId: s.roleId!, duty: s.duty ?? 'auto' }
    return { slotId: s.slotId!, ...shape, oop: s.oop ? shapeOf(s.oop) : { ...shape }, lockedPlayerId: s.lockedPlayerId ?? null }
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
  if (!moving || !isFieldCell(moving.row, moving.col) || !canPlace(slots, slotId, row, col)) return slots
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
 * Une carte peut aller sur une case de champ si aucune autre carte n'occupe une colonne
 * voisine sur la même ligne (les cartes se chevaucheraient). Une case occupée reste
 * possible : les deux cartes échangent leur place.
 */
export function canPlace(slots: TacticSlot[], slotId: string, row: number, col: number): boolean {
  if (!isFieldCell(row, col)) return false
  return !slots.some((s) => s.slotId !== slotId && s.row === row && Math.abs(s.col - col) === 1)
}

/**
 * Tactiques enregistrées avec l'ancienne grille à 5 couloirs (avant les demi-espaces) :
 * chaque couloir devient sa colonne dans la grille à 9 colonnes.
 */
export function widenLegacyGrid(slots: Partial<TacticSlot>[]): Partial<TacticSlot>[] {
  return slots.map((s) => ({
    ...s,
    ...(s.col !== undefined ? { col: laneCol(s.col) } : {}),
    ...(s.oop ? { oop: { ...s.oop, col: laneCol(s.oop.col) } } : {}),
  }))
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
  return p.status !== 'unavailable' && !p.onLoan
}

/**
 * Calcule le meilleur XI : les joueurs verrouillés sont placés d'abord,
 * puis les postes restants sont pourvus par affectation optimale (algorithme hongrois)
 * en maximisant la somme des notes globales (moyenne des notes avec et sans ballon).
 * `phase` choisit la disposition et la note affichées.
 */
export function computeLineup(
  tacticSlots: TacticSlot[],
  players: Player[],
  roles: RoleDefinition[],
  excludedPlayerIds: number[] = [],
  phase: Phase = 'ip',
): Lineup {
  const available = players.filter(isAvailable)
  const byId = new Map(available.map((p) => [p.id, p]))
  const excluded = new Set(excludedPlayerIds)

  const views = { ip: phaseSlots(tacticSlots, 'ip'), oop: phaseSlots(tacticSlots, 'oop') }
  const layouts = { ip: layoutOf(views.ip), oop: layoutOf(views.oop) }
  const entries = tacticSlots.map((tacticSlot, i) => {
    const at = (ph: Phase) => ({
      slot: layouts[ph][i],
      role: resolveRole(views[ph][i].roleId, roles, layouts[ph][i].position),
    })
    return { tacticSlot, shape: shapeOf(views[phase][i]), ip: at('ip'), oop: at('oop') }
  })
  type Entry = (typeof entries)[number]

  const rate = (p: Player, e: Entry) => {
    const ip = rateRole(p, e.ip.role, e.ip.slot.position)
    const oop = rateRole(p, e.oop.role, e.oop.slot.position)
    return { ip, oop, overall: Math.round(((ip.score + oop.score) / 2) * 10) / 10 }
  }
  type Rated = ReturnType<typeof rate> & { player: Player }

  const used = new Set<number>()
  const starters = new Map<string, Rated>()
  const lockedSlots = new Set<string>()

  for (const e of entries) {
    const id = e.tacticSlot.lockedPlayerId
    const p = id !== null ? byId.get(id) : undefined
    if (p && !used.has(p.id)) {
      used.add(p.id)
      lockedSlots.add(e.tacticSlot.slotId)
      starters.set(e.tacticSlot.slotId, { player: p, ...rate(p, e) })
    }
  }

  const freeSlots = entries.filter((e) => !lockedSlots.has(e.tacticSlot.slotId))
  const pool = available.filter((p) => !used.has(p.id) && !excluded.has(p.id))

  if (freeSlots.length > 0 && pool.length > 0) {
    const ratings = freeSlots.map((e) => pool.map((p) => rate(p, e)))
    // Colonnes fictives (score 0) si moins de joueurs que de postes : poste laissé vide.
    const padding = Math.max(0, freeSlots.length - pool.length)
    const matrix = ratings.map((row) => [...row.map((r) => r.overall), ...new Array<number>(padding).fill(0)])
    const assignment = hungarianMax(matrix)
    assignment.forEach((col, row) => {
      if (col < pool.length) {
        const p = pool[col]
        used.add(p.id)
        starters.set(freeSlots[row].tacticSlot.slotId, { player: p, ...ratings[row][col] })
      }
    })
  }

  const bench = available.filter((p) => !used.has(p.id) && !excluded.has(p.id))
  const shown = (r: Rated): RatedPlayer => ({ player: r.player, rating: r[phase], overall: r.overall })

  const slots: LineupSlot[] = entries.map((e) => {
    const starter = starters.get(e.tacticSlot.slotId)
    return {
      slot: e[phase].slot,
      tacticSlot: e.tacticSlot,
      shape: e.shape,
      role: e[phase].role,
      starter: starter ? shown(starter) : null,
      locked: lockedSlots.has(e.tacticSlot.slotId),
      backups: bench
        .map((p) => shown({ player: p, ...rate(p, e) }))
        .sort((a, b) => b.overall - a.overall)
        .slice(0, BACKUPS_PER_SLOT),
    }
  })

  const round = (n: number) => Math.round(n * 10) / 10
  const sum = (f: (r: Rated) => number) => round([...starters.values()].reduce((acc, r) => acc + f(r), 0))
  return {
    slots,
    totalScore: sum((r) => r.overall),
    phaseScores: { ip: sum((r) => r.ip.score), oop: sum((r) => r.oop.score) },
    bench,
  }
}

/**
 * Place un joueur sur un poste (verrouillé). S'il venait d'un autre poste du XI,
 * le titulaire du poste visé prend sa place (échange). S'il venait de l'effectif,
 * il remplace le titulaire, qui sort du XI (écarté) au lieu d'être replacé
 * automatiquement ailleurs, ce qui chamboulerait les autres postes.
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
  const excluded = excludedPlayerIds.filter((id) => id !== playerId)
  if (!source && displaced !== null && !excluded.includes(displaced)) excluded.push(displaced)
  return { slots, excludedPlayerIds: excluded }
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
  /** Note moyenne du XI (postes vides comptés 0), moyenne des deux phases. */
  average: number
  /** Note moyenne du XI avec et sans ballon. */
  phases: Record<Phase, number>
  /** Âge moyen des titulaires (null si aucun). */
  averageAge: number | null
  /** Note moyenne des titulaires de chaque ligne (null si aucun titulaire notable). */
  lines: Record<PitchLine, number | null>
  outOfPosition: number
  emptySlots: number
}

export function summarizeLineup(lineup: Lineup): LineupSummary {
  const starters = lineup.slots.flatMap((s) => (s.starter ? [{ ...s.starter, position: s.slot.position }] : []))
  const per = (total: number) => (lineup.slots.length ? Math.round((total / lineup.slots.length) * 10) / 10 : 0)
  const avg = (ns: number[]) => (ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10 : null)
  const lineAvg = (line: PitchLine) =>
    avg(starters.filter((s) => LINE_OF[s.position] === line && s.rating.rated).map((s) => s.rating.score))
  return {
    average: per(lineup.totalScore),
    phases: { ip: per(lineup.phaseScores.ip), oop: per(lineup.phaseScores.oop) },
    averageAge: avg(starters.map((s) => s.player.age)),
    lines: { defence: lineAvg('defence'), midfield: lineAvg('midfield'), attack: lineAvg('attack') },
    outOfPosition: starters.filter((s) => isOutOfPosition(s.player, s.position)).length,
    emptySlots: lineup.slots.length - starters.length,
  }
}
