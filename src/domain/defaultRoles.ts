import type { AttributeKey } from './attributes'
import { FM_ROLE_PREFIX, FM_ROLES } from './fmRoles'
import type { Position } from './positions'
import type { RoleDefinition } from './types'

/**
 * Profils par défaut, repris du notebook « position score calculator.ipynb ».
 * Les profils écrits en moyennes pondérées (cb : 75 % / 25 %, w : 75 % / 25 %,
 * str : 50 % / 50 %) sont convertis en poids entiers strictement équivalents.
 * Un attribut absent a un poids 0 (non compté).
 */
function role(id: string, name: string, positions: string, weights: Partial<Record<AttributeKey, number>>): RoleDefinition {
  return { id, name, positions: positions.split(' ') as Position[], weights }
}

export const NOTEBOOK_ROLES: RoleDefinition[] = [
  role('gk', 'Goalkeeper', 'GK', {
    agility: 5, reflexes: 5,
    oneOnOnes: 3, anticipation: 3, commandOfArea: 3, concentration: 3, kicking: 3, positioning: 3,
    acceleration: 1, aerialReach: 1, composure: 1, decisions: 1, firstTouch: 1, handling: 1, passing: 1, throwing: 1, vision: 1,
  }),
  role('fb', 'Full-back', 'DL DR WBL WBR', {
    workRate: 5, acceleration: 5, pace: 5, stamina: 5,
    crossing: 3, dribbling: 3, marking: 3, offTheBall: 3, tackling: 3, teamwork: 3,
    agility: 1, anticipation: 1, concentration: 1, decisions: 1, firstTouch: 1, passing: 1, positioning: 1, technique: 1,
  }),
  // cb = 0.75 × moyenne(9 principaux) + 0.25 × moyenne(8 secondaires) → poids 8 / 3.
  role('cb', 'Centre-back', 'DC', {
    composure: 8, heading: 8, jumpingReach: 8, marking: 8, passing: 8, positioning: 8, strength: 8, tackling: 8, pace: 8,
    aggression: 3, anticipation: 3, bravery: 3, concentration: 3, decisions: 3, firstTouch: 3, technique: 3, vision: 3,
  }),
  role('dm', 'Defensive midfielder', 'DM', {
    workRate: 5, pace: 5, stamina: 3, passing: 3,
    tackling: 2, anticipation: 2, concentration: 2, positioning: 2, balance: 2, agility: 2,
    teamwork: 1, firstTouch: 1, marking: 1, aggression: 1, composure: 1, decisions: 1, strength: 1,
  }),
  role('vol', 'Segundo volante', 'DM', {
    workRate: 5, pace: 5, stamina: 3, passing: 3,
    tackling: 2, anticipation: 2, concentration: 2, positioning: 2, teamwork: 2,
    firstTouch: 1, marking: 1, aggression: 1, composure: 1, decisions: 1, strength: 1,
  }),
  role('box2', 'Box-to-box midfielder', 'MC', {
    passing: 5, workRate: 5, stamina: 4,
    tackling: 3, offTheBall: 3, teamwork: 3,
    vision: 2, strength: 2, decisions: 2, positioning: 2, pace: 2,
    aggression: 1, anticipation: 1, finishing: 1, longShots: 1, composure: 1, acceleration: 1, balance: 1,
    firstTouch: 1, dribbling: 1, technique: 1,
  }),
  // w = 0.75 × moyenne(6 principaux) + 0.25 × moyenne(5 secondaires) → poids 5 / 2.
  role('w', 'Winger', 'ML MR AML AMR', {
    acceleration: 5, crossing: 5, dribbling: 5, offTheBall: 5, pace: 5, technique: 5,
    agility: 2, firstTouch: 2, passing: 2, stamina: 2, workRate: 2,
  }),
  role('amrl', 'Inverted winger', 'ML MR AML AMR', {
    acceleration: 5, pace: 5, workRate: 5,
    dribbling: 3, passing: 3, technique: 3, offTheBall: 3,
    crossing: 1, firstTouch: 1, composure: 1, decisions: 1, vision: 1, agility: 1, stamina: 1,
  }),
  role('amc', 'Attacking midfielder', 'AMC', {
    vision: 4, offTheBall: 4, passing: 4,
    decisions: 3, anticipation: 3, composure: 3, technique: 3,
    dribbling: 1, firstTouch: 1, flair: 1, longShots: 1, agility: 1, finishing: 1,
  }),
  // str = 0.5 × moyenne(4 principaux) + 0.5 × moyenne(11 secondaires) → poids 11 / 4.
  role('str', 'Striker', 'ST', {
    composure: 11, finishing: 11, offTheBall: 11, pace: 11,
    acceleration: 4, agility: 4, anticipation: 4, balance: 4, decisions: 4, dribbling: 4,
    firstTouch: 4, passing: 4, stamina: 4, technique: 4, workRate: 4,
  }),
]

/** Rôles par défaut : les 10 profils du notebook, puis les rôles FM (roles.json). */
export const DEFAULT_ROLES: RoleDefinition[] = [...NOTEBOOK_ROLES, ...FM_ROLES]

/** Profil proposé par défaut pour chaque poste. */
export const DEFAULT_ROLE_BY_POSITION: Record<Position, string> = {
  GK: 'gk',
  DL: 'fb', DC: 'cb', DR: 'fb',
  WBL: 'fb', DM: 'dm', WBR: 'fb',
  ML: 'w', MC: 'box2', MR: 'w',
  AML: 'amrl', AMC: 'amc', AMR: 'amrl',
  ST: 'str',
}

/**
 * Vrai si une liste enregistrée ne contient que des rôles FM qui n'existent plus (rôles FM24 remplacés par ceux de FM27) :
 * c'est une copie des anciens rôles par défaut, sans profil du notebook ni rôle créé par l'utilisateur.
 */
export function isObsoleteRoleList(list: RoleDefinition[]): boolean {
  const current = new Set(FM_ROLES.map((r) => r.id))
  return list.length > 0 && list.every((r) => r.id.startsWith(FM_ROLE_PREFIX) && !current.has(r.id))
}

/** Vrai si la liste de rôles est au format actuel (poids par attribut). */
export function isRoleList(value: unknown): value is RoleDefinition[] {
  return Array.isArray(value) && value.every((r) => r && typeof r === 'object' && 'weights' in r && Array.isArray(r.positions))
}
