import { describe, expect, it } from 'vitest'
import { isAttributeKey } from './attributes'
import { DEFAULT_ROLES } from './defaultRoles'
import { FM_ROLES } from './fmRoles'
import { POSITIONS } from './positions'

describe('fmRoles', () => {
  it('85 rôles FM, identifiants uniques, poids 1/3/5 sur des attributs connus', () => {
    expect(FM_ROLES).toHaveLength(85)
    expect(new Set(DEFAULT_ROLES.map((r) => r.id)).size).toBe(DEFAULT_ROLES.length)
    for (const r of FM_ROLES) {
      const entries = Object.entries(r.weights)
      expect(entries.length).toBeGreaterThan(5)
      for (const [a, w] of entries) {
        expect(isAttributeKey(a)).toBe(true)
        expect([1, 3, 5]).toContain(w)
      }
    }
  })

  it('chaque poste propose plusieurs rôles FM', () => {
    for (const p of POSITIONS) expect(FM_ROLES.filter((r) => r.positions.includes(p)).length).toBeGreaterThanOrEqual(3)
  })
})
