/** Attributs FM par groupe (les libellés sont dans src/i18n). */
export const ATTRIBUTE_GROUPS = {
  technical: [
    'corners', 'crossing', 'dribbling', 'finishing', 'firstTouch', 'freeKick', 'heading',
    'longShots', 'longThrows', 'marking', 'passing', 'penaltyTaking', 'tackling', 'technique',
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
