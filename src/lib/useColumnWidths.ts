import { useState, type CSSProperties } from 'react'
import { loadColumnWidths, saveColumnWidths } from '@/lib/columnPrefs'

const DEFAULT_WIDTH = 120
const MIN_WIDTH = 40

/**
 * Largeurs des colonnes redimensionnées, retenues par tableau. Tant qu'aucune colonne n'a été redimensionnée,
 * le tableau garde sa disposition automatique ; au premier redimensionnement, les largeurs affichées sont figées.
 */
export interface ColumnWidths {
  widths: Record<string, number>
  /** Largeur d'une colonne (défaut pour une colonne jamais mesurée), `undefined` en disposition automatique. */
  widthOf: (id: string) => number | undefined
  /** Fige les largeurs affichées de `ids`, puis fixe celle de `id`. */
  set: (id: string, width: number, snapshot?: Record<string, number>) => void
  reset: () => void
  /** Attributs du `<table>` : disposition fixe dès qu'une largeur est connue. */
  tableProps: (visible: readonly string[]) => { className?: string; style?: CSSProperties }
}

export function useColumnWidths(storageKey: string): ColumnWidths {
  const [widths, setWidths] = useState(() => loadColumnWidths(storageKey))
  const active = Object.keys(widths).length > 0
  return {
    widths,
    widthOf: (id) => (active ? (widths[id] ?? DEFAULT_WIDTH) : undefined),
    set: (id, width, snapshot) => setWidths((w) => {
      const next = { ...(snapshot ?? {}), ...w, [id]: Math.max(MIN_WIDTH, Math.round(width)) }
      saveColumnWidths(storageKey, next)
      return next
    }),
    reset: () => { setWidths({}); saveColumnWidths(storageKey, {}) },
    tableProps: (visible) => active
      ? { className: 'table-fixed', style: { width: visible.reduce((s, id) => s + (widths[id] ?? DEFAULT_WIDTH), 0) } }
      : {},
  }
}
