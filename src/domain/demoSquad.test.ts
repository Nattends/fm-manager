import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLES } from './defaultRoles'
import { demoSquad, isDemoPlayer } from './demoSquad'
import { getFormation } from './formations'
import { computeLineup, defaultTacticSlots } from './lineup'
import { POSITIONS } from './positions'

describe('demoSquad', () => {
  const squad = demoSquad().map((p, i) => ({ ...p, id: i + 1, clubId: 1, photo: null, photoLookup: null }))

  it('couvre tous les postes et tous les statuts', () => {
    expect(squad).toHaveLength(28)
    for (const pos of POSITIONS) expect(squad.some((p) => (p.positions[pos] ?? 0) >= 17)).toBe(true)
    expect(new Set(squad.map((p) => p.status))).toEqual(new Set(['key', 'rotation', 'prospect', 'for_sale', 'unavailable']))
    expect(squad.every(isDemoPlayer)).toBe(true)
  })

  it('remplit un XI complet sans le joueur indisponible ni les prêtés', () => {
    const lineup = computeLineup(defaultTacticSlots(getFormation('4-2-3-1')), squad, DEFAULT_ROLES)
    expect(lineup.slots.every((s) => s.starter)).toBe(true)
    expect(lineup.slots.some((s) => s.starter!.player.status === 'unavailable')).toBe(false)
    expect(lineup.slots.some((s) => s.starter!.player.onLoan || s.backups.some((b) => b.player.onLoan))).toBe(false)
    expect(lineup.bench.some((p) => p.onLoan)).toBe(false)
  })
})
