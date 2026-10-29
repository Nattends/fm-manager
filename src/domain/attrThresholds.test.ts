import { describe, expect, it } from 'vitest'
import { attrTier, DEFAULT_ATTR_THRESHOLDS, normalizeThresholds, setThreshold } from './attrThresholds'

describe('seuils de couleur des attributs', () => {
  it('range un attribut dans son niveau', () => {
    const t = DEFAULT_ATTR_THRESHOLDS
    expect(attrTier(20, t)).toBe('excellent')
    expect(attrTier(16, t)).toBe('excellent')
    expect(attrTier(15, t)).toBe('good')
    expect(attrTier(13, t)).toBe('good')
    expect(attrTier(12, t)).toBe('average')
    expect(attrTier(10, t)).toBe('average')
    expect(attrTier(9, t)).toBe('poor')
    expect(attrTier(1, t)).toBe('poor')
  })

  it('respecte des seuils personnalisés', () => {
    const t = { excellent: 18, good: 15, average: 12 }
    expect(attrTier(17, t)).toBe('good')
    expect(attrTier(11, t)).toBe('poor')
  })

  it('normalise des valeurs invalides ou désordonnées', () => {
    expect(normalizeThresholds(null)).toEqual(DEFAULT_ATTR_THRESHOLDS)
    expect(normalizeThresholds({ excellent: 99, good: 0, average: 7.6 })).toEqual({ excellent: 20, good: 1, average: 1 })
    expect(normalizeThresholds({ excellent: 12, good: 15, average: 14 })).toEqual({ excellent: 12, good: 12, average: 12 })
    expect(normalizeThresholds({ excellent: Number.NaN })).toEqual(DEFAULT_ATTR_THRESHOLDS)
  })

  it('garde les seuils dans l\'ordre quand on en modifie un', () => {
    const base = { excellent: 16, good: 13, average: 10 }
    expect(setThreshold(base, 'excellent', 12)).toEqual({ excellent: 12, good: 12, average: 10 })
    expect(setThreshold(base, 'excellent', 9)).toEqual({ excellent: 9, good: 9, average: 9 })
    expect(setThreshold(base, 'average', 15)).toEqual({ excellent: 16, good: 15, average: 15 })
    expect(setThreshold(base, 'average', 18)).toEqual({ excellent: 18, good: 18, average: 18 })
    expect(setThreshold(base, 'good', 17)).toEqual({ excellent: 17, good: 17, average: 10 })
    expect(setThreshold(base, 'good', 8)).toEqual({ excellent: 16, good: 8, average: 8 })
  })
})
