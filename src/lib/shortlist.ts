import { useCallback, useState } from 'react'

/**
 * Shortlist du scouting : clés de joueurs (`scoutKey`), une liste par club de l'application,
 * retenue dans localStorage (sans effet s'il est indisponible). La page est remontée au changement de club.
 */
const keyOf = (clubId: number) => `scouting.shortlist.${clubId}`

function load(clubId: number): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(keyOf(clubId)) ?? '[]')
    if (Array.isArray(raw)) return new Set(raw.filter((k): k is string => typeof k === 'string'))
  } catch { /* stockage indisponible ou contenu illisible */ }
  return new Set()
}

export function useShortlist(clubId: number) {
  const [keys, setKeys] = useState(() => load(clubId))
  const toggle = useCallback((key: string) => {
    setKeys((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      try { localStorage.setItem(keyOf(clubId), JSON.stringify([...next])) } catch { /* ignoré */ }
      return next
    })
  }, [clubId])
  return { keys, toggle }
}
