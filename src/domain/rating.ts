import type { AttributeKey } from './attributes'
import type { Position } from './positions'
import type { Player, RoleDefinition } from './types'

/** En dessous de cette part (pondérée) d'attributs renseignés, la note est marquée « estimée ». */
export const ESTIMATED_THRESHOLD = 0.6

export interface RoleRating {
  /** Note finale sur 100 (courbe de notation × familiarité). 0 si aucun attribut du rôle n'est renseigné. */
  score: number
  /** Moyenne pondérée des attributs, sur l'échelle FM 1-20 (comme le notebook). */
  average: number
  /** Note sur 100 avant pénalité de poste. */
  base: number
  /** Multiplicateur appliqué selon la familiarité au poste. */
  familiarityFactor: number
  /** Part (pondérée) des attributs du rôle qui sont renseignés, de 0 à 1. */
  coverage: number
  /** Faux si aucun attribut du rôle n'est renseigné : pas de note. */
  rated: boolean
  estimated: boolean
}

/**
 * Courbe moyenne d'attributs (1-20) → note sur 100, linéaire par morceaux.
 * La pente est maximale entre 12 et 18, là où se situent la plupart des joueurs,
 * pour bien séparer un bon joueur (≈ 15,3 → 77) d'un excellent (18 → 92).
 */
export const RATING_CURVE: [average: number, score: number][] = [
  [1, 0],
  [8, 20],
  [12, 50],
  [15, 75],
  [18, 92],
  [20, 100],
]

/**
 * Familiarité (1-20) → multiplicateur, linéaire par morceaux.
 * Valeurs aux niveaux FM : Naturel 1 · Confirmé 0,96 · Compétent 0,88 ·
 * Peu convaincant 0,80 · Maladroit 0,72 · Inefficace 0,62. Jamais joué : 0,5.
 */
export const FAMILIARITY_CURVE: [familiarity: number, factor: number][] = [
  [3, 0.62],
  [7, 0.72],
  [10, 0.8],
  [14, 0.88],
  [17, 0.96],
  [18, 1],
]
export const NEVER_PLAYED_FACTOR = 0.5

function interpolate(curve: [number, number][], x: number): number {
  if (x <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]
    if (x <= x1) {
      const [x0, y0] = curve[i - 1]
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return curve[curve.length - 1][1]
}

export function scoreFromAverage(average: number): number {
  return interpolate(RATING_CURVE, average)
}

export function familiarityFactor(familiarity: number | undefined): number {
  if (!familiarity) return NEVER_PLAYED_FACTOR
  return interpolate(FAMILIARITY_CURVE, familiarity)
}

/** Familiarité du joueur pour le rôle : poste précis si fourni, sinon meilleur poste du rôle. */
export function familiarityFor(player: Player, role: RoleDefinition, position?: Position): number | undefined {
  if (position) return player.positions[position]
  let best: number | undefined
  for (const p of role.positions) {
    const f = player.positions[p]
    if (f !== undefined && (best === undefined || f > best)) best = f
  }
  return best
}

/** Paliers de poids parcourus au clic dans l'écran Rôles : non compté → ×5 → ×3 → ×1 → non compté. */
export const WEIGHT_CYCLE = [0, 5, 3, 1] as const

/**
 * Poids suivant au clic. Un poids hors paliers (ex. ×8 ou ×11 venant du notebook)
 * passe au palier inférieur le plus proche.
 */
export function nextWeight(weight: number): number {
  const i = (WEIGHT_CYCLE as readonly number[]).indexOf(weight)
  if (i !== -1) return WEIGHT_CYCLE[(i + 1) % WEIGHT_CYCLE.length]
  return [5, 3, 1].find((tier) => tier < weight) ?? 0
}

/** Attributs comptés par le rôle avec leur poids (> 0), du plus lourd au plus léger. */
export function roleWeights(role: RoleDefinition): [AttributeKey, number][] {
  return (Object.entries(role.weights) as [AttributeKey, number][])
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
}

/**
 * Note d'un joueur pour un rôle : moyenne pondérée de ses attributs (seuls les
 * attributs renseignés comptent), passée dans la courbe de notation, puis multipliée
 * par le facteur de familiarité au poste. Le niveau en étoiles n'intervient pas.
 */
export function rateRole(player: Player, role: RoleDefinition, position?: Position): RoleRating {
  let totalWeight = 0
  let presentWeight = 0
  let weightedSum = 0
  for (const [attr, weight] of roleWeights(role)) {
    totalWeight += weight
    const v = player.attributes[attr]
    if (v !== undefined) {
      presentWeight += weight
      weightedSum += v * weight
    }
  }

  const factor = familiarityFactor(familiarityFor(player, role, position))
  const coverage = totalWeight > 0 ? presentWeight / totalWeight : 0
  if (presentWeight === 0) {
    return { score: 0, average: 0, base: 0, familiarityFactor: factor, coverage: 0, rated: false, estimated: false }
  }

  const average = weightedSum / presentWeight
  const base = scoreFromAverage(average)
  return {
    score: round1(base * factor),
    average: round1(average),
    base: round1(base),
    familiarityFactor: factor,
    coverage,
    rated: true,
    estimated: coverage < ESTIMATED_THRESHOLD,
  }
}

export interface BestRole {
  role: RoleDefinition
  rating: RoleRating
}

/** Rôles jouables par le joueur (postes renseignés), triés par note décroissante. */
export function rolesForPlayer(player: Player, roles: RoleDefinition[]): BestRole[] {
  return roles
    .filter((r) => r.positions.some((p) => player.positions[p] !== undefined))
    .map((role) => ({ role, rating: rateRole(player, role) }))
    .sort((a, b) => b.rating.score - a.rating.score)
}

export interface RoleRatingRow extends BestRole {
  /** Vrai si le joueur a au moins un des postes du rôle (sinon pénalité « jamais joué »). */
  playsPosition: boolean
}

/** Tous les rôles, y compris à des postes que le joueur ne joue pas, triés par note décroissante. */
export function allRoleRatings(player: Player, roles: RoleDefinition[]): RoleRatingRow[] {
  return roles
    .map((role) => ({
      role,
      rating: rateRole(player, role),
      playsPosition: role.positions.some((p) => player.positions[p] !== undefined),
    }))
    .sort((a, b) => b.rating.score - a.rating.score || b.rating.base - a.rating.base)
}

export function bestRole(player: Player, roles: RoleDefinition[]): BestRole | undefined {
  return rolesForPlayer(player, roles)[0]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
