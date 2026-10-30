import { describe, expect, it } from 'vitest'
import { isAttributeKey } from './attributes'
import { DEFAULT_ROLES, isObsoleteRoleList, NOTEBOOK_ROLES } from './defaultRoles'
import { FM_ROLES } from './fmRoles'
import { POSITIONS } from './positions'

describe('fmRoles', () => {
  it('68 rôles FM (40 avec ballon, 28 sans), identifiants uniques, poids 1/3/5 sur des attributs connus', () => {
    expect(FM_ROLES).toHaveLength(68)
    expect(FM_ROLES.filter((r) => r.phase === 'ip')).toHaveLength(40)
    expect(FM_ROLES.filter((r) => r.phase === 'oop')).toHaveLength(28)
    expect(new Set(DEFAULT_ROLES.map((r) => r.id)).size).toBe(DEFAULT_ROLES.length)
    for (const r of FM_ROLES) {
      const entries = Object.entries(r.weights)
      expect(entries.filter(([, w]) => w === 3).length).toBeGreaterThan(0)
      for (const [a, w] of entries) {
        expect(isAttributeKey(a)).toBe(true)
        expect([1, 3, 5]).toContain(w)
      }
    }
  })

  it('chaque poste a des rôles FM avec ballon et sans ballon', () => {
    for (const p of POSITIONS) {
      expect(FM_ROLES.some((r) => r.phase === 'ip' && r.positions.includes(p))).toBe(true)
      expect(FM_ROLES.some((r) => r.phase === 'oop' && r.positions.includes(p))).toBe(true)
    }
  })

  it('reconnaît une liste enregistrée d’anciens rôles FM', () => {
    const old = [{ id: 'fm-afa', name: 'Advanced Forward (Attack)', positions: ['ST' as const], weights: { finishing: 5 } }]
    expect(isObsoleteRoleList(old)).toBe(true)
    expect(isObsoleteRoleList([...old, NOTEBOOK_ROLES[0]])).toBe(false)
    expect(isObsoleteRoleList([...old, FM_ROLES[0]])).toBe(false)
    expect(isObsoleteRoleList([])).toBe(false)
  })
})
