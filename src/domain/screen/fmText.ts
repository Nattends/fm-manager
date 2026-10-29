import type { Foot, PlayerStatus } from '../types'

/**
 * Lecture tolérante des textes de la vue Effectif de FM27 tels que les rend l'OCR de Windows :
 * « € » devient « C », « 1 » devient « l » ou « I », « / » devient « 1 », etc.
 */

/** Corrige les confusions courantes de l'OCR dans un texte censé contenir des nombres. */
function fixDigits(s: string): string {
  return s.replace(/[lI|]/g, '1').replace(/[Oo]/g, '0')
}

/** Montant en euros d'un texte comme « C43K », « C44.5K p/w », « C1.8M » (null si illisible). */
export function parseMoney(text: string): number | null {
  const amounts = parseAmounts(text)
  return amounts.length ? amounts[0] : null
}

function parseAmounts(text: string): number[] {
  const s = fixDigits(text.replace(/\s+/g, '')).replace(/,/g, '.')
  const out: number[] = []
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)([KkMm])/g)) {
    let digits = m[1]
    const unit = m[2].toUpperCase()
    // « €750K » lu « 6750K » : le symbole € est pris pour un 6
    if (unit === 'K' && !digits.includes('.') && Number(digits) >= 1000) digits = digits.slice(1)
    out.push(Math.round(Number(digits) * (unit === 'K' ? 1e3 : 1e6)))
  }
  return out
}

/** Valeur marchande : fourchette « C68M - C75M », ou valeur unique. */
export function parseValueRange(text: string): { low: number; high: number } | null {
  // « C6 2M » (point décimal perdu et espace) : on recolle les chiffres séparés
  const joined = text.replace(/(\d)\s+(\d)/g, '$1$2')
  const amounts = parseAmounts(joined)
  if (!amounts.length) return null
  if (amounts.length === 1) return { low: amounts[0], high: amounts[0] }
  let [low, high] = amounts
  if (low > high) [low, high] = [high, low]
  // Les fourchettes de FM sont serrées : au-delà de 3 fois, un point décimal a été perdu dans la borne haute.
  if (high > low * 3 && high / 10 >= low) high = Math.round(high / 10)
  return { low, high }
}

/** Date de fin de contrat (« 30/6/2028 », lue « 301612028 » : les « / » deviennent des « 1 »). */
export function parseContractEnd(text: string): { iso: string; ambiguous: boolean } | null {
  const compact = text.replace(/\s+/g, '')
  const slash = compact.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slash) return toIso(Number(slash[1]), Number(slash[2]), Number(slash[3]), false)
  const digits = fixDigits(compact).replace(/\D/g, '')
  const year = digits.slice(-4)
  if (!/^20\d\d$/.test(year)) return null
  const rest = digits.slice(0, -4)
  // d + « 1 » + m + « 1 » : on essaie toutes les coupures plausibles
  if (!rest.endsWith('1')) return null
  const core = rest.slice(0, -1)
  const options: { d: number; m: number }[] = []
  for (let i = 1; i <= 2; i++) {
    if (core[i] !== '1') continue
    const d = Number(core.slice(0, i))
    const m = Number(core.slice(i + 1))
    if (core.slice(i + 1).length >= 1 && core.slice(i + 1).length <= 2 && d >= 1 && d <= 31 && m >= 1 && m <= 12) options.push({ d, m })
  }
  if (!options.length) return null
  // les contrats finissent en général en fin de mois : on préfère le jour le plus élevé
  options.sort((a, b) => b.d - a.d)
  return toIso(options[0].d, options[0].m, Number(year), options.length > 1)
}

function toIso(d: number, m: number, y: number, ambiguous: boolean): { iso: string; ambiguous: boolean } | null {
  if (d < 1 || d > 31 || m < 1 || m > 12) return null
  return { iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, ambiguous }
}

export function parseFoot(text: string): Foot | null {
  const t = text.toLowerCase()
  if (/either|both/.test(t)) return 'both'
  if (t.includes('left')) return 'left'
  if (t.includes('right')) return 'right'
  return null
}

export function parseAge(text: string): number | null {
  const n = Number(fixDigits(text).replace(/\D/g, ''))
  return n >= 14 && n <= 45 ? n : null
}

export interface PlayingTime {
  /** Statut proposé pour un nouveau joueur (jamais appliqué à un joueur existant). */
  status: PlayerStatus
  onLoan: boolean
}

/** « Temps de jeu » promis par le club → statut de l'application. */
export function parsePlayingTime(text: string): PlayingTime {
  const t = text.toLowerCase()
  if (t.includes('loan')) return { status: 'rotation', onLoan: true }
  if (/star|important|regular|key/.test(t)) return { status: 'key', onLoan: false }
  if (/prospect|youngster/.test(t)) return { status: 'prospect', onLoan: false }
  if (/not needed|surplus|transfer/.test(t)) return { status: 'for_sale', onLoan: false }
  return { status: 'rotation', onLoan: false }
}
