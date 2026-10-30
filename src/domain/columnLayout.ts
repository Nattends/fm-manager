/** Organisation des colonnes d'un tableau (ordre, colonnes masquées), enregistrée par l'utilisateur. */

/** Déplace la colonne `from` à la place de `to` ; les colonnes entre les deux glissent d'un cran. */
export function moveColumn(order: readonly string[], from: string, to: string): string[] {
  const i = order.indexOf(from)
  const j = order.indexOf(to)
  if (i < 0 || j < 0 || i === j) return [...order]
  const next = [...order]
  next.splice(i, 1)
  next.splice(j, 0, from)
  return next
}

/**
 * Ordre enregistré remis d'aplomb après une mise à jour de l'application : colonnes disparues et doublons retirés,
 * colonnes nouvelles insérées à leur place par défaut (après la colonne qui les précède dans `defaults`).
 */
export function normalizeOrder(stored: unknown, defaults: readonly string[]): string[] {
  const known = new Set(defaults)
  const result: string[] = []
  if (Array.isArray(stored)) {
    for (const id of stored) if (typeof id === 'string' && known.has(id) && !result.includes(id)) result.push(id)
  }
  defaults.forEach((id, i) => {
    if (result.includes(id)) return
    const before = defaults.slice(0, i).reverse().find((x) => result.includes(x))
    result.splice(before === undefined ? 0 : result.indexOf(before) + 1, 0, id)
  })
  return result
}

/** Colonnes masquées enregistrées, limitées aux colonnes qui existent encore. */
export function normalizeHidden(stored: unknown, defaults: readonly string[]): string[] {
  if (!Array.isArray(stored)) return []
  return defaults.filter((id) => stored.includes(id))
}
