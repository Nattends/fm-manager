import { describe, expect, it } from 'vitest'
import { SAVE_VALUES } from './fmSave'
import {
  defaultTarget, rateTarget, scoutReplacements, squadReplacements, tacticTargets, targetParts, type ScoutReplacementOptions,
} from './replacements'
import { scoutAsPlayer, type ScoutDb, type ScoutPlayer } from './scouting'
import type { Player, RoleDefinition, Tactic } from './types'

const ST = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 20, 1, 1]
const DC = [1, 1, 1, 20, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
const finisher: RoleDefinition = { id: 'r', name: 'Finisseur', positions: ['ST'], weights: { finishing: 5 } }
const presser: RoleDefinition = { id: 'p', name: 'Presseur', positions: ['ST'], phase: 'oop', weights: { workRate: 5 } }
const stopper: RoleDefinition = { id: 's', name: 'Stoppeur', positions: ['DC'], weights: { marking: 5 } }
const roles = [finisher, presser, stopper]
const today = { day: 200, year: 2026 }

function scout(index: number, name: string, finishing: number, opts: { positions?: number[]; birthYear?: number; club?: number; owner?: number; workRate?: number } = {}): ScoutPlayer {
  return {
    index, name, birth: { day: 100, year: opts.birthYear ?? 2000 }, nationality: 'fr',
    positions: Uint8Array.from(opts.positions ?? ST),
    values: Uint8Array.from(SAVE_VALUES, (k) => (k === 'finishing' ? finishing : k === 'workRate' ? (opts.workRate ?? 50) : 50)),
    club: opts.club ?? 0, owner: opts.owner ?? -1, contractEnd: null, wage: null, value: null, avgRating: null, ratedMatches: 0, stats: null,
  }
}

const db: ScoutDb = {
  refreshedAt: new Date(0), savePath: '', gameDate: today,
  clubs: [{ name: 'Mon Club', nation: 'fr' }, { name: 'Autre', nation: 'es' }],
  players: [
    scout(0, 'Titulaire', 80),
    scout(1, 'Coéquipier fort', 90),
    scout(2, 'Coéquipier faible', 40),
    scout(3, 'Recrue forte', 95, { club: 1, birthYear: 1990 }),
    scout(4, 'Recrue égale', 80, { club: 1, birthYear: 2005 }),
    scout(5, 'Recrue faible', 60, { club: 1 }),
    scout(6, 'Défenseur', 95, { club: 1, positions: DC }),
    scout(7, 'Prêté', 99, { club: 1, owner: 0 }),
    scout(8, 'Buteur paresseux', 85, { club: 1, workRate: 10 }),
  ],
}
const asPlayer = (i: number, id: number, extra: Partial<Player> = {}): Player => ({ ...scoutAsPlayer(db.players[i], db, today), id, ...extra })
const me = asPlayer(0, 1)
const squad = [me, asPlayer(1, 2), asPlayer(2, 3), asPlayer(3, 4, { onLoan: true, name: 'Prêté ailleurs' })]
const opts: ScoutReplacementOptions = { maxAge: null, hideLoaned: false, limit: 50 }
const onlyFinisher = [{ role: finisher }]

const tactic: Tactic = {
  id: 7, clubId: 1, name: 'T', formation: '', excludedPlayerIds: [], notes: '',
  slots: [
    { slotId: 'dc', row: 4, col: 2, roleId: 's', oop: { row: 4, col: 2, roleId: 's' }, lockedPlayerId: null },
    { slotId: 'st', row: 0, col: 2, roleId: 'r', oop: { row: 0, col: 2, roleId: 'p' }, lockedPlayerId: null },
  ],
}

describe('remplaçants sur un rôle', () => {
  it('dans l’effectif : aussi bien ou mieux, sans le joueur ni les prêtés', () => {
    expect(squadReplacements(me, squad, onlyFinisher).map((r) => r.player.name)).toEqual(['Coéquipier fort'])
  })

  it('dans la base : aussi bien ou mieux, sans l’effectif, du meilleur au moins bon', () => {
    const { rows, total } = scoutReplacements(me, squad, db, onlyFinisher, today, opts)
    // le défenseur hors poste est pénalisé (×0,5) et ne suit pas
    expect(rows.map((r) => r.player.name)).toEqual(['Prêté', 'Recrue forte', 'Buteur paresseux', 'Recrue égale'])
    expect(total).toBe(4)
    expect(rows[1].age).toBe(36)
  })

  it('filtres de la base : âge, prêtés, limite', () => {
    const names = (o: Partial<typeof opts>) => scoutReplacements(me, squad, db, onlyFinisher, today, { ...opts, ...o }).rows.map((r) => r.player.name)
    expect(names({ maxAge: 30 })).toEqual(['Prêté', 'Buteur paresseux', 'Recrue égale'])
    expect(names({ hideLoaned: true })).toEqual(['Recrue forte', 'Buteur paresseux', 'Recrue égale'])
    expect(scoutReplacements(me, squad, db, onlyFinisher, today, { ...opts, limit: 1 })).toMatchObject({ total: 4, rows: [{ player: { name: 'Prêté' } }] })
  })
})

describe('remplaçants sur un poste de la tactique', () => {
  const targets = tacticTargets(tactic, roles)

  it('résout les rôles et postes de chaque phase', () => {
    expect(targets[1]).toMatchObject({ tacticId: 7, slotId: 'st', ip: { role: finisher, position: 'ST' }, oop: { role: presser, position: 'ST' } })
  })

  it('note = moyenne avec et sans ballon : le buteur qui ne presse pas ne suit plus', () => {
    const parts = targetParts(targets[1])
    const r = rateTarget(me, parts)
    expect(r.parts).toHaveLength(2)
    expect(r.score).toBe(Math.round(((r.parts[0].score + r.parts[1].score) / 2) * 10) / 10)
    expect(scoutReplacements(me, squad, db, parts, today, opts).rows.map((x) => x.player.name)).not.toContain('Buteur paresseux')
  })

  it('poste proposé : celui où le joueur est placé, sinon son meilleur', () => {
    expect(defaultTarget(me, targets)?.slotId).toBe('st')
    const placed = tacticTargets({ ...tactic, slots: tactic.slots.map((s) => (s.slotId === 'dc' ? { ...s, lockedPlayerId: me.id } : s)) }, roles)
    expect(defaultTarget(me, placed)?.slotId).toBe('dc')
    expect(defaultTarget(me, [])).toBeNull()
  })
})
