import { useSyncExternalStore } from 'react'

/** Rendu des logos de club sur le fond sombre (réglage dans Settings). */
export type LogoStyle = 'halo' | 'outline' | 'chip' | 'none'

export const LOGO_STYLES: LogoStyle[] = ['halo', 'outline', 'chip', 'none']

const KEY = 'clubs.logoStyle'
const DEFAULT: LogoStyle = 'halo'
const listeners = new Set<() => void>()

function load(): LogoStyle {
  try {
    const v = localStorage.getItem(KEY)
    if (v && (LOGO_STYLES as string[]).includes(v)) return v as LogoStyle
  } catch { /* stockage indisponible */ }
  return DEFAULT
}

let current = load()

export function setLogoStyle(style: LogoStyle) {
  current = style
  try { localStorage.setItem(KEY, style) } catch { /* ignoré */ }
  for (const l of listeners) l()
}

/** Style choisi, mis à jour partout dès qu'il change. */
export function useLogoStyle(): LogoStyle {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => current,
  )
}
