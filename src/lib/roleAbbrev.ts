import { useSyncExternalStore } from 'react'

/** Abréviations de rôles choisies par l'utilisateur (identifiant du rôle → texte), retenues dans localStorage. */
const KEY = 'tactic.roleAbbrevs'

let cache: Record<string, string> | null = null
const listeners = new Set<() => void>()

function read(): Record<string, string> {
  if (cache) return cache
  cache = {}
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (raw && typeof raw === 'object') {
      for (const [id, v] of Object.entries(raw)) if (typeof v === 'string' && v.trim()) cache[id] = v
    }
  } catch { /* stockage indisponible ou contenu illisible */ }
  return cache
}

/** Texte vide : retire l'abréviation personnalisée (retour aux initiales). */
export function setRoleAbbrev(roleId: string, value: string): void {
  const next = { ...read() }
  const v = value.trim()
  if (v) next[roleId] = v
  else delete next[roleId]
  cache = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignoré */ }
  listeners.forEach((l) => l())
}

export function useRoleAbbrevs(): Record<string, string> {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    read,
  )
}

/** Initiales en majuscules : « Ball-Playing Defender » → « BPD ». */
export function roleInitials(name: string): string {
  return name.split(/[\s\-/]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase()
}
