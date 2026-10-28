import { createContext, useContext } from 'react'
import type { RoleDefinition } from '../domain/types'
import type { Messages } from './en'
import type { Lang } from './languages'

export interface I18n {
  lang: Lang
  setLang(lang: Lang): void
  t: Messages
  /** Nom affiché d'un rôle : traduit pour un profil par défaut, sinon le nom saisi. */
  roleName(role: RoleDefinition): string
  familiarity(value: number | undefined): string
  money(v: number | null): string
  date(d: string | null): string
}

/**
 * Contexte isolé dans son propre module : modifier en.ts / fr.ts ne recharge que le Provider
 * (provider.tsx) sans recréer le contexte, sinon le rechargement à chaud plantait
 * (« useI18n must be used inside <I18nProvider> »).
 */
export const I18nContext = createContext<I18n | null>(null)

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
