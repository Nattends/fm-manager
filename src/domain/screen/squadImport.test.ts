import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeText } from '../photoMatch'
import { readAttributeCapture } from './attributes'
import { loadFixture } from './digits.test'
import { readIdentityCapture, type OcrWord } from './identity'
import { parseContractEnd, parseMoney, parseValueRange } from './fmText'
import { buildSquad, planImport } from './squadImport'

const words = (name: string): OcrWord[] => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'))

describe('lecture des textes de FM', () => {
  it('lit les salaires malgré les erreurs de l\'OCR', () => {
    expect(parseMoney('C43K')).toBe(43000)
    expect(parseMoney('C44.5K')).toBe(44500)
    expect(parseMoney('C70Kp1w')).toBe(70000)
    expect(parseMoney('C8.5K')).toBe(8500)
  })

  it('lit les fourchettes de valeur', () => {
    expect(parseValueRange('C68M - C75M')).toEqual({ low: 68e6, high: 75e6 })
    expect(parseValueRange('C83M - CllOM')).toEqual({ low: 83e6, high: 110e6 })
    expect(parseValueRange('Cl.8M')).toEqual({ low: 1.8e6, high: 1.8e6 })
    expect(parseValueRange('6750K Cl.8M')).toEqual({ low: 750e3, high: 1.8e6 })
    // point décimal perdu : « C6 2M » pour 6,2 M
    expect(parseValueRange('C4.8M - C6 2M')).toEqual({ low: 4.8e6, high: 6.2e6 })
  })

  it('lit les dates de fin de contrat', () => {
    expect(parseContractEnd('C 301612028')?.iso).toBe('2028-06-30')
    expect(parseContractEnd('301612027')?.iso).toBe('2027-06-30')
    expect(parseContractEnd('30/6/2031')?.iso).toBe('2031-06-30')
    expect(parseContractEnd('abc')).toBeNull()
  })
})

describe('import de l\'effectif depuis les captures', () => {
  const idTop = readIdentityCapture(loadFixture('left-top.png'), words('left-top.words.json'))
  const idBottom = readIdentityCapture(loadFixture('left-bottom.png'), words('left-bottom.words.json'))
  const attrs = [...readAttributeCapture(loadFixture('right-top.png')), ...readAttributeCapture(loadFixture('right-bottom.png'))]

  it('lit les lignes d\'identité', () => {
    expect(idTop.errors).toEqual([])
    expect(idTop.rows.length).toBe(21)
    const remiro = idTop.rows.find((r) => r.name.includes('Remiro'))!
    expect(remiro.age).toBe(31)
    expect(remiro.foot).toBe('right')
    expect(remiro.wage).toBe(70000)
    expect(remiro.value).toBe(34e6)
    expect(remiro.contractEnd).toBe('2027-06-30')
    expect(remiro.caStars).toBe(3.5)
    expect(remiro.paStars).toBe(3.5)
    expect(normalizeText(remiro.club)).toMatch(/^real san sebasti[ae]n$/)
    const oyarzabal = idTop.rows[0]
    expect(oyarzabal.foot).toBe('left')
    expect(oyarzabal.caStars).toBe(4)
    expect(oyarzabal.paStars).toBe(4)
  })

  it('donne cinq étoiles de potentiel à un joueur dont la dernière étoile est blanche', () => {
    const oskarsson = idTop.rows.find((r) => r.age === 21)!
    expect(oskarsson.paStars).toBe(5)
  })

  it('rapproche chaque joueur de sa ligne d\'attributs', () => {
    const squad = buildSquad([...idTop.rows, ...idBottom.rows], attrs)
    // 21 + 20 lignes lues (la première ligne du bas est coupée), Mikel Goti est sur les deux captures
    expect(squad.players.length).toBe(40)
    const withAttrs = squad.players.filter((p) => p.attributes)
    expect(withAttrs.length).toBe(squad.players.length)
    const remiro = squad.players.find((p) => p.identity.name.includes('Remiro'))!
    expect(remiro.attributes?.passing).toBe(17)
    expect(remiro.attributes?.reflexes).toBe(16)
    const fort = squad.players.find((p) => p.identity.name.includes('Fort'))!
    expect(fort.attributes?.determination).toBe(18)
    expect(squad.orphanAttributeRows).toBe(0)
  })

  it('prépare l\'import : l\'équipe B est ignorée, les joueurs prêtés sont gardés', () => {
    const squad = buildSquad([...idTop.rows, ...idBottom.rows], attrs)
    const plan = planImport(squad, [], { id: 1, name: 'Real Sociedad' })
    expect(normalizeText(plan.clubName)).toMatch(/^real san sebasti[ae]n$/)
    const names = plan.actions.map((a) => a.player.name)
    expect(names.some((n) => n.includes('Remiro'))).toBe(true)
    expect(names.some((n) => n.includes('Barbolla'))).toBe(false)
    const loaned = plan.actions.filter((a) => a.player.onLoan)
    expect(loaned.length).toBe(2)
    expect(plan.actions.every((a) => a.kind === 'create')).toBe(true)
    expect(plan.skipped).toBeGreaterThan(0)
  })
})

