import { normalizeHidden, normalizeOrder } from '@/domain/columnLayout'

/** Organisation d'un tableau retenue d'une session à l'autre (localStorage, sans effet s'il est indisponible). */
export interface ColumnLayout {
  order: string[]
  hidden: string[]
}

export function loadColumnLayout(key: string, defaults: readonly string[], defaultHidden: readonly string[] = []): ColumnLayout {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const stored: unknown = JSON.parse(raw)
      if (stored && typeof stored === 'object') {
        const { order, hidden } = stored as Record<string, unknown>
        return { order: normalizeOrder(order, defaults), hidden: normalizeHidden(hidden, defaults) }
      }
    }
  } catch { /* stockage indisponible ou contenu illisible */ }
  return { order: [...defaults], hidden: [...defaultHidden] }
}

export function saveColumnLayout(key: string, layout: ColumnLayout): void {
  try { localStorage.setItem(key, JSON.stringify(layout)) } catch { /* ignoré */ }
}

/** Ordre seul (tableaux dont la visibilité est gérée à part). */
export function loadColumnOrder(key: string, defaults: readonly string[]): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return normalizeOrder(JSON.parse(raw), defaults)
  } catch { /* stockage indisponible ou contenu illisible */ }
  return [...defaults]
}

export function saveColumnOrder(key: string, order: readonly string[]): void {
  try { localStorage.setItem(key, JSON.stringify(order)) } catch { /* ignoré */ }
}
