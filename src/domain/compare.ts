import type { AttributeKey } from './attributes'
import { normalizeText } from './photoMatch'
import { rateRole, type RoleRating } from './rating'
import type { Player, RoleDefinition } from './types'

/** Côté d'une comparaison : joueur de gauche (a) ou de droite (b). */
export type Side = 'a' | 'b'

export interface AttributeComparison {
  key: AttributeKey
  a: number | undefined
  b: number | undefined
  /** Meilleur des deux, null si égalité ou attribut manquant d'un côté. */
  better: Side | null
}

/** Attributs des deux joueurs côte à côte. */
export function compareAttributes(a: Player, b: Player, keys: readonly AttributeKey[]): AttributeComparison[] {
  return keys.map((key) => {
    const va = a.attributes[key]
    const vb = b.attributes[key]
    const better = va === undefined || vb === undefined || va === vb ? null : va > vb ? 'a' : 'b'
    return { key, a: va, b: vb, better }
  })
}

/** Nombre d'attributs où chaque joueur est meilleur. */
export function countBetter(rows: readonly AttributeComparison[]): Record<Side, number> {
  const count = { a: 0, b: 0 }
  for (const r of rows) if (r.better) count[r.better]++
  return count
}

export interface RoleComparison {
  role: RoleDefinition
  a: RoleRating
  b: RoleRating
  /** Vrai si le joueur connaît au moins un poste du rôle. */
  aPlays: boolean
  bPlays: boolean
  /** Note de a moins note de b. */
  diff: number
}

const plays = (p: Player, role: RoleDefinition) => role.positions.some((pos) => p.positions[pos] !== undefined)

/**
 * Notes des deux joueurs pour chaque rôle, triées par la meilleure des deux notes.
 * `playedOnly` garde les rôles dont au moins un des deux joueurs connaît un poste.
 */
export function compareRoles(a: Player, b: Player, roles: readonly RoleDefinition[], playedOnly = true): RoleComparison[] {
  return roles
    .map((role) => {
      const ra = rateRole(a, role)
      const rb = rateRole(b, role)
      return { role, a: ra, b: rb, aPlays: plays(a, role), bPlays: plays(b, role), diff: Math.round((ra.score - rb.score) * 10) / 10 }
    })
    .filter((r) => !playedOnly || r.aPlays || r.bPlays)
    .sort((x, y) => Math.max(y.a.score, y.b.score) - Math.max(x.a.score, x.b.score))
}

/** Joueurs dont le nom contient la recherche (sans accents ni casse), au plus `limit`. */
export function searchByName<T extends { name: string }>(list: readonly T[], query: string, limit: number): T[] {
  const q = normalizeText(query)
  if (!q) return list.slice(0, limit)
  const found: T[] = []
  for (const p of list) {
    if (normalizeText(p.name).includes(q)) {
      found.push(p)
      if (found.length >= limit) break
    }
  }
  return found
}
