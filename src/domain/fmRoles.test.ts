import { describe, expect, it } from 'vitest'
import { isAttributeKey } from './attributes'
import { cleanStoredRoles, DEFAULT_ROLES, DEFAULT_OOP_ROLE_BY_POSITION, DEFAULT_ROLE_BY_POSITION } from './defaultRoles'
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

  it('les rôles par défaut des postes existent, dans la bonne phase et au bon poste', () => {
    for (const p of POSITIONS) {
      const ip = FM_ROLES.find((r) => r.id === DEFAULT_ROLE_BY_POSITION[p])
      const oop = FM_ROLES.find((r) => r.id === DEFAULT_OOP_ROLE_BY_POSITION[p])
      expect(ip?.phase, p).toBe('ip')
      expect(ip?.positions, p).toContain(p)
      expect(oop?.phase, p).toBe('oop')
      expect(oop?.positions, p).toContain(p)
    }
  })

  it('retire des listes enregistrées les profils du notebook et les anciens rôles FM', () => {
    const fm24 = { id: 'fm-afa', name: 'Advanced Forward (Attack)', positions: ['ST' as const], weights: { finishing: 5 } }
    const notebook = { id: 'str', name: 'Striker', positions: ['ST' as const], weights: { finishing: 11 } }
    const mine = { id: 'mon-role', name: 'Perso', positions: ['ST' as const], weights: { pace: 5 } }
    expect(cleanStoredRoles([fm24, notebook])).toBeNull()
    expect(cleanStoredRoles([fm24, notebook, mine, FM_ROLES[0]])).toEqual([mine, FM_ROLES[0]])
    const current = [mine, FM_ROLES[0]]
    expect(cleanStoredRoles(current)).toBe(current)
  })
})
