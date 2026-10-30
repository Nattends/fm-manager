import { describe, expect, it } from 'vitest'
import { SAVE_VALUES, todayGameDate } from './fmSave'
import { decodeScouting, rateScout, scoutAsPlayer, searchScouts, type ScoutFilters } from './scouting'
import type { RoleDefinition } from './types'

interface Fake {
  name: string
  birthYear: number
  nation: number
  club: number
  owner?: number
  /** Salaire hebdomadaire en livres. */
  wage?: number
  /** Valeur de transfert en livres (absente = inconnue). */
  value?: number
  /** Notes de la saison : somme des notes×10 et matchs. */
  ratings?: [number, number]
  /** Familiarités brutes, dans l'ordre GK, SW, DL, DC, DR, DM, ML, MC, MR, AML, AMC, AMR, ST, WBL, WBR. */
  positions: number[]
  finishing: number
}

/** Même format que `scouting_snapshot` (src-tauri/src/fm_save.rs) ; `FMS3` = sans les notes, `FMS2` = sans la valeur non plus. */
function encode(clubs: [string, number][], players: Fake[], magic: 'FMS2' | 'FMS3' | 'FMS4' = 'FMS4'): Uint8Array {
  const out: number[] = []
  const u16 = (v: number) => out.push(v & 255, (v >> 8) & 255)
  const u32 = (v: number) => out.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255)
  const text16 = (s: string) => { const b = new TextEncoder().encode(s); u16(b.length); out.push(...b) }
  out.push(...new TextEncoder().encode(magic))
  for (let i = 0; i < 8; i++) out.push(0)
  text16('C:/save.fm')
  u16(228); u16(2026)
  u32(clubs.length)
  for (const [name, nation] of clubs) { u16(nation); text16(name) }
  u32(players.length)
  for (const p of players) {
    out.push(...p.positions)
    out.push(...SAVE_VALUES.map((k) => (k === 'finishing' ? p.finishing : 50)))
    u16(100); u16(p.birthYear)
    u16(p.nation)
    u32(p.club)
    u32(p.owner ?? 0xffffffff)
    u16(181); u16(2029)
    u32(p.wage ?? 0)
    if (magic !== 'FMS2') u32(p.value ?? 0xffffffff)
    if (magic === 'FMS4') { u16(p.ratings?.[0] ?? 0); out.push(p.ratings?.[1] ?? 0) }
    const b = new TextEncoder().encode(p.name)
    out.push(b.length, ...b)
  }
  return new Uint8Array(out)
}

const ST = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 20, 1, 1]
const DC = [1, 1, 1, 20, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
const CLUBS: [string, number][] = [['Real Sociedad', 170], ['Feyenoord', 158]]
const FAKES: Fake[] = [
  { name: 'Mikel Oyarzábal', birthYear: 1997, nation: 170, club: 0, positions: ST, finishing: 85, wage: 37043, value: 64_427_392, ratings: [610, 9] },
  { name: 'Orri Óskarsson', birthYear: 2004, nation: 148, club: 0, positions: ST, finishing: 70, wage: 42951, value: 71_604_775, ratings: [476, 7] },
  { name: 'Igor Zubeldia', birthYear: 1997, nation: 170, club: 0, positions: DC, finishing: 20, value: 29_765_456 },
  { name: 'Javi López', birthYear: 2002, nation: 170, club: 1, owner: 0, positions: DC, finishing: 25, wage: 26_640, value: 7_300_000 },
  { name: 'Agent Libre', birthYear: 1990, nation: 143, club: 0xffffffff, positions: ST, finishing: 60, value: 0 },
]
const bytes = encode(CLUBS, FAKES)
const finisher: RoleDefinition = { id: 'r', name: 'Finisseur', positions: ['ST'], weights: { finishing: 5 } }
const base: ScoutFilters = {
  search: '', positions: [], role: null, roles: [], minAge: null, maxAge: null, minWage: null, maxWage: null, minValue: null, maxValue: null,
  nationality: null, club: '', clubNation: null, hideLoaned: false, sort: 'name', limit: 100,
}
const stopper: RoleDefinition = { id: 's', name: 'Stoppeur', positions: ['DC'], weights: { finishing: 1, marking: 5 } }

describe('base de scouting', () => {
  const db = decodeScouting(bytes)!

  it('décode clubs et joueurs', () => {
    expect(db.gameDate).toEqual({ day: 228, year: 2026 })
    expect(db.savePath).toBe('C:/save.fm')
    expect(db.clubs).toEqual([{ name: 'Real Sociedad', nation: 'es' }, { name: 'Feyenoord', nation: 'nl' }])
    expect(db.players).toHaveLength(5)
    const javi = db.players[3]
    expect(javi).toMatchObject({ name: 'Javi López', nationality: 'es', club: 1, owner: 0, contractEnd: { day: 181, year: 2029 } })
    expect(db.players[4].club).toBe(-1)
  })

  it('refuse un autre format', () => {
    expect(decodeScouting(new Uint8Array())).toBeNull()
    expect(decodeScouting(new TextEncoder().encode('autre chose'))).toBeNull()
  })

  it('note comme pour l’effectif, avec la pénalité hors poste', () => {
    expect(rateScout(db.players[0], finisher).score).toBeGreaterThan(rateScout(db.players[1], finisher).score)
    const outOfPosition = rateScout(db.players[2], finisher)
    expect(outOfPosition.familiarityFactor).toBe(0.5)
  })

  it('filtre et classe par note', () => {
    const today = db.gameDate!
    const { rows, total } = searchScouts(db, { ...base, positions: ['ST'], role: finisher, sort: 'rating' }, today)
    expect(total).toBe(3)
    expect(rows.map((r) => r.player.name)).toEqual(['Mikel Oyarzábal', 'Orri Óskarsson', 'Agent Libre'])
    expect(searchScouts(db, { ...base, maxAge: 25 }, today).rows.map((r) => r.player.name)).toEqual(['Javi López', 'Orri Óskarsson'])
    expect(searchScouts(db, { ...base, nationality: 'is' }, today).total).toBe(1)
    expect(searchScouts(db, { ...base, search: 'oskar' }, today).total).toBe(1)
    expect(searchScouts(db, { ...base, club: 'feye' }, today).rows[0].player.name).toBe('Javi López')
    expect(searchScouts(db, { ...base, clubNation: 'nl' }, today).rows.map((r) => r.player.name)).toEqual(['Javi López'])
    expect(searchScouts(db, { ...base, club: 'lib' }, today, 'Libre').rows[0].player.name).toBe('Agent Libre')
    expect(searchScouts(db, { ...base, limit: 2 }, today)).toMatchObject({ total: 5 })
  })

  it('donne la meilleure note par défaut, identique au calcul détaillé', () => {
    const today = db.gameDate!
    const { rows } = searchScouts(db, { ...base, roles: [finisher, stopper], sort: 'rating' }, today)
    expect(rows[0].player.name).toBe('Mikel Oyarzábal')
    expect(rows[0].ratedRole?.id).toBe('r')
    for (const r of rows) {
      expect(r.rating?.score).toBe(rateScout(r.player, r.ratedRole!).score)
      // seuls les rôles des postes connus du joueur comptent
      expect(r.ratedRole?.positions.some((p) => r.player.positions[p === 'ST' ? 12 : 3] > 1)).toBe(true)
    }
    const zub = rows.find((r) => r.player.name === 'Igor Zubeldia')
    expect(zub?.ratedRole?.id).toBe('s')
  })

  it('lit le salaire et trie par salaire', () => {
    expect(db.players[1].wage).toBe(50000)
    expect(db.players[2].wage).toBeNull()
    const { rows } = searchScouts(db, { ...base, sort: 'wage' }, db.gameDate!)
    expect(rows.slice(0, 2).map((r) => r.player.name)).toEqual(['Orri Óskarsson', 'Mikel Oyarzábal'])
  })

  it('lit la valeur, filtre et trie par salaire et par valeur', () => {
    const today = db.gameDate!
    expect(db.players[0].value).toBe(75_000_000)
    expect(db.players[4].value).toBe(0)
    const names = (f: Partial<ScoutFilters>) => searchScouts(db, { ...base, ...f }, today).rows.map((r) => r.player.name)
    expect(names({ sort: 'value' }).slice(0, 2)).toEqual(['Orri Óskarsson', 'Mikel Oyarzábal'])
    expect(names({ minValue: 30e6, maxValue: 80e6 })).toEqual(['Igor Zubeldia', 'Mikel Oyarzábal'])
    // l'agent libre (valeur 0) passe une borne maximale
    expect(names({ maxValue: 10e6 })).toEqual(['Agent Libre', 'Javi López'])
    // salaire inconnu (Zubeldia, l'agent libre) : écarté dès qu'une borne est donnée
    expect(names({ maxWage: 45_000 })).toEqual(['Javi López', 'Mikel Oyarzábal'])
    expect(names({ minWage: 45_000 })).toEqual(['Orri Óskarsson'])
  })

  it('lit la note moyenne de la saison et trie par note moyenne', () => {
    expect(db.players[0]).toMatchObject({ avgRating: 6.78, ratedMatches: 9 })
    expect(db.players[2]).toMatchObject({ avgRating: null, ratedMatches: 0 })
    const { rows } = searchScouts(db, { ...base, sort: 'avgRating' }, db.gameDate!)
    expect(rows.slice(0, 2).map((r) => r.player.name)).toEqual(['Orri Óskarsson', 'Mikel Oyarzábal'])
    expect(scoutAsPlayer(db.players[0], db, db.gameDate!)).toMatchObject({ avgRating: 6.78, ratedMatches: 9 })
    // base de la v0.15 (FMS3) : pas de notes
    expect(decodeScouting(encode(CLUBS, FAKES, 'FMS3'))!.players.every((p) => p.avgRating === null)).toBe(true)
  })

  it('lit encore les bases au format précédent (sans valeur)', () => {
    const old = decodeScouting(encode(CLUBS, FAKES, 'FMS2'))!
    expect(old.players).toHaveLength(5)
    expect(old.players[3]).toMatchObject({ name: 'Javi López', value: null, wage: 31000 })
    expect(old.players.every((p) => p.value === null)).toBe(true)
  })

  it('filtre plusieurs postes et masque les prêtés', () => {
    const today = db.gameDate!
    expect(searchScouts(db, { ...base, positions: ['ST', 'DC'] }, today).total).toBe(5)
    expect(searchScouts(db, { ...base, positions: ['DC'], roles: [finisher, stopper] }, today).rows.every((r) => r.ratedRole?.id === 's')).toBe(true)
    expect(searchScouts(db, { ...base, hideLoaned: true }, today).rows.map((r) => r.player.name)).not.toContain('Javi López')
  })

  it('présente un joueur de la base comme un joueur de l’application', () => {
    const p = scoutAsPlayer(db.players[3], db, db.gameDate!)
    expect(p).toMatchObject({ name: 'Javi López', age: 24, nationality: 'es', club: 'Feyenoord', onLoan: true, positions: { DC: 20 } })
    expect(p.attributes.finishing).toBe(5)
  })
})

describe('date du jour', () => {
  it('donne le jour de l’année', () => {
    expect(todayGameDate(new Date(2026, 0, 1))).toEqual({ day: 1, year: 2026 })
    expect(todayGameDate(new Date(2026, 9, 30))).toEqual({ day: 303, year: 2026 })
  })
})
