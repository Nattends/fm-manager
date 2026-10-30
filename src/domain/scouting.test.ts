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
  /** Familiarités brutes, dans l'ordre GK, SW, DL, DC, DR, DM, ML, MC, MR, AML, AMC, AMR, ST, WBL, WBR. */
  positions: number[]
  finishing: number
}

/** Même format que `scouting_snapshot` (src-tauri/src/fm_save.rs). */
function encode(clubs: [string, number][], players: Fake[]): Uint8Array {
  const out: number[] = []
  const u16 = (v: number) => out.push(v & 255, (v >> 8) & 255)
  const u32 = (v: number) => out.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255)
  const text16 = (s: string) => { const b = new TextEncoder().encode(s); u16(b.length); out.push(...b) }
  out.push(...new TextEncoder().encode('FMS1'))
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
    const b = new TextEncoder().encode(p.name)
    out.push(b.length, ...b)
  }
  return new Uint8Array(out)
}

const ST = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 20, 1, 1]
const DC = [1, 1, 1, 20, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
const bytes = encode([['Real Sociedad', 170], ['Feyenoord', 158]], [
  { name: 'Mikel Oyarzábal', birthYear: 1997, nation: 170, club: 0, positions: ST, finishing: 85 },
  { name: 'Orri Óskarsson', birthYear: 2004, nation: 148, club: 0, positions: ST, finishing: 70 },
  { name: 'Igor Zubeldia', birthYear: 1997, nation: 170, club: 0, positions: DC, finishing: 20 },
  { name: 'Javi López', birthYear: 2002, nation: 170, club: 1, owner: 0, positions: DC, finishing: 25 },
  { name: 'Agent Libre', birthYear: 1990, nation: 143, club: 0xffffffff, positions: ST, finishing: 60 },
])
const finisher: RoleDefinition = { id: 'r', name: 'Finisseur', positions: ['ST'], weights: { finishing: 5 } }
const base: ScoutFilters = { search: '', position: null, role: null, minAge: null, maxAge: null, nationality: null, club: '', sort: 'name', limit: 100 }

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
    const { rows, total } = searchScouts(db, { ...base, position: 'ST', role: finisher, sort: 'rating' }, today)
    expect(total).toBe(3)
    expect(rows.map((r) => r.player.name)).toEqual(['Mikel Oyarzábal', 'Orri Óskarsson', 'Agent Libre'])
    expect(searchScouts(db, { ...base, maxAge: 25 }, today).rows.map((r) => r.player.name)).toEqual(['Javi López', 'Orri Óskarsson'])
    expect(searchScouts(db, { ...base, nationality: 'is' }, today).total).toBe(1)
    expect(searchScouts(db, { ...base, search: 'oskar' }, today).total).toBe(1)
    expect(searchScouts(db, { ...base, club: 'feye' }, today).rows[0].player.name).toBe('Javi López')
    expect(searchScouts(db, { ...base, club: 'lib' }, today, 'Libre').rows[0].player.name).toBe('Agent Libre')
    expect(searchScouts(db, { ...base, limit: 2 }, today)).toMatchObject({ total: 5 })
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
