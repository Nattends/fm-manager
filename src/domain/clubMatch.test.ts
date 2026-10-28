import { describe, expect, it } from 'vitest'
import { clubLogoKey, pickClub } from './clubMatch'

const results = [
  { name: 'Girona FC B', logoUrl: 'b.png' },
  { name: 'Girona FC U19', logoUrl: 'u19.png' },
  { name: 'Girona FC', logoUrl: 'a.png' },
]

describe('pickClub', () => {
  it('préfère le nom identique', () => {
    expect(pickClub('girona fc', results)?.logoUrl).toBe('a.png')
  })

  it("écarte les équipes réserves et de jeunes sauf si on les demande", () => {
    expect(pickClub('Girona', results)?.logoUrl).toBe('a.png')
    expect(pickClub('Girona B', [results[1], results[0]])?.logoUrl).toBe('b.png')
    expect(pickClub('Girona U19', results)?.logoUrl).toBe('u19.png')
    expect(pickClub('Real Madrid', [{ name: 'Real Madrid Castilla', logoUrl: 'c.png' }])?.logoUrl).toBe('c.png')
  })

  it('ne renvoie rien sans résultat ni nom', () => {
    expect(pickClub('Girona', [])).toBeNull()
    expect(pickClub('  ', results)).toBeNull()
  })

  it('normalise la clé du cache', () => {
    expect(clubLogoKey('Atlético Madrid')).toBe(clubLogoKey('atletico  madrid'))
  })
})
