import { describe, expect, it } from 'vitest'
import { ALL_ATTRIBUTES } from './attributes'
import { compareAttributes, compareRoles, countBetter, searchByName } from './compare'
import { DEFAULT_ROLES } from './defaultRoles'
import type { Player } from './types'

function player(name: string, positions: Player['positions'], attributes: Player['attributes']): Player {
  return {
    id: 1, name, age: 25, nationality: 'fr', clubId: 1, club: '', onLoan: false, foot: 'right', positions,
    caStars: 3, paStars: 3, contractEnd: null, wage: null, value: null,
    status: 'rotation', notes: '', attributes, photo: null, photoLookup: null,
  }
}

const level = (n: number) => Object.fromEntries(ALL_ATTRIBUTES.map((a) => [a, n]))

describe('comparaison de joueurs', () => {
  it('indique le meilleur sur chaque attribut (rien si égalité ou valeur manquante)', () => {
    const a = player('A', { ST: 20 }, { finishing: 18, pace: 12, heading: 10 })
    const b = player('B', { ST: 20 }, { finishing: 15, pace: 16, heading: 10, strength: 14 })
    const rows = compareAttributes(a, b, ['finishing', 'pace', 'heading', 'strength'])
    expect(rows.map((r) => r.better)).toEqual(['a', 'b', null, null])
    expect(countBetter(rows)).toEqual({ a: 1, b: 1 })
  })

  it('compare les rôles joués par au moins un des deux, du meilleur au moins bon', () => {
    const striker = player('Buteur', { ST: 20 }, level(16))
    const keeper = player('Gardien', { GK: 20 }, level(12))
    const rows = compareRoles(striker, keeper, DEFAULT_ROLES)
    expect(rows.every((r) => r.aPlays || r.bPlays)).toBe(true)
    expect(rows.some((r) => r.role.positions.includes('DC'))).toBe(false)
    const best = rows.map((r) => Math.max(r.a.score, r.b.score))
    expect(best).toEqual([...best].sort((x, y) => y - x))
    const cf = rows.find((r) => r.role.id === 'fm-centre-forward')!
    expect(cf.diff).toBeCloseTo(cf.a.score - cf.b.score, 1)
    expect(compareRoles(striker, keeper, DEFAULT_ROLES, false)).toHaveLength(DEFAULT_ROLES.length)
  })

  it('cherche un joueur par son nom sans accents ni casse', () => {
    const list = [{ name: 'Kylian Mbappé' }, { name: 'Erling Haaland' }, { name: 'Ousmane Dembélé' }]
    expect(searchByName(list, 'MBAPPE', 10).map((p) => p.name)).toEqual(['Kylian Mbappé'])
    expect(searchByName(list, 'e', 2)).toHaveLength(2)
    expect(searchByName(list, '', 10)).toHaveLength(3)
  })
})
