import { useSyncExternalStore } from 'react'
import { DEFAULT_MONEYBALL_PARAMS, normalizeMoneyballParams, type MoneyballParams } from '@/domain/moneyball'
import { DEFAULT_RATING_PARAMS, normalizeRatingParams, setRatingParams, type RatingParams } from '@/domain/rating'

/**
 * Paramètres de la note et du Moneyball, réglables dans Settings (mémorisés sur cet ordinateur).
 * Les paramètres de la note sont appliqués dès le chargement de ce module, avant le premier calcul.
 */
const RATING_KEY = 'rating.params'
const MONEYBALL_KEY = 'moneyball.params'
/** Poids du Moneyball enregistrés avant l'arrivée des réglages complets. */
const OLD_WEIGHTS_KEY = 'moneyball.weights'

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignoré */ }
}

/** Petit magasin observable (même principe que les seuils de couleur des attributs). */
function createStore<T>(initial: T, save: (v: T) => void, apply?: (v: T) => void) {
  let current = initial
  const listeners = new Set<() => void>()
  apply?.(current)
  return {
    get: () => current,
    set(next: T) {
      current = next
      apply?.(next)
      save(next)
      for (const l of listeners) l()
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => { listeners.delete(l) }
    },
  }
}

const ratingStore = createStore<RatingParams>(normalizeRatingParams(read(RATING_KEY)), (v) => write(RATING_KEY, v), setRatingParams)

const moneyballStore = createStore<MoneyballParams>(
  normalizeMoneyballParams(read(MONEYBALL_KEY) ?? { weights: read(OLD_WEIGHTS_KEY) }),
  (v) => write(MONEYBALL_KEY, v),
)

export function setRatingSettings(next: RatingParams) {
  ratingStore.set(normalizeRatingParams(next))
}

export function resetRatingSettings() {
  ratingStore.set(DEFAULT_RATING_PARAMS)
}

/** Paramètres de la note, mis à jour dès qu'ils changent. */
export function useRatingSettings(): RatingParams {
  return useSyncExternalStore(ratingStore.subscribe, ratingStore.get)
}

export function setMoneyballSettings(next: MoneyballParams) {
  moneyballStore.set(normalizeMoneyballParams(next))
}

export function resetMoneyballSettings() {
  moneyballStore.set(DEFAULT_MONEYBALL_PARAMS)
}

/** Réglages du Moneyball, mis à jour dès qu'ils changent. */
export function useMoneyballSettings(): MoneyballParams {
  return useSyncExternalStore(moneyballStore.subscribe, moneyballStore.get)
}
