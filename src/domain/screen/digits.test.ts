import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import type { AttributeKey } from '../attributes'
import { readAttributeCapture } from './attributes'
import type { Bitmap } from './bitmap'
import { SQUAD_ATTRIBUTE_COLUMNS, SQUAD_ATTRIBUTE_COUNT } from './squadColumns'

export function loadFixture(name: string): Bitmap {
  const png = PNG.sync.read(fs.readFileSync(path.join(__dirname, 'fixtures', name)))
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }
}

/** Valeurs affichées dans le jeu pour quelques joueurs (relevées à la main par l'utilisateur). */
const KNOWN: Record<string, { fixture: string; row: number; values: Partial<Record<AttributeKey, number>> }> = {
  Remiro: {
    fixture: 'right-top.png', row: 3,
    values: {
      firstTouch: 11, passing: 17, freeKick: 7, penaltyTaking: 4, technique: 16, aggression: 7, anticipation: 12,
      flair: 5, offTheBall: 1, agility: 14, aerialReach: 14, commandOfArea: 15, communication: 13, eccentricity: 8,
      handling: 15, kicking: 15, punching: 11, oneOnOnes: 13, reflexes: 16, rushingOut: 12, throwing: 13, workRate: 13,
    },
  },
  Zubeldia: {
    fixture: 'right-top.png', row: 8,
    values: {
      crossing: 11, dribbling: 12, finishing: 12, firstTouch: 12, heading: 13, marking: 14, tackling: 14, corners: 9,
      longThrows: 8, aggression: 15, anticipation: 15, teamwork: 16, workRate: 15, acceleration: 10, stamina: 15, strength: 15,
    },
  },
  Zakharyan: {
    fixture: 'right-bottom.png', row: 2,
    values: {
      crossing: 11, finishing: 13, heading: 6, marking: 8, tackling: 5, technique: 15, corners: 14, longThrows: 4,
      penaltyTaking: 13, flair: 15, offTheBall: 14, vision: 16, naturalFitness: 7, strength: 9,
    },
  },
  Fort: {
    fixture: 'right-bottom.png', row: 4,
    values: {
      crossing: 12, finishing: 9, heading: 10, longShots: 9, marking: 11, corners: 6, longThrows: 11, penaltyTaking: 7,
      aggression: 16, determination: 18, leadership: 8, naturalFitness: 16, stamina: 13, strength: 13,
    },
  },
}

describe('lecture des attributs du tableau', () => {
  const top = readAttributeCapture(loadFixture('right-top.png'))
  const bottom = readAttributeCapture(loadFixture('right-bottom.png'))

  it('retrouve 47 cellules lisibles par ligne', () => {
    for (const rows of [top, bottom]) {
      expect(rows.length).toBeGreaterThanOrEqual(20)
      for (const r of rows) {
        expect(r.values).toHaveLength(SQUAD_ATTRIBUTE_COUNT)
        expect(r.values.every((v) => v !== null && v >= 1 && v <= 20)).toBe(true)
      }
    }
  })

  for (const [name, k] of Object.entries(KNOWN)) {
    it(`lit les attributs de ${name} comme dans le jeu`, () => {
      const row = (k.fixture === 'right-top.png' ? top : bottom)[k.row]
      for (const [attr, value] of Object.entries(k.values)) {
        expect(row.values[SQUAD_ATTRIBUTE_COLUMNS.indexOf(attr as AttributeKey)], `${name} ${attr}`).toBe(value)
      }
    })
  }
})

