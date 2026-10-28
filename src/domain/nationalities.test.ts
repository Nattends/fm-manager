import { describe, expect, it } from 'vitest'
import { englishNationality, nationCode, nationName, nationalityLabel, sortedNations } from './nationalities'

describe('nationalités', () => {
  it('reconnaît un code ou un nom anglais / français', () => {
    expect(nationCode('fr')).toBe('fr')
    expect(nationCode('Brésil')).toBe('br')
    expect(nationCode('brazil')).toBe('br')
    expect(nationCode('Angleterre')).toBe('gb-eng')
    expect(nationCode('Pays-Bas')).toBe('nl')
    expect(nationCode('Atlantide')).toBeNull()
  })

  it('traduit le nom et garde la saisie inconnue', () => {
    expect(nationName('gb-sct', 'fr')).toBe('Écosse')
    expect(nationName('de', 'en')).toBe('Germany')
    expect(nationalityLabel('de', 'fr')).toBe('Allemagne')
    expect(nationalityLabel('Atlantide', 'fr')).toBe('Atlantide')
    expect(englishNationality('ma')).toBe('Morocco')
  })

  it("trie les nations dans l'ordre alphabétique de la langue", () => {
    const names = sortedNations('fr').map((n) => n.name)
    expect(names.indexOf('Écosse')).toBeLessThan(names.indexOf('Espagne'))
    expect(names.indexOf('Afrique du Sud')).toBeLessThan(names.indexOf('Albanie'))
    expect(sortedNations('fr').some((n) => n.code === 'gb')).toBe(false)
  })
})
