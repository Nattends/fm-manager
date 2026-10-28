import type { AttributeKey } from './attributes'
import type { Position } from './positions'

export type Foot = 'left' | 'right' | 'both'

export type PlayerStatus = 'key' | 'rotation' | 'prospect' | 'for_sale' | 'unavailable'

/** Attributs FM (1-20). Tous facultatifs : un attribut absent n'a pas été saisi. */
export type Attributes = Partial<Record<AttributeKey, number>>

/** Familiarité par poste (1-20, 20 = naturel). Un poste absent = jamais joué. */
export type PositionFamiliarity = Partial<Record<Position, number>>

export interface Player {
  id: number
  name: string
  age: number
  nationality: string
  foot: Foot
  positions: PositionFamiliarity
  /** Capacité actuelle / potentielle, en étoiles (0.5 à 5). */
  caStars: number
  paStars: number
  contractEnd: string | null
  wage: number | null
  value: number | null
  status: PlayerStatus
  notes: string
  attributes: Attributes
  /** Photo (data URL) trouvée sur Transfermarkt, null = aucune (avatar inconnu). */
  photo: string | null
  /** Nom pour lequel la recherche de photo a été faite (null = pas encore cherchée). */
  photoLookup: string | null
}

export type NewPlayer = Omit<Player, 'id' | 'photo' | 'photoLookup'> &
  Partial<Pick<Player, 'photo' | 'photoLookup'>> & { id?: number }

export type Duty = 'defend' | 'support' | 'attack' | 'auto'

export interface RoleDefinition {
  id: string
  name: string
  /** Postes sur lesquels ce rôle est disponible. */
  positions: Position[]
  /** Poids de chaque attribut dans la note du rôle (absent ou 0 = non compté). */
  weights: Partial<Record<AttributeKey, number>>
}

export interface TacticSlot {
  slotId: string
  /** Case occupée sur la grille du terrain (le poste en découle, voir pitch.ts). */
  row: number
  col: number
  roleId: string
  duty: Duty
  /** Joueur imposé manuellement sur ce poste (null = choix automatique). */
  lockedPlayerId: number | null
}

export interface Tactic {
  id: number
  name: string
  formation: string
  slots: TacticSlot[]
  /** Joueurs écartés du XI pour cette tactique (jamais choisis automatiquement). */
  excludedPlayerIds: number[]
  notes: string
}

export type NewTactic = Omit<Tactic, 'id'> & { id?: number }
