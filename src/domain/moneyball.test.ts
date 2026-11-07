import { describe, expect, it } from 'vitest'
import {
  AGE_BANDS, buildOutput, contractDays, DEFAULT_MONEYBALL_PARAMS, DEPTH_SHARE, evaluate, expectedScore, feeFactor, fitCurve, outputPoints, primaryPosition, reachOf,
  normalizeMoneyballParams, OUTPUT_WEIGHTS, rankMoneyball, readCurve, regress2, slotGain, squadClubIndex, statValue, withinReach, type MoneyballModel, type TeamSlot,
} from './moneyball'
import type { ScoutDb, ScoutPlayer } from './scouting'
import type { Player, RoleDefinition } from './types'

const TODAY = { day: 182, year: 2026 }
const ONES = { ...DEFAULT_MONEYBALL_PARAMS, weights: { gain: 1, surplus: 1, perf: 1, contract: 1 } }

/** Joueur de la base : postes dans l'ordre GK, SW, DL, DC, DR, DM, ML, MC, MR, AML, AMC, AMR, ST, WBL, WBR ; valeurs à 50 (10/20). */
function scout(over: Partial<ScoutPlayer> & { pos?: number }): ScoutPlayer {
  const positions = new Uint8Array(15).fill(1)
  positions[over.pos ?? 12] = 20
  return {
    index: 0, name: 'Joueur', birth: { day: 1, year: 2000 }, nationality: 'fr', positions, values: new Uint8Array(54).fill(50),
    club: 0, owner: -1, contractEnd: { day: 182, year: 2029 }, wage: 10_000, value: 5_000_000, avgRating: null, ratedMatches: 0, stats: null,
    ...over,
  }
}

describe('courbes', () => {
  it('suit les points et ne descend jamais', () => {
    const points = [1, 2, 3, 4, 5, 6, 7, 8].map((x) => ({ x, y: x === 5 ? 1 : x * 10 }))
    const curve = fitCurve(points, 1)
    for (let i = 1; i < curve.length; i++) expect(curve[i][1]).toBeGreaterThanOrEqual(curve[i - 1][1])
    expect(readCurve(curve, 8)).toBe(80)
    expect(readCurve(curve, 100)).toBe(80)
    expect(readCurve(curve, 0)).toBe(curve[0][1])
  })

  it('interpole entre deux points', () => {
    expect(readCurve([[0, 10], [10, 20]], 5)).toBe(15)
    expect(readCurve([], 5)).toBe(0)
  })
})

describe('coût et contrat', () => {
  it('réduit l\'indemnité quand le contrat se termine', () => {
    expect(contractDays({ day: 182, year: 2027 }, TODAY)).toBe(365)
    expect(contractDays(null, TODAY)).toBeNull()
    // fin de contrat inconnue : valeur entière, même sans club (club non décodé)
    expect(feeFactor(scout({ club: -1, contractEnd: null }), TODAY)).toBe(1)
    expect(feeFactor(scout({ contractEnd: { day: 100, year: 2026 } }), TODAY)).toBe(0)
    expect(feeFactor(scout({ contractEnd: { day: 300, year: 2026 } }), TODAY)).toBe(0.35)
    expect(feeFactor(scout({ contractEnd: { day: 100, year: 2027 } }), TODAY)).toBe(0.7)
    expect(feeFactor(scout({}), TODAY)).toBe(1)
  })
})

describe('gain d\'équipe', () => {
  it('compte le nouveau titulaire et, en partie, la nouvelle doublure', () => {
    // meilleur que le titulaire (70) : +5, et le titulaire devient doublure (60 → 70)
    expect(slotGain(75, { starter: 70, backup: 60 })).toBeCloseTo(5 + DEPTH_SHARE * 10)
    // entre les deux : seule la doublure progresse
    expect(slotGain(65, { starter: 70, backup: 60 })).toBeCloseTo(DEPTH_SHARE * 5)
    expect(slotGain(50, { starter: 70, backup: 60 })).toBe(0)
    // poste vide
    expect(slotGain(40, { starter: 0, backup: 0 })).toBe(40)
  })
})

describe('rendement', () => {
  const stats = (over: Partial<NonNullable<ScoutPlayer['stats']>> = {}): ScoutPlayer['stats'] => ({
    minutes: 1800, starts: 20, subs: 0, goals: 8, assists: 2, pom: 1, passes: 400, passesDone: 300, tackles: 20, tacklesWon: 10,
    dribbles: 20, shots: 40, shotsOnTarget: 15, xg: 8, xa: 2, ...over,
  })

  it('ramène les stats à 90 minutes', () => {
    const p = scout({ stats: stats(), avgRating: 6.9 })
    expect(statValue(p, 'xg')).toBeCloseTo(0.4)
    expect(statValue(p, 'goals')).toBeCloseTo(0.4)
    expect(statValue(p, 'passPct')).toBe(75)
    expect(statValue(p, 'rating')).toBe(6.9)
    // ligue sans stats détaillées : ni passes ni tirs, mais les buts restent connus
    const bare = scout({ stats: stats({ passes: 0, passesDone: 0, shots: 0, shotsOnTarget: 0, xg: 0 }) })
    expect(statValue(bare, 'xg')).toBeNull()
    expect(statValue(bare, 'passPct')).toBeNull()
    expect(statValue(bare, 'goals')).toBeCloseTo(0.4)
    expect(statValue(scout({}), 'xg')).toBeNull()
  })

  it('régression à deux variables', () => {
    const points = [[1, 2], [2, 1], [3, 5], [4, 3], [5, 4]].map(([x1, x2]) => ({ x1, x2, y: 1 + 2 * x1 - 0.5 * x2 }))
    const fit = regress2(points)!
    expect(fit.a).toBeCloseTo(1)
    expect(fit.b).toBeCloseTo(2)
    expect(fit.c).toBeCloseTo(-0.5)
    expect(regress2(points.map((q) => ({ ...q, x2: q.x1 })))).toBeNull()
  })

  it('compare la production à celle attendue pour la note et le niveau du club', () => {
    // attaquants : xG par 90 = 0,01 × note − 0,2 (+ bruit qui s'annule) ; les autres stats suivent la même pente
    const samples = Array.from({ length: 400 }, (_, i) => {
      const score = 40 + (i % 40)
      const noise = i % 2 ? 0.05 : -0.05
      const per90 = Math.max(0.01, 0.01 * score - 0.2 + noise)
      const n = (v: number) => (v * 1800) / 90
      const p = scout({
        index: i, avgRating: 6 + per90, stats: stats({ goals: n(per90), xg: n(per90), xa: n(per90 / 2), shotsOnTarget: n(per90 * 2), dribbles: n(per90 * 3) }),
      })
      return { p, group: 'att' as const, score, level: 60 + (i % 7) }
    })
    const model = buildOutput(samples)
    expect(model.fits.get('att')!.b).toBeGreaterThan(0)
    expect(model.fits.has('gk')).toBe(false)
    const at = (score: number, per90: number, minutes = 1800) => outputPoints(model, scout({
      avgRating: 6 + per90, stats: stats({ minutes, goals: (per90 * minutes) / 90, xg: (per90 * minutes) / 90, xa: (per90 * minutes) / 180, shotsOnTarget: (per90 * minutes) / 45, dribbles: (per90 * minutes) / 30 }),
    }), 'att', score, 63)
    // produit comme un joueur noté 70 : note 50 → au-dessus (plafonné), note 70 → ≈ 0, note 90 → en dessous
    expect(at(50, 0.5)!).toBeGreaterThan(8)
    expect(Math.abs(at(70, 0.5)!)).toBeLessThan(1.5)
    expect(at(90, 0.5)!).toBeLessThan(-8)
    // peu de minutes : écart réduit ; trop peu : inconnu
    expect(Math.abs(at(60, 0.5, 600)!)).toBeLessThan(Math.abs(at(60, 0.5)!))
    expect(at(60, 0.5, 300)).toBeNull()
  })
})
describe('évaluation', () => {
  const role: RoleDefinition = { id: 'st', name: 'Buteur', positions: ['ST'], weights: { finishing: 5 } }
  const slot: TeamSlot = {
    slotId: 'a', ip: { role, position: 'ST' }, oop: { role, position: 'ST' }, starter: 50, starterName: 'Titulaire', backup: 30,
  }
  // note 60 partout, marché : 40 pour 1 M€, 80 pour 100 M€ (log10 6 → 8)
  const model: MoneyballModel = {
    scores: new Float32Array([60]),
    market: { byGroup: new Map(), byLine: new Map([['att', [[6, 40], [8, 80]]]]), ageBands: AGE_BANDS },
    output: { norms: new Map(), fits: new Map(), weights: OUTPUT_WEIGHTS },
    clubLevels: new Float32Array([70, 80]),
  }
  const scorers = new Map([['st@ST', () => 60]])

  it('additionne gain, surplus et contrat', () => {
    // 1 M€ de valeur → note attendue 40, surplus 20
    const r = evaluate(scout({ value: 1_000_000, wage: 0 }), 26, model, [slot], scorers, TODAY, ONES)
    expect(r.slot?.slotId).toBe('a')
    expect(r.slotRating).toBe(60)
    expect(r.gain).toBeCloseTo(10 + DEPTH_SHARE * 20)
    expect(r.surplus).toBe(20)
    expect(r.contract).toBe(0)
    expect(r.fee).toBe(1_000_000)
    expect(r.score).toBeCloseTo(r.gain + 20)
    expect(r.perf).toBeNull() // pas de stats
  })

  it('donne un bonus de contrat quand l\'indemnité baisse', () => {
    const r = evaluate(scout({ value: 100_000_000, wage: 0, contractEnd: { day: 300, year: 2026 } }), 26, model, [slot], scorers, TODAY, ONES)
    expect(r.surplus).toBe(-20)
    expect(r.fee).toBe(35_000_000)
    // 35 M€ : log10 ≈ 7.54 → ≈ 70.9 ; bonus ≈ 9.1
    expect(r.contract).toBeCloseTo(80 - (40 + (Math.log10(35e6) - 6) * 20), 0)
  })

  it('poids nuls : le score ne compte que les critères gardés', () => {
    const r = evaluate(scout({ value: 1_000_000, wage: 0 }), 26, model, [slot], scorers, TODAY, { ...ONES, weights: { ...ONES.weights, gain: 0 } })
    expect(r.score).toBe(20)
  })

  it('applique les réglages : part de la doublure et réduction de contrat', () => {
    const params = { ...ONES, depthShare: 0, fee: { ...ONES.fee, short: 0.5 } }
    const r = evaluate(scout({ value: 100_000_000, wage: 0, contractEnd: { day: 300, year: 2026 } }), 26, model, [slot], scorers, TODAY, params)
    expect(r.gain).toBe(10)
    expect(r.fee).toBe(50_000_000)
  })

  it('classe sans réévaluer : poids et tri appliqués aux lignes déjà notées', () => {
    const a = evaluate(scout({ index: 0, name: 'B', value: 1_000_000, wage: 0 }), 26, model, [slot], scorers, TODAY, ONES)
    const b = { ...a, player: { ...a.player, index: 1, name: 'A' }, surplus: null }
    const byScore = rankMoneyball([b, a], { weights: ONES.weights, sort: 'score', limit: 10 })
    expect(byScore.rows.map((r) => r.player.name)).toEqual(['B', 'A'])
    // sans le surplus, les deux scores sont égaux : ordre de la base
    const noSurplus = rankMoneyball([b, a], { weights: { ...ONES.weights, surplus: 0 }, sort: 'score', limit: 10 })
    expect(noSurplus.rows.map((r) => r.player.index)).toEqual([0, 1])
    // valeur inconnue toujours en dernier, quel que soit le sens
    expect(rankMoneyball([b, a], { weights: ONES.weights, sort: 'surplus', desc: false, limit: 10 }).rows[1].player.name).toBe('A')
    expect(rankMoneyball([a, b], { weights: ONES.weights, sort: 'name', limit: 1 })).toMatchObject({ total: 2, rows: [{ player: { name: 'A' } }] })
  })

  it('réglages : garde les valeurs par défaut pour un réglage absent ou invalide et borne les autres', () => {
    expect(normalizeMoneyballParams(null)).toEqual(DEFAULT_MONEYBALL_PARAMS)
    const p = normalizeMoneyballParams({ depthShare: 3, minGain: 'x', weights: { gain: 2 }, ageBands: [30, 20, 20, 99], outputWeights: { att: { xg: 3, goals: -1 } } })
    expect(p.depthShare).toBe(1)
    expect(p.minGain).toBe(DEFAULT_MONEYBALL_PARAMS.minGain)
    expect(p.weights).toEqual({ ...DEFAULT_MONEYBALL_PARAMS.weights, gain: 2 })
    expect(p.ageBands).toEqual([20, 30])
    expect(p.outputWeights.att).toEqual({ xg: 3 })
    expect(p.outputWeights.gk).toEqual(DEFAULT_MONEYBALL_PARAMS.outputWeights.gk)
  })

  it('valeur à 0 € : inconnue (non calculée par le jeu), pas gratuite', () => {
    const r = evaluate(scout({ value: 0 }), 26, model, [slot], scorers, TODAY, ONES)
    expect(r.fee).toBeNull()
    expect(r.surplus).toBeNull()
    expect(r.contract).toBe(0)
    expect(r.score).toBeCloseTo(r.gain)
  })

  it('mode réaliste : club pas trop fort, joueur atteignable, prix et salaire dans les moyens', () => {
    const reach = { clubLevel: 75, level: 65, fee: 10e6, wage: 50_000 }
    const ok = (over: Partial<ScoutPlayer>, fee: number | null = 5e6) => withinReach(reach, { player: scout(over), fee }, model)
    expect(ok({ club: 0 })).toBe(true)
    expect(ok({ club: 1 })).toBe(false) // club de niveau 80
    expect(ok({ club: -1 })).toBe(true) // niveau de club inconnu
    expect(ok({}, 20e6)).toBe(false)
    expect(ok({}, null)).toBe(true) // valeur inconnue
    expect(ok({ wage: 80_000 })).toBe(false)
    expect(ok({ wage: null })).toBe(true)
    expect(withinReach({ ...reach, level: 55 }, { player: scout({}), fee: 5e6 }, model)).toBe(false) // note 60
  })

  it('lit le marché par ligne quand la tranche d\'âge manque', () => {
    expect(expectedScore(model.market, 'att', 19, 1e7)).toBe(60)
    expect(expectedScore(model.market, 'gk', 19, 1e7)).toBeNull()
  })
})

describe('club de l\'effectif', () => {
  it('trouve le club où sont la plupart des joueurs de l\'effectif', () => {
    const db = {
      clubs: [], players: [
        scout({ name: 'Á Un', club: 3 }), scout({ name: 'Deux', club: 3 }), scout({ name: 'Trois', club: 5, owner: 3 }),
        scout({ name: 'Quatre', club: 7 }),
      ],
    } as unknown as ScoutDb
    const squad = ['A Un', 'Deux', 'Trois', 'Quatre'].map((name) => ({ name, nationality: 'fr' }) as Player)
    expect(squadClubIndex(db, squad)).toBe(3)
    expect(squadClubIndex(db, squad.slice(0, 2))).toBe(-1)
  })

  it('plafonds du mode réaliste', () => {
    const squad = [{ value: 30e6, wage: 50_000 }, { value: 10e6, wage: 20_000 }, { value: null, wage: null }]
    expect(reachOf(new Float32Array([NaN, 72]), 1, squad)).toEqual({ clubLevel: 75, level: 84, fee: 20e6, wage: 60_000 })
    expect(reachOf(new Float32Array([NaN]), 0, [])).toEqual({ clubLevel: null, level: null, fee: null, wage: null })
  })

  it('poste principal : le plus familier', () => {
    expect(primaryPosition(scout({ pos: 3 }))).toBe('DC')
    expect(primaryPosition(scout({ positions: new Uint8Array(15).fill(1) }))).toBeNull()
  })
})
