import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE, pageKey, parsePage } from './navigation'

describe('navigation', () => {
  it('convertit les anciens identifiants de page', () => {
    expect(parsePage('scouting')).toEqual({ section: 'recruit', sub: 'scouting' })
    expect(parsePage('youth')).toEqual({ section: 'squad', sub: 'youth' })
    expect(parsePage('roles')).toEqual({ section: 'tactic', sub: 'roles' })
  })

  it('relit une page enregistrée, sinon le premier sous-onglet', () => {
    expect(parsePage('recruit/clubs')).toEqual({ section: 'recruit', sub: 'clubs' })
    expect(parsePage('recruit/nope')).toEqual({ section: 'recruit', sub: 'scouting' })
    expect(parsePage('settings')).toEqual({ section: 'settings', sub: 'general' })
  })

  it('page par défaut si rien ou inconnu', () => {
    expect(parsePage(null)).toEqual(DEFAULT_PAGE)
    expect(parsePage('foo/bar')).toEqual(DEFAULT_PAGE)
  })

  it('clé aller-retour', () => {
    expect(parsePage(pageKey({ section: 'tactic', sub: 'roles' }))).toEqual({ section: 'tactic', sub: 'roles' })
  })
})
