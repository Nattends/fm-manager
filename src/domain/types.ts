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
  /** Club (partie) auquel appartient le joueur. */
  clubId: number
  /** Club qui accueille le joueur prêté (ignoré s'il n'est pas prêté). */
  club: string
  /** Prêté à un autre club : hors effectif, jamais aligné dans une tactique. */
  onLoan: boolean
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

export type NewPlayer = Omit<Player, 'id' | 'photo' | 'photoLookup' | 'clubId'> &
  Partial<Pick<Player, 'photo' | 'photoLookup' | 'clubId'>> & { id?: number }

/** Un club géré = une partie de FM, avec son effectif et ses tactiques. */
export interface Club {
  id: number
  name: string
}

export type Duty = 'defend' | 'support' | 'attack' | 'auto'

/** Phase de jeu : avec ballon (in possession) ou sans ballon (out of possession). */
export type Phase = 'ip' | 'oop'

/** Place et rôle d'un poste dans une phase de jeu. */
export interface SlotShape {
  row: number
  col: number
  roleId: string
  duty: Duty
}

export interface RoleDefinition {
  id: string
  name: string
  /** Postes sur lesquels ce rôle est disponible. */
  positions: Position[]
  /** Phase de jeu du rôle FM (avec / sans ballon) ; absente pour les profils valables dans les deux. */
  phase?: Phase
  /** Poids de chaque attribut dans la note du rôle (absent ou 0 = non compté). */
  weights: Partial<Record<AttributeKey, number>>
}

/**
 * Un poste de la tactique. row / col / roleId / duty décrivent la phase avec ballon ;
 * `oop` décrit le même joueur sans ballon (autre case, autre rôle possible).
 */
export interface TacticSlot extends SlotShape {
  slotId: string
  /** Disposition sans ballon. */
  oop: SlotShape
  /** Joueur imposé manuellement sur ce poste (null = choix automatique). */
  lockedPlayerId: number | null
}

export interface Tactic {
  id: number
  clubId: number
  name: string
  formation: string
  slots: TacticSlot[]
  /** Joueurs écartés du XI pour cette tactique (jamais choisis automatiquement). */
  excludedPlayerIds: number[]
  notes: string
}

export type NewTactic = Omit<Tactic, 'id' | 'clubId'> & { id?: number; clubId?: number }
