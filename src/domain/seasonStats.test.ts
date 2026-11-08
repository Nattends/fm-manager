import { describe, expect, it } from 'vitest'
import { SAVE_POSITIONS, SAVE_VALUES } from './fmSave'
import { searchScouts, type ScoutDb, type ScoutFilters, type ScoutPlayer, type SeasonStats } from './scouting'
import { seasonStat } from './seasonStats'
import { PERCENTILE_MIN_SAMPLE, statPercentile } from './statPercentiles'

const ST = Uint8Array.from(SAVE_POSITIONS, (p) => (p === 'ST' ? 20 : 1))
const DC = Uint8Array.from(SAVE_POSITIONS, (p) => (p === 'DC' ? 20 : 1))

function stats(s: Partial<SeasonStats>): SeasonStats {
  return {
    minutes: 900, starts: 10, subs: 0, goals: 0, assists: 0, pom: 0, passes: 0, passesDone: 0,
    tackles: 0, tacklesWon: 0, dribbles: 0, shots: 0, shotsOnTarget: 0, xg: 0, xa: 0, extended: true,
    fouls: 0, fouled: 0, aerials: 0, aerialsWon: 0, offsides: 0, crosses: 0, crossesDone: 0, saves: 0, conceded: 0, ...s,
  }
}
let next = 0
function scout(s: SeasonStats | null, positions = ST): ScoutPlayer {
  const index = next++
  return {
    index, name: `J${index}`, birth: { day: 100, year: 2000 }, nationality: 'fr', positions,
    values: Uint8Array.from(SAVE_VALUES, () => 50), club: -1, owner: -1, contractEnd: null, wage: null, value: null,
    avgRating: null, ratedMatches: 0, stats: s,
  }
}

describe('stats de la saison', () => {
  it('valeurs par 90, pourcentages et écart aux buts attendus', () => {
    const p = scout(stats({ minutes: 1800, goals: 10, xg: 8, shots: 40, shotsOnTarget: 20, passes: 400, passesDone: 300, starts: 18, subs: 2 }))
    expect(seasonStat(p, 'goals90')).toBeCloseTo(0.5)
    expect(seasonStat(p, 'xg90')).toBeCloseTo(0.4)
    expect(seasonStat(p, 'xgDiff')).toBeCloseTo(2)
    expect(seasonStat(p, 'shotAccuracy')).toBe(50)
    expect(seasonStat(p, 'conversion')).toBe(25)
    expect(seasonStat(p, 'xgPerShot')).toBeCloseTo(0.2)
    expect(seasonStat(p, 'passPct')).toBe(75)
    expect(seasonStat(p, 'apps')).toBe(20)
  })

  it('inconnues sans minutes, sans stats détaillées ou avec trop peu de tirs', () => {
    expect(seasonStat(scout(null), 'goals')).toBeNull()
    const bare = scout(stats({ goals: 3 }))
    expect(seasonStat(bare, 'goals')).toBe(3)
    expect(seasonStat(bare, 'xg90')).toBeNull()
    expect(seasonStat(scout(stats({ shots: 5, goals: 2, passes: 50 })), 'conversion')).toBeNull()
  })

  it('stats étendues : duels, gardiens, bases anciennes', () => {
    const p = scout(stats({ passes: 300, aerials: 40, aerialsWon: 30, fouls: 10 }), DC)
    expect(seasonStat(p, 'aerialWinPct')).toBe(75)
    expect(seasonStat(p, 'aerialsWon90')).toBeCloseTo(3)
    expect(seasonStat(p, 'fouls90')).toBeCloseTo(1)
    // joueur de champ : pas de stats de gardien
    expect(seasonStat(p, 'conceded90')).toBeNull()
    const gk = scout(stats({ passes: 300, saves: 30, conceded: 10 }))
    expect(seasonStat(gk, 'savePct')).toBe(75)
    expect(seasonStat(gk, 'conceded90')).toBeCloseTo(1)
    // base lue avant la v0.25 : inconnues
    expect(seasonStat(scout(stats({ passes: 300, aerials: 40, aerialsWon: 30, extended: false })), 'aerialWinPct')).toBeNull()
  })

  it('percentile inversé quand moins = mieux', () => {
    const keepers = Array.from({ length: PERCENTILE_MIN_SAMPLE + 10 }, (_, i) => scout(stats({ passes: 100, saves: 20, conceded: i + 1 })))
    const db: ScoutDb = { refreshedAt: new Date(0), savePath: '', gameDate: null, clubs: [], players: keepers }
    expect(statPercentile(db, keepers[0], 'conceded90')).toBe(99)
    expect(statPercentile(db, keepers[0], 'savePct')).toBe(99)
  })

  it('percentile parmi les joueurs du même groupe de postes', () => {
    const strikers = Array.from({ length: PERCENTILE_MIN_SAMPLE + 10 }, (_, i) => scout(stats({ goals: i, shots: 50, passes: 100 })))
    const defender = scout(stats({ goals: 100, shots: 50, passes: 100 }), DC)
    const db: ScoutDb = { refreshedAt: new Date(0), savePath: '', gameDate: null, clubs: [], players: [...strikers, defender] }
    expect(statPercentile(db, strikers[0], 'goals90')).toBe(1)
    expect(statPercentile(db, strikers.at(-1)!, 'goals90')).toBe(99)
    // le défenseur n'a pas d'échantillon assez grand dans son groupe
    expect(statPercentile(db, defender, 'goals90')).toBeNull()
  })

  it('tri par stat et minimum de minutes dans la recherche', () => {
    const a = scout(stats({ minutes: 2000, goals: 10 }))
    const b = scout(stats({ minutes: 500, goals: 8 }))
    const c = scout(null)
    const db: ScoutDb = { refreshedAt: new Date(0), savePath: '', gameDate: null, clubs: [], players: [a, b, c] }
    const base: ScoutFilters = {
      search: '', positions: [], role: null, roles: [], minAge: null, maxAge: null, minWage: null, maxWage: null,
      minValue: null, maxValue: null, nationality: null, club: '', clubNation: null, hideLoaned: false, sort: 'goals90', limit: 10,
    }
    const today = { day: 1, year: 2027 }
    expect(searchScouts(db, base, today).rows.map((r) => r.player.name)).toEqual([b.name, a.name, c.name])
    expect(searchScouts(db, { ...base, minMinutes: 900 }, today).rows.map((r) => r.player.name)).toEqual([a.name])
  })
})
