import type { AttributeKey } from '../attributes'

/**
 * Colonnes d'attributs de la vue personnalisée « Effectif » de FM27, de gauche à droite :
 * technique, coups de pied arrêtés, mental, physique, gardien. C'est la vue décrite dans le
 * README (l'ordre est celui des colonnes à l'écran, pas l'ordre alphabétique de l'application).
 */
export const SQUAD_ATTRIBUTE_COLUMNS: readonly AttributeKey[] = [
  'crossing', 'dribbling', 'finishing', 'firstTouch', 'heading', 'longShots', 'marking', 'passing', 'tackling', 'technique',
  'corners', 'freeKick', 'longThrows', 'penaltyTaking',
  'aggression', 'anticipation', 'bravery', 'composure', 'concentration', 'decisions', 'determination',
  'flair', 'leadership', 'offTheBall', 'positioning', 'teamwork', 'vision', 'workRate',
  'acceleration', 'agility', 'balance', 'jumpingReach', 'naturalFitness', 'pace', 'stamina', 'strength',
  'aerialReach', 'commandOfArea', 'communication', 'eccentricity', 'handling', 'kicking',
  'punching', 'oneOnOnes', 'reflexes', 'rushingOut', 'throwing',
]

/** Nombre de colonnes d'attributs d'une capture « défilée vers la droite ». */
export const SQUAD_ATTRIBUTE_COUNT = SQUAD_ATTRIBUTE_COLUMNS.length

/**
 * Nombre d'attributs visibles à la fois sur la capture de gauche (à côté des colonnes d'identité) :
 * les mêmes que les premières colonnes de la capture de droite, ce qui permet de rapprocher les deux.
 */
export const OVERLAP_COLUMNS = 8
