import type { Position } from './positions'

/**
 * Grille du terrain façon FM : 6 lignes (0 = attaque … 5 = gardien) × 5 couloirs
 * (0 = gauche … 4 = droite). Le poste d'une carte est déterminé par sa case.
 */
export const PITCH_ROWS = 6
export const PITCH_COLS = 5
export const GK_ROW = 5

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
    case GK_ROW: return col === 2 ? 'GK' : null
    default: return null
  }
}

/** Cases sur lesquelles on peut déposer une carte de champ (le gardien ne bouge pas). */
export function isFieldCell(row: number, col: number): boolean {
  return row !== GK_ROW && positionAt(row, col) !== null
}

/** Couloirs espacés de 19,75 % : les cartes peuvent faire 19 % de large sans se chevaucher. */
const COL_X = [10.5, 30.25, 50, 69.75, 89.5]
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
