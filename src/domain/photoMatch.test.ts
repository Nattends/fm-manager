import { describe, expect, it } from 'vitest'
import { namesMatch, nationalityMatches, photoCacheKey, pickCandidate, type PhotoCandidate } from './photoMatch'

function cand(name: string, age: number | null, nationalities: string[], photoUrl: string | null = `${name}.jpg`): PhotoCandidate {
  return { name, age, nationalities, photoUrl }
}

describe('photoMatch', () => {
  it('compare les noms sans accents ni casse', () => {
    expect(namesMatch('Vinícius Júnior', 'Vinicius Junior')).toBe(true)
    expect(namesMatch('Mbappé', 'Kylian Mbappé')).toBe(true)
    expect(namesMatch('Kylian Mbappe', 'Ethan Mbappé')).toBe(false)
  })

  it('reconnaît une nationalité saisie en français', () => {
    expect(nationalityMatches('Brésil', ['Brazil', 'Spain'])).toBe(true)
    expect(nationalityMatches('Angleterre', ['England'])).toBe(true)
    expect(nationalityMatches('Allemagne', ['France'])).toBe(false)
  })

  it('privilégie la même nationalité parmi les homonymes', () => {
    const list = [cand('Lucas Silva', 24, ['Portugal']), cand('Lucas Silva', 26, ['Brazil'])]
    expect(pickCandidate({ name: 'Lucas Silva', age: 26, nationality: 'Brésil' }, list)?.nationalities).toEqual(['Brazil'])
    expect(pickCandidate({ name: 'Lucas Silva', age: 26, nationality: '' }, list)?.nationalities).toEqual(['Portugal'])
  })

  it("rejette un âge incompatible ou un nom différent (joueur généré)", () => {
    const list = [cand('Rodrygo', 25, ['Brazil'])]
    expect(pickCandidate({ name: 'Rodrygo', age: 17, nationality: 'Brésil' }, list)).toBeNull()
    expect(pickCandidate({ name: 'Rodrygo', age: 29, nationality: 'Brésil' }, list)).not.toBeNull()
    expect(pickCandidate({ name: 'Zorglub Kowalczyk', age: 19, nationality: '' }, list)).toBeNull()
  })

  it('même clé de cache malgré accents et casse, différente selon la nationalité', () => {
    expect(photoCacheKey({ name: 'Kylian Mbappé', nationality: 'France' })).toBe(photoCacheKey({ name: 'kylian mbappe', nationality: 'FRANCE' }))
    expect(photoCacheKey({ name: 'Lucas Silva', nationality: 'Brésil' })).not.toBe(photoCacheKey({ name: 'Lucas Silva', nationality: 'Portugal' }))
  })
})