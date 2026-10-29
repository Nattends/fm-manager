import type { Attributes, Club, NewPlayer, Player } from '../types'
import { nationCode } from '../nationalities'
import { normalizeText } from '../photoMatch'
import type { AttributeRow } from './attributes'
import type { IdentityRow } from './identity'
import { SQUAD_ATTRIBUTE_COLUMNS } from './squadColumns'

/** Un joueur reconstitué à partir des captures. */
export interface ReadPlayer {
  identity: IdentityRow
  /** Les 47 attributs, ou null si aucune ligne de la capture de droite ne correspond. */
  attributes: Attributes | null
  warnings: string[]
}

export interface SquadRead {
  players: ReadPlayer[]
  /** Lignes d'attributs sans identité correspondante (capture de gauche manquante). */
  orphanAttributeRows: number
}

const identityKey = (r: IdentityRow) => `${normalizeText(r.name)}|${r.age ?? ''}|${normalizeText(r.club)}`

/** Rapproche les lignes d'identité et les lignes d'attributs (communes : les 8 premiers attributs). */
export function buildSquad(identities: IdentityRow[], attributeRows: AttributeRow[]): SquadRead {
  // Les captures se recouvrent : on garde une seule fois chaque joueur / chaque ligne.
  const seen = new Set<string>()
  const ids = identities.filter((r) => {
    const k = identityKey(r)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const seenRows = new Set<string>()
  const rows = attributeRows.filter((r) => {
    const k = r.values.join(',')
    if (seenRows.has(k)) return false
    seenRows.add(k)
    return true
  })

  const used = new Set<AttributeRow>()
  const players = ids.map((identity): ReadPlayer => {
    const warnings = [...identity.warnings]
    const matches = rows.filter(
      (r) => !used.has(r) && identity.firstAttributes.every((v, i) => v === null || r.values[i] === null || v === r.values[i]),
    )
    if (matches.length === 0) {
      warnings.push('noAttributes')
      return { identity, attributes: null, warnings }
    }
    if (matches.length > 1) warnings.push('ambiguousAttributes')
    const row = matches[0]
    used.add(row)
    const attributes: Attributes = {}
    row.values.forEach((v, i) => {
      if (v !== null) attributes[SQUAD_ATTRIBUTE_COLUMNS[i]] = v
    })
    if (row.values.some((v) => v === null)) warnings.push('unreadableCells')
    return { identity, attributes, warnings }
  })
  return { players, orphanAttributeRows: rows.length - used.size }
}

/** Clubs présents dans les lignes lues (hors joueurs prêtés), avec leur nombre de joueurs. */
export function clubsRead(players: ReadPlayer[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of players) {
    const name = p.identity.club
    if (name && !p.identity.playing.onLoan) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

/**
 * Club géré par défaut : l'équipe première, c'est-à-dire le nom que portent les équipes réserves
 * (« Real San Sebastián » pour « Real San Sebastián B »). À défaut, le club le plus fréquent.
 */
export function managedClubName(players: ReadPlayer[]): string {
  const clubs = clubsRead(players)
  const names = clubs.map((c) => normalizeText(c.name))
  const main = clubs.find((_, i) => names.some((other, j) => j !== i && other.startsWith(`${names[i]} `)))
  return (main ?? clubs[0])?.name ?? ''
}

/** Distance d'édition de Levenshtein (noms courts). */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length][b.length]
}

/** Joueur existant correspondant à un nom lu (l'OCR se trompe parfois sur les accents). */
export function findExisting(name: string, age: number | null, existing: Player[], taken: Set<number>): Player | null {
  const n = normalizeText(name)
  if (!n) return null
  const candidates = existing.filter((p) => !taken.has(p.id) && (age === null || Math.abs(p.age - age) <= 1))
  const exact = candidates.find((p) => normalizeText(p.name) === n)
  if (exact) return exact
  let best: { p: Player; d: number } | null = null
  for (const p of candidates) {
    const d = editDistance(normalizeText(p.name), n)
    const tolerance = Math.max(1, Math.round(n.length * 0.18))
    if (d <= tolerance && (!best || d < best.d)) best = { p, d }
  }
  return best?.p ?? null
}

export type ImportAction =
  | { kind: 'create'; player: NewPlayer; read: ReadPlayer }
  | { kind: 'update'; player: NewPlayer; read: ReadPlayer; existing: Player }

export interface ImportPlan {
  actions: ImportAction[]
  /** Joueurs de l'application absents des captures (laissés tels quels). */
  missing: Player[]
  /** Lignes ignorées (autre club : équipe B, etc.). */
  skipped: number
  clubName: string
}

/** Construit les écritures à faire : mises à jour des joueurs connus, créations des autres. */
export function planImport(read: SquadRead, existing: Player[], club: Club, chosenClub?: string): ImportPlan {
  const clubName = chosenClub ?? managedClubName(read.players)
  const taken = new Set<number>()
  const actions: ImportAction[] = []
  let skipped = 0
  for (const rp of read.players) {
    const id = rp.identity
    // l'OCR confond parfois une lettre accentuée : un écart d'une lettre ne change pas de club
    const sameClub = editDistance(normalizeText(id.club), normalizeText(clubName)) <= 1
    if (!sameClub && !id.playing.onLoan) {
      skipped++
      continue
    }
    const found = findExisting(id.name, id.age, existing, taken)
    const nationality = nationCode(id.nationality)
    if (found) {
      taken.add(found.id)
      const player: NewPlayer = {
        ...found,
        age: id.age ?? found.age,
        nationality: nationality ?? found.nationality,
        foot: id.foot ?? found.foot,
        onLoan: id.playing.onLoan,
        club: id.playing.onLoan ? id.club : found.club,
        caStars: id.caStars || found.caStars,
        paStars: id.paStars || found.paStars,
        contractEnd: id.contractEnd ?? found.contractEnd,
        wage: id.wage ?? found.wage,
        value: id.value ?? found.value,
        attributes: { ...found.attributes, ...rp.attributes },
      }
      actions.push({ kind: 'update', player, read: rp, existing: found })
    } else {
      const player: NewPlayer = {
        name: id.name,
        age: id.age ?? 25,
        nationality: nationality ?? '',
        clubId: club.id,
        club: id.playing.onLoan ? id.club : '',
        onLoan: id.playing.onLoan,
        foot: id.foot ?? 'right',
        positions: {},
        caStars: id.caStars || 2.5,
        paStars: id.paStars || 3,
        contractEnd: id.contractEnd,
        wage: id.wage,
        value: id.value,
        status: id.playing.status,
        notes: '',
        attributes: rp.attributes ?? {},
      }
      actions.push({ kind: 'create', player, read: rp })
    }
  }
  const missing = existing.filter((p) => !taken.has(p.id) && p.clubId === club.id)
  return { actions, missing, skipped, clubName }
}

