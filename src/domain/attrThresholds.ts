/** Seuils (1-20) à partir desquels un attribut change de couleur. En dessous de `average` : faible. */
export interface AttrThresholds {
  excellent: number
  good: number
  average: number
}

export type AttrTier = 'excellent' | 'good' | 'average' | 'poor'

export const DEFAULT_ATTR_THRESHOLDS: AttrThresholds = { excellent: 16, good: 13, average: 10 }

const clamp = (n: number) => Math.min(20, Math.max(1, Math.round(n)))

/** Valeurs entières entre 1 et 20, dans l'ordre excellent ≥ bon ≥ moyen (sinon valeurs par défaut). */
export function normalizeThresholds(t: Partial<AttrThresholds> | null | undefined): AttrThresholds {
  const d = DEFAULT_ATTR_THRESHOLDS
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v) : fallback)
  const excellent = num(t?.excellent, d.excellent)
  const good = Math.min(num(t?.good, d.good), excellent)
  const average = Math.min(num(t?.average, d.average), good)
  return { excellent, good, average }
}

/** Modifie un seuil en gardant les autres cohérents : les seuils voisins suivent s'ils se retrouvent du mauvais côté. */
export function setThreshold(current: AttrThresholds, key: keyof AttrThresholds, value: number): AttrThresholds {
  const v = clamp(value)
  const next = { ...current, [key]: v }
  if (key === 'excellent') {
    next.good = Math.min(next.good, v)
    next.average = Math.min(next.average, next.good)
  } else if (key === 'good') {
    next.excellent = Math.max(next.excellent, v)
    next.average = Math.min(next.average, v)
  } else {
    next.good = Math.max(next.good, v)
    next.excellent = Math.max(next.excellent, next.good)
  }
  return next
}

export function attrTier(value: number, t: AttrThresholds): AttrTier {
  if (value >= t.excellent) return 'excellent'
  if (value >= t.good) return 'good'
  if (value >= t.average) return 'average'
  return 'poor'
}
