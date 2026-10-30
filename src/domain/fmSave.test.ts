import { describe, expect, it } from 'vitest'
import {
  ageAt, displayValue, FM_NATIONS, footFrom, isoDate, planSaveImport, SAVE_VALUES, saveFields, valueEuros, wageEuros, type SavePlayer,
} from './fmSave'
import { ALL_ATTRIBUTES } from './attributes'
import type { Player } from './types'

/** Héctor Fort dans la sauvegarde de test A (31 juillet 2026). */
function fort(overrides: Partial<SavePlayer> = {}): SavePlayer {
  const values = SAVE_VALUES.map(() => 50)
  values[SAVE_VALUES.indexOf('concentration')] = 46
  values[SAVE_VALUES.indexOf('leftFoot')] = 60
  values[SAVE_VALUES.indexOf('rightFoot')] = 100
  return {
    name: 'Héctor Fort',
    firstName: 'Héctor',
    lastName: 'Fort',
    birth: { day: 214, year: 2006 },
    nation: 170,
    positions: [1, 1, 18, 16, 20, 1, 10, 1, 12, 10, 1, 12, 1, 17, 19],
    values,
    contractEnd: { day: 181, year: 2031 },
    wage: 42951,
    value: 25_625_382,
    onLoan: false,
    hostClub: '',
    ...overrides,
  }
}

const today = { day: 212, year: 2026 }

describe('conversion des valeurs de la sauvegarde', () => {
  it('ramène l’échelle 1-100 à 1-20', () => {
    expect(displayValue(46)).toBe(9)
    expect(displayValue(48)).toBe(10)
    expect(displayValue(100)).toBe(20)
    expect(displayValue(1)).toBe(1)
  })

  it('lit les dates en jour de l’année', () => {
    expect(isoDate({ day: 181, year: 2031 })).toBe('2031-06-30')
    expect(isoDate({ day: 182, year: 2028 })).toBe('2028-06-30')
    expect(isoDate({ day: 83, year: 1995 })).toBe('1995-03-24')
  })

  it('calcule l’âge à la date du jeu', () => {
    expect(ageAt({ day: 214, year: 2006 }, today)).toBe(19)
    expect(ageAt({ day: 212, year: 2006 }, today)).toBe(20)
  })

  it('convertit le salaire en euros', () => {
    expect(wageEuros(42951)).toBe(50000)
    expect(wageEuros(7207)).toBe(8400)
    expect(wageEuros(0)).toBeNull()
  })

  it('convertit la valeur en euros (Oyarzábal : 64 427 392 £, fourchette du jeu 68-75 M€)', () => {
    expect(valueEuros(64_427_392)).toBe(75_000_000)
    expect(valueEuros(0)).toBe(0)
    expect(valueEuros(null)).toBeNull()
  })

  it('déduit le pied fort', () => {
    expect(footFrom(60, 100)).toBe('right')
    expect(footFrom(100, 40)).toBe('left')
    expect(footFrom(85, 100)).toBe('both')
  })

  it('a une valeur pour chaque attribut, une seule fois', () => {
    const keys = SAVE_VALUES.filter((k) => k && k !== 'leftFoot' && k !== 'rightFoot')
    expect(new Set(keys).size).toBe(keys.length)
    expect([...keys].sort()).toEqual([...ALL_ATTRIBUTES].sort())
  })

  it('n’a que des codes de drapeau valides', () => {
    expect(FM_NATIONS[170]).toBe('es')
    expect(FM_NATIONS[139]).toBe('gb-eng')
    expect(Object.values(FM_NATIONS).every((c) => /^[a-z]{2}(-[a-z]{3})?$/.test(c))).toBe(true)
  })

  it('convertit un joueur', () => {
    const f = saveFields(fort(), today)
    expect(f.age).toBe(19)
    expect(f.nationality).toBe('es')
    expect(f.foot).toBe('right')
    expect(f.attributes.concentration).toBe(9)
    expect(f.positions).toEqual({ DL: 18, DC: 16, DR: 20, ML: 10, MR: 12, AML: 10, AMR: 12, WBL: 17, WBR: 19 })
    expect(f.contractEnd).toBe('2031-06-30')
    expect(f.wage).toBe(50000)
    expect(f.club).toBe('')
  })

  it('garde le club d’accueil des joueurs prêtés', () => {
    const f = saveFields(fort({ onLoan: true, hostClub: 'Oviedo' }), today)
    expect(f.onLoan).toBe(true)
    expect(f.club).toBe('Oviedo')
  })
})

describe('plan d’import depuis la sauvegarde', () => {
  const club = { id: 4, name: 'Real Sociedad' }
  const existing: Player = {
    id: 12, name: 'Hector Fort', age: 19, nationality: 'es', clubId: 4, club: '', onLoan: false, foot: 'right',
    positions: { DR: 20 }, caStars: 3, paStars: 4.5, contractEnd: null, wage: 50000, value: 1e8, status: 'key',
    notes: 'note', attributes: { passing: 13 }, photo: 'data:x', photoLookup: 'Hector Fort',
  }

  it('met à jour un joueur connu sans perdre ce que la sauvegarde ne donne pas', () => {
    const plan = planSaveImport([fort()], [existing], club, today)
    expect(plan.actions).toHaveLength(1)
    const a = plan.actions[0]
    expect(a.kind).toBe('update')
    expect(a.player).toMatchObject({
      id: 12, name: 'Hector Fort', wage: 50000, value: 29_831_000, caStars: 3, status: 'key', notes: 'note', photo: 'data:x',
      contractEnd: '2031-06-30',
    })
    // valeur inconnue dans la sauvegarde : celle déjà enregistrée est gardée
    expect(planSaveImport([fort({ value: null })], [existing], club, today).actions[0].player.value).toBe(1e8)
    expect(a.player.attributes.concentration).toBe(9)
    expect(a.player.positions.WBR).toBe(19)
    expect(plan.missing).toEqual([])
  })

  it('crée les autres et signale les absents', () => {
    const other = { ...existing, id: 13, name: 'Mikel Goti', age: 24 }
    const plan = planSaveImport([fort({ name: 'Jon Martín' })], [existing, other], club, today)
    expect(plan.actions[0].kind).toBe('create')
    expect(plan.actions[0].player.clubId).toBe(4)
    expect(plan.actions[0].player.value).toBe(29_831_000)
    expect(plan.missing.map((p) => p.id)).toEqual([12, 13])
  })
})
