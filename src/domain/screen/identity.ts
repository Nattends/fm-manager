import type { Foot } from '../types'
import type { Bitmap } from './bitmap'
import { readDigitRows } from './digits'
import { parseAge, parseContractEnd, parseFoot, parseMoney, parsePlayingTime, parseValueRange, type PlayingTime } from './fmText'
import { OVERLAP_COLUMNS } from './squadColumns'
import { readStars } from './stars'

/** Un mot reconnu par l'OCR, avec son rectangle en pixels de l'image. */
export interface OcrWord {
  t: string
  x: number
  y: number
  w: number
  h: number
}

/** Une ligne de la capture « identité » (colonnes Club à Valeur, plus les premiers attributs). */
export interface IdentityRow {
  cy: number
  name: string
  club: string
  age: number | null
  nationality: string
  foot: Foot | null
  playing: PlayingTime
  contractEnd: string | null
  wage: number | null
  /** Milieu de la fourchette de valeur marchande. */
  value: number | null
  caStars: number
  paStars: number
  /** Les premiers attributs, communs avec la capture de droite (null : cellule illisible). */
  firstAttributes: (number | null)[]
  /** Points à faire vérifier à l'utilisateur. */
  warnings: string[]
}

export interface IdentityCapture {
  rows: IdentityRow[]
  /** Problèmes bloquants (en-têtes introuvables, etc.). */
  errors: string[]
}

const cy = (w: OcrWord) => w.y + w.h / 2

/** Position (x) des en-têtes de colonnes, dans la ligne d'en-tête du tableau. */
function findHeaders(words: OcrWord[]): { y: number; x: Record<string, number> } | null {
  const age = words.find((w) => w.t === 'Age')
  if (!age) return null
  const row = words.filter((w) => Math.abs(cy(w) - cy(age)) < 8)
  const at = (re: RegExp) => row.find((w) => re.test(w.t))?.x
  const x = {
    club: at(/^Club$/), player: at(/^Player$/), age: age.x, nation: at(/^Nation$/), foot: at(/^Preferred$/),
    playing: at(/^Playing$/), ability: at(/^Ability$/), potential: at(/^Potential$/), expires: at(/^Expires$/),
    wage: at(/^Wage$/), value: at(/^Transfer$/), attributes: at(/^Cr/),
  }
  if (Object.values(x).some((v) => v === undefined)) return null
  return { y: cy(age), x: x as Record<string, number> }
}

/** Vrai si la capture montre les colonnes d'identité (nom, âge, contrat…), donc la partie gauche du tableau. */
export function isIdentityCapture(words: OcrWord[]): boolean {
  return findHeaders(words) !== null
}

/** Lit une capture de la partie gauche du tableau (noms visibles). */
export function readIdentityCapture(bmp: Bitmap, words: OcrWord[]): IdentityCapture {
  const headers = findHeaders(words)
  if (!headers) return { rows: [], errors: ['headers'] }
  const h = headers.x
  const digitRows = readDigitRows(bmp, [h.attributes - 25, headers.y + 25, bmp.width - 40, Math.round(bmp.height * 0.93)])
  const rows: IdentityRow[] = []
  for (const dr of digitRows) {
    if (dr.cells.length !== OVERLAP_COLUMNS) continue
    const inRow = words.filter((w) => Math.abs(cy(w) - dr.cy) < 14)
    const col = (from: number, to: number) =>
      inRow.filter((w) => w.x >= from && w.x < to).sort((a, b) => a.x - b.x).map((w) => w.t).join(' ')
    const warnings: string[] = []
    const name = col(h.player + 55, h.age - 10)
    const age = parseAge(col(h.age - 10, h.nation - 10))
    const contract = parseContractEnd(col(h.expires - 5, h.wage - 10))
    if (contract?.ambiguous) warnings.push('contractEnd')
    const valueText = col(h.value - 5, h.attributes - 20)
    const range = parseValueRange(valueText)
    const wage = parseMoney(col(h.wage - 10, h.value - 5))
    if (!name) warnings.push('name')
    if (age === null) warnings.push('age')
    if (wage === null) warnings.push('wage')
    if (!range) warnings.push('value')
    if (/[^\p{L}\s'.-]/u.test(name)) warnings.push('nameChars')
    rows.push({
      cy: dr.cy,
      name,
      club: col(h.club + 20, h.player - 5),
      age,
      nationality: col(h.nation + 20, h.foot - 10),
      foot: parseFoot(col(h.foot - 10, h.playing - 10)),
      playing: parsePlayingTime(col(h.playing - 10, h.ability - 5)),
      contractEnd: contract?.iso ?? null,
      wage,
      value: range ? Math.round((range.low + range.high) / 2) : null,
      caStars: readStars(bmp, h.ability - 5, h.potential - 10, Math.round(dr.cy)),
      paStars: readStars(bmp, h.potential - 5, h.expires - 10, Math.round(dr.cy)),
      firstAttributes: dr.cells.map((c) => c.value),
      warnings,
    })
  }
  return { rows, errors: rows.length ? [] : ['noRows'] }
}
