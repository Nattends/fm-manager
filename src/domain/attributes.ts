/**
 * Attributs FM par groupe (les libellés sont dans src/i18n). L'ordre est celui affiché partout :
 * pour la technique, les coups de pied arrêtés (corners, coups francs, touches longues, penalties) sont en dernier.
 */
export const ATTRIBUTE_GROUPS = {
  technical: [
    'crossing', 'dribbling', 'finishing', 'firstTouch', 'heading', 'longShots', 'marking', 'passing',
    'tackling', 'technique', 'corners', 'freeKick', 'longThrows', 'penaltyTaking',
  ],
  mental: [
    'aggression', 'anticipation', 'bravery', 'composure', 'concentration', 'decisions', 'determination',
    'flair', 'leadership', 'offTheBall', 'positioning', 'teamwork', 'vision', 'workRate',
  ],
  physical: ['acceleration', 'agility', 'balance', 'jumpingReach', 'naturalFitness', 'pace', 'stamina', 'strength'],
  goalkeeping: [
    'aerialReach', 'commandOfArea', 'communication', 'eccentricity', 'handling', 'kicking',
    'oneOnOnes', 'punching', 'reflexes', 'rushingOut', 'throwing',
  ],
} as const

/** Premier coup de pied arrêté du groupe technique : un séparateur le précède dans la fiche joueur. */
export const FIRST_SET_PIECE = 'corners'

export type AttributeGroup = keyof typeof ATTRIBUTE_GROUPS
export type AttributeKey = (typeof ATTRIBUTE_GROUPS)[AttributeGroup][number]

export const ATTRIBUTE_GROUP_IDS = Object.keys(ATTRIBUTE_GROUPS) as AttributeGroup[]

export const ALL_ATTRIBUTES: AttributeKey[] = ATTRIBUTE_GROUP_IDS.flatMap((g) => [...ATTRIBUTE_GROUPS[g]])

export function attributesOf(group: AttributeGroup): AttributeKey[] {
  return [...ATTRIBUTE_GROUPS[group]]
}

export function isAttributeKey(k: string): k is AttributeKey {
  return (ALL_ATTRIBUTES as string[]).includes(k)
}
