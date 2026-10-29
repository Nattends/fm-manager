import type { Bitmap } from './bitmap'
import { readDigitRows } from './digits'
import { SQUAD_ATTRIBUTE_COUNT } from './squadColumns'

/** Une ligne de la capture « attributs » : les 47 colonnes, sans le nom du joueur. */
export interface AttributeRow {
  cy: number
  /** null : cellule illisible. */
  values: (number | null)[]
}

/**
 * Lit une capture de la partie droite du tableau (colonnes d'attributs, noms masqués).
 * Les lignes qui n'ont pas exactement 47 cellules (ligne coupée en haut ou en bas) sont ignorées.
 */
export function readAttributeCapture(bmp: Bitmap): AttributeRow[] {
  const rows = readDigitRows(bmp, [Math.round(bmp.width * 0.066), Math.round(bmp.height * 0.27), bmp.width - 20, Math.round(bmp.height * 0.93)])
  return rows
    .filter((r) => r.cells.length === SQUAD_ATTRIBUTE_COUNT)
    .map((r) => ({ cy: r.cy, values: r.cells.map((c) => c.value) }))
}
