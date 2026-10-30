import { describe, expect, it } from 'vitest'
import { moveColumn, normalizeHidden, normalizeOrder } from './columnLayout'

describe('organisation des colonnes', () => {
  const cols = ['a', 'b', 'c', 'd']

  it('déplace une colonne à la place d\'une autre', () => {
    expect(moveColumn(cols, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moveColumn(cols, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveColumn(cols, 'b', 'c')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('ne change rien pour une colonne inconnue ou identique', () => {
    expect(moveColumn(cols, 'a', 'a')).toEqual(cols)
    expect(moveColumn(cols, 'x', 'a')).toEqual(cols)
    expect(moveColumn(cols, 'a', 'x')).toEqual(cols)
  })

  it('garde l\'ordre enregistré, retire les colonnes disparues et les doublons', () => {
    expect(normalizeOrder(['c', 'a', 'zz', 'c', 'b', 'd'], cols)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('place les nouvelles colonnes à leur place par défaut', () => {
    // « b » et « c » sont nouvelles : « b » suit « a », « c » suit « b »
    expect(normalizeOrder(['d', 'a'], cols)).toEqual(['d', 'a', 'b', 'c'])
    // une nouvelle colonne en tête reste en tête
    expect(normalizeOrder(['b', 'c', 'd'], cols)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('repart de l\'ordre par défaut si rien d\'exploitable n\'est enregistré', () => {
    expect(normalizeOrder(null, cols)).toEqual(cols)
    expect(normalizeOrder('abc', cols)).toEqual(cols)
    expect(normalizeOrder([], cols)).toEqual(cols)
  })

  it('limite les colonnes masquées à celles qui existent', () => {
    expect(normalizeHidden(['d', 'zz', 'b'], cols)).toEqual(['b', 'd'])
    expect(normalizeHidden(undefined, cols)).toEqual([])
  })
})
