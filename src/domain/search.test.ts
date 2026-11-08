import { describe, expect, it } from 'vitest'
import { commandFilter, matchesSearch } from './search'

describe('matchesSearch', () => {
  it('ignore les accents, la casse et la ponctuation', () => {
    expect(matchesSearch('mbappe', 'Kylian Mbappé')).toBe(true)
    expect(matchesSearch('MBAPPÉ', 'Kylian Mbappe')).toBe(true)
    expect(matchesSearch('odegaard', 'Martin Ødegaard')).toBe(true)
    expect(matchesSearch('dokovic', 'Đoković')).toBe(true)
    expect(matchesSearch('bresil', 'Brésil')).toBe(true)
    expect(matchesSearch("saint-etienne", 'Saint Étienne')).toBe(true)
  })

  it('demande chaque mot, dans n’importe lequel des textes', () => {
    expect(matchesSearch('kylian mbap', 'Kylian Mbappé')).toBe(true)
    expect(matchesSearch('mbappe france', 'Kylian Mbappé', 'France')).toBe(true)
    expect(matchesSearch('mbappe espagne', 'Kylian Mbappé', 'France')).toBe(false)
  })

  it('une recherche vide garde tout', () => {
    expect(matchesSearch('  ', 'Kylian Mbappé')).toBe(true)
  })
})

describe('commandFilter', () => {
  it('tient compte des mots-clés', () => {
    expect(commandFilter('Côte d’Ivoire ci', 'cote')).toBe(1)
    expect(commandFilter('Allemagne de', 'germany', ['Germany'])).toBe(1)
    expect(commandFilter('Allemagne de', 'italie')).toBe(0)
  })
})
