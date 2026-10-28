import { DEFAULT_ROLE_BY_POSITION } from './defaultRoles'
import { cellCenter, laneCol, positionAt } from './pitch'
import type { Position } from './positions'

export interface FormationSlot {
  id: string
  position: Position
  /** Case de la grille du terrain (voir pitch.ts). */
  row: number
  col: number
  /** Coordonnées sur le terrain en % (x : gauche → droite, y : but adverse → propre but). */
  x: number
  y: number
  defaultRole: string
}

export interface Formation {
  id: string
  slots: FormationSlot[]
}

/** Crée un poste sur une case ; sans rôle précisé, prend le profil par défaut du poste. */
export function makeSlot(id: string, row: number, col: number, defaultRole?: string): FormationSlot {
  const position = positionAt(row, col)
  if (!position) throw new Error(`Invalid cell (${row}, ${col}) for ${id}`)
  return { id, position, row, col, ...cellCenter(row, col), defaultRole: defaultRole ?? DEFAULT_ROLE_BY_POSITION[position] }
}

/** Poste d'une formation prédéfinie, la colonne étant donnée en couloir FM (0-4). */
const s = (id: string, row: number, lane: number, defaultRole?: string) => makeSlot(id, row, laneCol(lane), defaultRole)

const GK = s('gk', 5, 2)
const BACK_FOUR = [s('dl', 4, 0), s('dcl', 4, 1), s('dcr', 4, 3), s('dr', 4, 4)]
const BACK_THREE = [s('dcl', 4, 1), s('dc', 4, 2), s('dcr', 4, 3)]

export const FORMATIONS: Formation[] = [
  {
    id: '4-2-3-1',
    slots: [GK, ...BACK_FOUR,
      s('dml', 3, 1, 'dm'), s('dmr', 3, 3, 'vol'),
      s('aml', 1, 0), s('amc', 1, 2), s('amr', 1, 4),
      s('st', 0, 2)],
  },
  {
    id: '4-3-3',
    slots: [GK, ...BACK_FOUR,
      s('dm', 3, 2),
      s('mcl', 2, 1), s('mcr', 2, 3),
      s('aml', 1, 0), s('amr', 1, 4, 'w'),
      s('st', 0, 2)],
  },
  {
    id: '4-4-2',
    slots: [GK, ...BACK_FOUR,
      s('ml', 2, 0), s('mcl', 2, 1), s('mcr', 2, 3), s('mr', 2, 4),
      s('stl', 0, 1), s('str', 0, 3)],
  },
  {
    id: '4-1-4-1',
    slots: [GK, ...BACK_FOUR,
      s('dm', 3, 2),
      s('ml', 2, 0), s('mcl', 2, 1), s('mcr', 2, 3), s('mr', 2, 4, 'amrl'),
      s('st', 0, 2)],
  },
  {
    id: '4-3-1-2',
    slots: [GK, ...BACK_FOUR,
      s('dm', 3, 2),
      s('mcl', 2, 1), s('mcr', 2, 3),
      s('amc', 1, 2),
      s('stl', 0, 1), s('str', 0, 3)],
  },
  {
    id: '3-5-2',
    slots: [GK, ...BACK_THREE,
      s('wbl', 3, 0), s('dm', 3, 2), s('wbr', 3, 4),
      s('mcl', 2, 1), s('mcr', 2, 3),
      s('stl', 0, 1), s('str', 0, 3)],
  },
  {
    id: '3-4-3',
    slots: [GK, ...BACK_THREE,
      s('ml', 2, 0), s('mcl', 2, 1), s('mcr', 2, 3), s('mr', 2, 4),
      s('aml', 1, 0), s('st', 0, 2), s('amr', 1, 4)],
  },
  {
    id: '5-3-2',
    slots: [GK,
      s('wbl', 4, 0), ...BACK_THREE, s('wbr', 4, 4),
      s('mcl', 2, 1), s('mc', 2, 2), s('mcr', 2, 3),
      s('stl', 0, 1), s('str', 0, 3)],
  },
]

export const CUSTOM_FORMATION_ID = 'custom'

export function getFormation(id: string): Formation {
  return FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0]
}

/** Formation prédéfinie dont les cases correspondent exactement à cette disposition, s'il y en a une. */
export function matchPreset(cells: { row: number; col: number }[]): Formation | undefined {
  const key = (c: { row: number; col: number }) => `${c.row}:${c.col}`
  const target = new Set(cells.map(key))
  return FORMATIONS.find((f) => f.slots.length === target.size && f.slots.every((sl) => target.has(key(sl))))
}
