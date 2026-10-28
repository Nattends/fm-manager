import type { Position } from './positions'

/**
 * Grille du terrain : 6 lignes (0 = attaque … 5 = gardien) × 9 colonnes (0 = gauche … 8 = droite).
 * Les colonnes paires sont les 5 couloirs de FM (côté, axe gauche, axe, axe droit, côté) ;
 * les colonnes impaires sont les demi-espaces entre deux couloirs. Le poste d'une carte
 * est déterminé par sa case : un demi-espace compte comme un poste axial.
 */
export const PITCH_ROWS = 6
export const PITCH_COLS = 9
export const GK_ROW = 5
/** Colonne du gardien (axe). */
export const GK_COL = 4

/** Colonne de la grille pour un couloir FM (0-4), utilisée par les formations prédéfinies. */
export function laneCol(lane: number): number {
  return lane * 2
}

/** Demi-espace : entre deux couloirs FM. */
export function isHalfSpace(col: number): boolean {
  return col % 2 === 1
}

export interface Cell {
  row: number
  col: number
}

/** Poste correspondant à une case, ou null si la case n'existe pas dans FM (attaquant excentré, gardien hors axe). */
export function positionAt(row: number, col: number): Position | null {
  const wide = col === 0 ? 'L' : col === PITCH_COLS - 1 ? 'R' : null
  switch (row) {
    case 0: return wide ? null : 'ST'
    case 1: return wide ? (`AM${wide}` as Position) : 'AMC'
    case 2: return wide ? (`M${wide}` as Position) : 'MC'
    case 3: return wide ? (`WB${wide}` as Position) : 'DM'
    case 4: return wide ? (`D${wide}` as Position) : 'DC'
    case GK_ROW: return col === GK_COL ? 'GK' : null
    default: return null
  }
}

/** Cases sur lesquelles on peut déposer une carte de champ (le gardien ne bouge pas). */
export function isFieldCell(row: number, col: number): boolean {
  return row !== GK_ROW && positionAt(row, col) !== null
}

/**
 * Colonnes espacées de 9,875 % : deux cartes ne sont jamais dans des colonnes voisines
 * (voir canPlace), elles peuvent donc faire 19 % de large sans se chevaucher.
 */
const COL_X = Array.from({ length: PITCH_COLS }, (_, i) => 10.5 + i * 9.875)
const ROW_Y = [13, 29, 45, 61, 76, 92]

/** Centre de la case en % du terrain. */
export function cellCenter(row: number, col: number): { x: number; y: number } {
  return { x: COL_X[col], y: ROW_Y[row] }
}

/**
 * Nom de formation déduit des lignes : défenseurs (latéraux offensifs inclus),
 * milieux défensifs, milieux, milieux offensifs, attaquants. Ex : « 4-2-3-1 ».
 */
export function formationName(cells: Cell[]): string {
  const count = (pred: (c: Cell) => boolean) => cells.filter(pred).length
  const isWb = (c: Cell) => c.row === 3 && (c.col === 0 || c.col === PITCH_COLS - 1)
  const lines = [
    count((c) => c.row === 4 || isWb(c)),
    count((c) => c.row === 3 && !isWb(c)),
    count((c) => c.row === 2),
    count((c) => c.row === 1),
    count((c) => c.row === 0),
  ]
  return lines.filter((n) => n > 0).join('-')
}
