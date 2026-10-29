import { useSyncExternalStore } from 'react'
import { DEFAULT_ATTR_THRESHOLDS, normalizeThresholds, setThreshold, type AttrThresholds } from '@/domain/attrThresholds'

/** Seuils de couleur des attributs, réglables dans Settings (mémorisés sur cet ordinateur). */
const KEY = 'attrs.thresholds'
const listeners = new Set<() => void>()

function load(): AttrThresholds {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return normalizeThresholds(JSON.parse(raw))
  } catch { /* stockage indisponible ou valeur illisible */ }
  return DEFAULT_ATTR_THRESHOLDS
}

let current = load()

function commit(next: AttrThresholds) {
  current = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignoré */ }
  for (const l of listeners) l()
}

/** Seuils actuels (lecture directe, pour les fonctions de couleur). */
export function getAttrThresholds(): AttrThresholds {
  return current
}

export function changeAttrThreshold(key: keyof AttrThresholds, value: number) {
  commit(setThreshold(current, key, value))
}

export function resetAttrThresholds() {
  commit(DEFAULT_ATTR_THRESHOLDS)
}

/** Seuils actuels, mis à jour dès qu'ils changent. */
export function useAttrThresholds(): AttrThresholds {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => current,
  )
}
