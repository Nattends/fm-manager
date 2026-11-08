// Position et taille de la fenêtre retenues d'une session à l'autre (pixels physiques).

export interface WindowGeometry {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export interface Area { x: number; y: number; width: number; height: number }

/** Lit une géométrie enregistrée ; null si elle est illisible ou absurde. */
export function parseGeometry(raw: string | null): WindowGeometry | null {
  if (!raw) return null
  try {
    const g = JSON.parse(raw) as Partial<WindowGeometry>
    const nums = [g.x, g.y, g.width, g.height]
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
    if (g.width! < 200 || g.height! < 200) return null
    return { x: g.x!, y: g.y!, width: g.width!, height: g.height!, maximized: g.maximized === true }
  } catch {
    return null
  }
}

/**
 * Vrai si la barre de titre de la fenêtre (une bande de 40 px en haut, au moins 120 px de large) tombe sur un écran :
 * sinon (écran débranché, résolution changée) la fenêtre serait inatteignable.
 */
export function isReachable(g: WindowGeometry, screens: Area[]): boolean {
  return screens.some((s) => {
    const left = Math.max(g.x, s.x)
    const right = Math.min(g.x + g.width, s.x + s.width)
    const top = Math.max(g.y, s.y)
    const bottom = Math.min(g.y + 40, s.y + s.height)
    return right - left >= 120 && bottom - top >= 20
  })
}
