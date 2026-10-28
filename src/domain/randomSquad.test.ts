import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLES } from './defaultRoles'
import { isDemoPlayer } from './demoSquad'
import { getFormation } from './formations'
import { computeLineup, defaultTacticSlots } from './lineup'
import { RANDOM_CLUBS, randomTeam } from './randomSquad'

const asPlayers = (seed: number) =>
  randomTeam(seed).players.map((p, i) => ({ ...p, id: i + 1, clubId: 1, photo: null, photoLookup: null }))

describe('randomTeam', () => {
  it('est reproductible pour une même graine et varie d\'une graine à l\'autre', () => {
    expect(randomTeam(42)).toEqual(randomTeam(42))
    expect(randomTeam(1).players.map((p) => p.name)).not.toEqual(randomTeam(2).players.map((p) => p.name))
  })

  it('génère un effectif complet de démo avec deux prêtés et des vrais joueurs', () => {
    for (const seed of [1, 7, 99, 2026]) {
      const team = randomTeam(seed)
      expect(team.players).toHaveLength(27)
      expect(team.players.every(isDemoPlayer)).toBe(true)
      expect(team.players.filter((p) => p.onLoan)).toHaveLength(2)
      expect(team.players.filter((p) => p.onLoan).every((p) => p.club && p.club !== team.clubName)).toBe(true)
      expect(new Set(team.players.map((p) => p.name)).size).toBe(27)
    }
    const realCount = [1, 2, 3, 4, 5].reduce((n, s) => n + randomTeam(s).players.filter((p) => !p.notes.includes('inventé')).length, 0)
    expect(realCount).toBeGreaterThan(10)
  })

  it('évite les clubs déjà utilisés', () => {
    const taken = RANDOM_CLUBS.slice(1)
    expect(randomTeam(5, taken).clubName).toBe(RANDOM_CLUBS[0])
  })

  it('remplit un XI sans blessé ni prêté', () => {
    const lineup = computeLineup(defaultTacticSlots(getFormation('4-3-3')), asPlayers(3), DEFAULT_ROLES)
    expect(lineup.slots.every((s) => s.starter)).toBe(true)
    expect(lineup.slots.some((s) => s.starter!.player.onLoan || s.starter!.player.status === 'unavailable')).toBe(false)
  })
})
