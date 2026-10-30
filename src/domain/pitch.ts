import type { Position } from './positions'

/**
 * Grille du terrain, comme dans FM : 6 lignes (0 = attaque … 5 = gardien) × 5 couloirs
 * (0 = côté gauche, 1 = axe gauche, 2 = axe, 3 = axe droit, 4 = côté droit).
 * Défense, milieu défensif, milieu et milieu offensif ont 5 places ; l'attaque en a 3 (couloirs axiaux).
 * Le poste d'une carte est déterminé par sa case.
 */
export const PITCH_ROWS = 6
export const PITCH_COLS = 5
export const GK_ROW = 5
/** Colonne du gardien (axe). */
export const GK_COL = 2

export interface Cell {
  row: number
  col: number
}

/** Poste correspondant à une case, ou null si la case n'existe pas dans FM (attaquant excentré, gardien hors axe). */
export function positionAt(row: number, col: number): Position | null {
  if (col < 0 || col >= PITCH_COLS) return null
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

/** Toutes les cases de champ de la grille (5 par ligne, 3 en attaque). */
export function fieldCells(): Cell[] {
  const cells: Cell[] = []
  for (let row = 0; row < PITCH_ROWS; row++) {
    for (let col = 0; col < PITCH_COLS; col++) if (isFieldCell(row, col)) cells.push({ row, col })
  }
  return cells
}

/** Couloirs espacés de 19,75 % : des cartes de 19 % de large tiennent côte à côte sur une ligne. */
const COL_X = Array.from({ length: PITCH_COLS }, (_, i) => 10.5 + i * 19.75)
const ROW_Y = [10, 26, 42, 58, 74, 91]

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

/** Nombre de colonnes de l'ancienne grille avec demi-espaces (tactiques enregistrées entre les deux grilles). */
export const HALF_SPACE_GRID = 9

/**
 * Cases de l'ancienne grille à 9 colonnes (couloirs en colonnes paires, demi-espaces en colonnes impaires)
 * ramenées sur les 5 couloirs. Un demi-espace va vers le couloir axial de son côté ; si la case est déjà prise
 * (ou n'existe pas, 4e attaquant), la carte va sur la case libre la plus proche, de sa ligne d'abord.
 */
export function narrowCells(cells: Cell[]): Cell[] {
  const preferred = (col: number) => (col % 2 === 0 ? col / 2 : col < 4 ? 1 : 3)
  const taken = new Set<string>()
  const key = (c: Cell) => `${c.row}:${c.col}`
  const result: Cell[] = new Array(cells.length)
  // gardien d'abord, puis de gauche à droite : l'ordre des cartes d'une ligne est conservé
  const order = cells.map((c, i) => ({ c, i })).sort((a, b) => b.c.row - a.c.row || a.c.col - b.c.col)
  for (const { c, i } of order) {
    const want = { row: c.row, col: preferred(c.col) }
    const ok = (x: Cell) => positionAt(x.row, x.col) !== null && (x.row === GK_ROW) === (c.row === GK_ROW) && !taken.has(key(x))
    let cell = ok(want) ? want : null
    if (!cell) {
      // case libre la plus proche : même ligne d'abord (vers la droite à égalité, l'ordre gauche → droite est gardé)
      const candidates = fieldCells().filter(ok)
        .sort((a, b) => Math.abs(a.row - c.row) * 10 + Math.abs(a.col - want.col) - (Math.abs(b.row - c.row) * 10 + Math.abs(b.col - want.col)) || b.col - a.col)
      cell = candidates[0] ?? want
    }
    taken.add(key(cell))
    result[i] = cell
  }
  return result
}
