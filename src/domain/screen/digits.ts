import { brightness, findBlobs, type Bitmap, type Blob, type Region } from './bitmap'
import { DIGIT_TEMPLATES } from './digitTemplates'

/** Taille de normalisation d'un chiffre (la police de FM est dessinée toujours pareil). */
export const GLYPH_W = 12
export const GLYPH_H = 16

/** Hauteur (px) des chiffres des tableaux de FM à l'échelle 100 % ; tolérance incluse. */
const DIGIT_HEIGHT: readonly [number, number] = [14, 17]
/** Écart maximal (px) entre deux chiffres d'un même nombre. */
const SAME_NUMBER_GAP = 7
/** Distance au-delà de laquelle un chiffre n'est pas reconnu (cellule illisible). */
const MAX_DISTANCE = 4

export interface Glyph {
  /** Intensités 0-1 sur GLYPH_W x GLYPH_H, normalisées par le pixel le plus clair. */
  v: Float32Array
  /** Largeur / hauteur de la boîte englobante : distingue le « 1 » étroit des autres. */
  aspect: number
}

/** Échantillonne un chiffre dans sa boîte englobante, à taille fixe. */
export function sampleGlyph(bmp: Bitmap, b: Blob): Glyph {
  const v = new Float32Array(GLYPH_W * GLYPH_H)
  let max = 1
  for (let j = 0; j < GLYPH_H; j++) {
    for (let i = 0; i < GLYPH_W; i++) {
      const x = b.x + Math.min(b.w - 1, Math.floor(((i + 0.5) * b.w) / GLYPH_W))
      const y = b.y + Math.min(b.h - 1, Math.floor(((j + 0.5) * b.h) / GLYPH_H))
      const p = brightness(bmp, x, y)
      v[j * GLYPH_W + i] = p
      if (p > max) max = p
    }
  }
  for (let k = 0; k < v.length; k++) v[k] /= max
  return { v, aspect: b.w / b.h }
}

function distance(a: Glyph, b: Glyph): number {
  let s = 0
  for (let k = 0; k < a.v.length; k++) {
    const d = a.v[k] - b.v[k]
    s += d * d
  }
  return s + Math.abs(a.aspect - b.aspect) * 8
}

interface Template extends Glyph {
  digit: number
}

let templates: Template[] | null = null

function loadTemplates(): Template[] {
  if (templates) return templates
  templates = DIGIT_TEMPLATES.map((t) => {
    const bytes = Uint8Array.from(atob(t.bits), (c) => c.charCodeAt(0))
    const v = new Float32Array(bytes.length)
    for (let k = 0; k < bytes.length; k++) v[k] = bytes[k] / 255
    return { digit: t.digit, aspect: t.aspect, v }
  })
  return templates
}

/** Chiffre le plus proche et sa distance. */
export function classifyGlyph(g: Glyph): { digit: number; distance: number } {
  let best = -1
  let bestD = Infinity
  for (const t of loadTemplates()) {
    const d = distance(g, t)
    if (d < bestD) {
      bestD = d
      best = t.digit
    }
  }
  return { digit: best, distance: bestD }
}

/** Un nombre lu dans une cellule du tableau. */
export interface Cell {
  x0: number
  x1: number
  cx: number
  /** null : cellule illisible (chiffre inconnu ou plus de deux chiffres). */
  value: number | null
  /** Plus grande distance aux modèles parmi les chiffres de la cellule. */
  worst: number
}

export interface DigitRow {
  /** Centre vertical de la ligne, en pixels. */
  cy: number
  cells: Cell[]
}

/** Lit toutes les lignes de nombres (une ligne = un joueur) d'une zone du tableau. */
export function readDigitRows(bmp: Bitmap, region: Region): DigitRow[] {
  const blobs = findBlobs(bmp, region).filter((b) => b.h >= DIGIT_HEIGHT[0] && b.h <= DIGIT_HEIGHT[1])
  const rows: { cy: number; blobs: Blob[] }[] = []
  for (const b of blobs) {
    const cy = b.y + b.h / 2
    const last = rows[rows.length - 1]
    if (last && Math.abs(last.cy - cy) < 10) last.blobs.push(b)
    else rows.push({ cy, blobs: [b] })
  }
  return rows.map((r) => {
    const sorted = [...r.blobs].sort((a, b) => a.x - b.x)
    const groups: Blob[][] = []
    for (const b of sorted) {
      const g = groups[groups.length - 1]
      const prev = g?.[g.length - 1]
      if (prev && b.x - (prev.x + prev.w) < SAME_NUMBER_GAP) g.push(b)
      else groups.push([b])
    }
    const cells = groups.map((g): Cell => {
      const x0 = g[0].x
      const x1 = g[g.length - 1].x + g[g.length - 1].w
      let worst = 0
      let text = ''
      for (const b of g) {
        const c = classifyGlyph(sampleGlyph(bmp, b))
        worst = Math.max(worst, c.distance)
        text += c.digit
      }
      const readable = g.length <= 2 && worst <= MAX_DISTANCE
      return { x0, x1, cx: (x0 + x1) / 2, value: readable ? Number(text) : null, worst }
    })
    return { cy: r.cy, cells }
  })
}
