import { describe, expect, it } from 'vitest'
import { clubPlayers, clubReport, searchClubs } from './clubCompare'
import { SAVE_VALUES } from './fmSave'
import { rateRole } from './rating'
import type { ScoutDb, ScoutPlayer } from './scouting'
import type { RoleDefinition, TacticSlot } from './types'

const ST = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 20, 1, 1]
const DC = [1, 1, 1, 20, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
const finisher: RoleDefinition = { id: 'r', name: 'Finisseur', positions: ['ST'], weights: { finishing: 5 } }
const stopper: RoleDefinition = { id: 's', name: 'Stoppeur', positions: ['DC'], weights: { marking: 5 } }
const roles = [finisher, stopper]
const today = { day: 200, year: 2026 }

let next = 0
function scout(club: number, level: number, positions: number[], opts: { owner?: number; value?: number; wage?: number } = {}): ScoutPlayer {
  const index = next++
  return {
    index, name: `J${index}`, birth: { day: 100, year: 2000 }, nationality: 'fr',
    positions: Uint8Array.from(positions),
    values: Uint8Array.from(SAVE_VALUES, (k) => (k === 'finishing' || k === 'marking' ? level : 50)),
    club, owner: opts.owner ?? -1, contractEnd: null, wage: opts.wage ?? null, value: opts.value ?? null,
    avgRating: null, ratedMatches: 0, stats: null,
  }
}

const db: ScoutDb = {
  refreshedAt: new Date(0), savePath: '', gameDate: today,
  clubs: [{ name: 'Real Sociedad', nation: 'es' }, { name: 'Athletic Club', nation: 'es' }, { name: 'Real Madrid', nation: 'es' }],
  players: [
    scout(0, 80, ST, { value: 10_000_000, wage: 50_000 }), scout(0, 60, ST), scout(0, 70, DC, { value: 5_000_000 }),
    scout(1, 90, ST, { owner: 2 }), scout(1, 50, DC, { wage: 20_000 }),
    scout(2, 85, ST, { value: 1 }),
  ],
}
const slots: TacticSlot[] = [
  { slotId: 'dc', row: 4, col: 2, roleId: 's', oop: { row: 4, col: 2, roleId: 's' }, lockedPlayerId: null },
  { slotId: 'st', row: 0, col: 2, roleId: 'r', oop: { row: 0, col: 2, roleId: 'r' }, lockedPlayerId: null },
]
const best = (p: Parameters<typeof rateRole>[0]) => Math.max(...roles.map((r) => rateRole(p, r).score))

describe('comparaison de clubs', () => {
  it('joueurs du club, prêtés chez lui compris et disponibles', () => {
    expect(clubPlayers(db, 1, today).map((p) => p.name)).toEqual(['J3', 'J4'])
    expect(clubPlayers(db, 1, today).every((p) => !p.onLoan)).toBe(true)
  })

  it('meilleur XI dans la tactique, doublures, valeur et salaire', () => {
    const r = clubReport(db, 0, slots, roles, today, best)
    expect(r.lineup.slots.map((s) => s.starter?.player.name)).toEqual(['J2', 'J0'])
    expect(r.lineup.slots[1].backups[0]?.player.name).toBe('J1')
    // le défenseur n'a pas de doublure : compté 0 dans la profondeur
    expect(r.depth).toBe(Math.round((r.lineup.slots[1].backups[0]!.overall / 2) * 10) / 10)
    expect(r.value).toEqual({ total: 15_000_000, known: 2 })
    expect(r.topWage).toBe(50_000)
    expect(r.level).toBeNull()
  })

  it('le club avec le meilleur XI a la meilleure moyenne', () => {
    const a = clubReport(db, 0, slots, roles, today, best)
    const b = clubReport(db, 1, slots, roles, today, best)
    expect(b.lineup.slots[1].starter!.overall).toBeGreaterThan(a.lineup.slots[1].starter!.overall)
    expect(a.lineup.slots[0].starter!.overall).toBeGreaterThan(b.lineup.slots[0].starter!.overall)
  })

  it('recherche de clubs sans accents, dans l’ordre donné', () => {
    expect(searchClubs(db, 'real', [2, 0, 1], 10)).toEqual([2, 0])
    expect(searchClubs(db, 'athlétic', [0, 1, 2], 10)).toEqual([1])
    expect(searchClubs(db, '', [1, 0, 2], 2)).toEqual([1, 0])
  })
})
