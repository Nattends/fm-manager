import { normalizeText } from './photoMatch'

/**
 * Vrai si chaque mot de la recherche apparaît dans l'un des textes, sans tenir compte
 * des accents, de la casse ni de la ponctuation (« mbappe » trouve « Kylian Mbappé »).
 */
export function matchesSearch(query: string, ...texts: readonly string[]): boolean {
  const words = normalizeText(query).split(' ').filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeText(texts.join(' '))
  return words.every((w) => haystack.includes(w))
}

/** Filtre des listes cmdk (`<Command filter={commandFilter}>`) insensible aux accents. */
export function commandFilter(value: string, search: string, keywords?: string[]): number {
  return matchesSearch(search, value, ...(keywords ?? [])) ? 1 : 0
}
