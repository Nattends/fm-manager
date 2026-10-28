/** Un joueur trouvé dans les résultats de recherche Transfermarkt. */
export interface PhotoCandidate {
  name: string
  /** Âge réel actuel (null si non indiqué). */
  age: number | null
  /** Nationalités en anglais, comme affichées par Transfermarkt. */
  nationalities: string[]
  /** URL de la petite photo ; null si Transfermarkt n'a pas de photo (image par défaut). */
  photoUrl: string | null
}

/**
 * Écart accepté entre l'âge saisi (dans la partie) et l'âge réel actuel. La partie
 * avance dans le temps : un joueur réel a au plus quelques années de plus en jeu.
 */
export const AGE_GAP_MIN = -1
export const AGE_GAP_MAX = 10

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Clé du cache de photos : même nom et même nationalité = même photo. */
export function photoCacheKey(player: { name: string; nationality: string }): string {
  return `${normalizeText(player.name)}|${normalizeText(player.nationality)}`
}

function tokens(s: string): string[] {
  return normalizeText(s).split(' ').filter(Boolean)
}

/** Vrai si tous les mots du nom saisi apparaissent dans le nom Transfermarkt (ou l'inverse). */
export function namesMatch(query: string, candidate: string): boolean {
  const q = tokens(query)
  const c = tokens(candidate)
  if (!q.length || !c.length) return false
  return q.every((w) => c.includes(w)) || c.every((w) => q.includes(w))
}

/** Nations du football absentes des codes pays ISO (nom français → nom Transfermarkt). */
const EXTRA_NATIONS: Record<string, string> = {
  angleterre: 'england',
  ecosse: 'scotland',
  'pays de galles': 'wales',
  'irlande du nord': 'northern ireland',
  turquie: 'turkiye',
  'cote d ivoire': 'cote d ivoire',
  'coree du sud': 'korea south',
  'republique tcheque': 'czech republic',
  tchequie: 'czech republic',
  'etats unis': 'united states',
  usa: 'united states',
  'rd congo': 'dr congo',
  'republique democratique du congo': 'dr congo',
  'bosnie herzegovine': 'bosnia herzegovina',
}

let nationMap: Map<string, string> | null = null

/** Table nom de pays (français ou anglais, normalisé) → nom anglais normalisé. */
function nations(): Map<string, string> {
  if (nationMap) return nationMap
  nationMap = new Map(Object.entries(EXTRA_NATIONS))
  try {
    const fr = new Intl.DisplayNames(['fr'], { type: 'region' })
    const en = new Intl.DisplayNames(['en'], { type: 'region' })
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for (const a of letters) {
      for (const b of letters) {
        const code = a + b
        const enName = en.of(code)
        if (!enName || enName === code) continue
        const target = normalizeText(enName)
        nationMap.set(target, target)
        const frName = fr.of(code)
        if (frName && frName !== code) nationMap.set(normalizeText(frName), target)
      }
    }
  } catch {
    // Intl.DisplayNames indisponible : on se contente de la comparaison directe.
  }
  return nationMap
}

export function nationalityMatches(entered: string, candidateNations: string[]): boolean {
  const n = normalizeText(entered)
  if (!n) return false
  const target = nations().get(n) ?? n
  return candidateNations.some((c) => {
    const cn = normalizeText(c)
    return cn === n || cn === target || nations().get(cn) === target
  })
}

/**
 * Choisit le résultat qui correspond au joueur : nom compatible et âge plausible,
 * en privilégiant la même nationalité, puis l'ordre de pertinence de Transfermarkt.
 * Renvoie null si aucun ne correspond (joueur généré par le jeu, par exemple).
 */
export function pickCandidate(
  player: { name: string; age: number; nationality: string },
  candidates: PhotoCandidate[],
): PhotoCandidate | null {
  const plausible = candidates.filter((c) => {
    if (!namesMatch(player.name, c.name)) return false
    if (c.age === null) return true
    const gap = player.age - c.age
    return gap >= AGE_GAP_MIN && gap <= AGE_GAP_MAX
  })
  if (!plausible.length) return null
  if (player.nationality.trim()) {
    const sameNation = plausible.find((c) => nationalityMatches(player.nationality, c.nationalities))
    if (sameNation) return sameNation
  }
  return plausible[0]
}
