import { normalizeText } from './photoMatch'

/** Club trouvé dans la recherche Transfermarkt. */
export interface ClubCandidate {
  name: string
  logoUrl: string | null
}

/** Équipes réserves et de jeunes : écartées sauf si le nom saisi les demande. */
const RESERVE = /\b(b|c|ii|iii|u\d{2}|sub ?\d{2}|youth|reserves?|academy|women|femenino|feminines?)\b/

/** Clé du cache des logos : nom du club sans accents ni casse. */
export function clubLogoKey(name: string): string {
  return normalizeText(name)
}

/**
 * Choisit le club correspondant au nom saisi parmi les résultats (déjà triés par
 * pertinence) : nom identique d'abord, puis premier club dont le nom contient tous les
 * mots saisis, en écartant les équipes réserves ou de jeunes qui ne sont pas demandées ;
 * sinon le premier résultat.
 */
export function pickClub(query: string, candidates: ClubCandidate[]): ClubCandidate | null {
  const q = normalizeText(query)
  if (!q || candidates.length === 0) return null
  const exact = candidates.find((c) => normalizeText(c.name) === q)
  if (exact) return exact
  const words = q.split(' ')
  const wantsReserve = RESERVE.test(q)
  const fits = (c: ClubCandidate) => {
    const name = normalizeText(c.name)
    const nameWords = name.split(' ')
    return words.every((w) => nameWords.includes(w)) && (wantsReserve || !RESERVE.test(name))
  }
  return candidates.find(fits) ?? candidates.find((c) => !RESERVE.test(normalizeText(c.name))) ?? candidates[0]
}
