/** Postes FM (codes anglais ; les libellés affichés sont dans src/i18n). */
export const POSITIONS = [
  'GK',
  'DL', 'DC', 'DR',
  'WBL', 'DM', 'WBR',
  'ML', 'MC', 'MR',
  'AML', 'AMC', 'AMR',
  'ST',
] as const

export type Position = (typeof POSITIONS)[number]

/** Niveaux de familiarité FM, convertis en valeur 1-20 (libellés dans src/i18n). */
export const FAMILIARITY_LEVELS = [20, 17, 14, 10, 7, 3] as const
export type FamiliarityLevel = (typeof FAMILIARITY_LEVELS)[number]

/** Niveau FM correspondant à une valeur de familiarité. */
export function familiarityLevel(value: number | undefined): FamiliarityLevel | undefined {
  if (!value) return undefined
  return FAMILIARITY_LEVELS.find((l) => value >= l) ?? 3
}

export function isPosition(p: string): p is Position {
  return (POSITIONS as readonly string[]).includes(p)
}

/** Disposition des postes façon terrain FM (attaque en haut), sur 3 couloirs (mini-terrains de la fiche et du formulaire). */
export const POSITION_GRID: (Position | null)[][] = [
  [null, null, 'ST', null, null],
  ['AML', null, 'AMC', null, 'AMR'],
  ['ML', null, 'MC', null, 'MR'],
  ['WBL', null, 'DM', null, 'WBR'],
  ['DL', null, 'DC', null, 'DR'],
  [null, null, 'GK', null, null],
]
