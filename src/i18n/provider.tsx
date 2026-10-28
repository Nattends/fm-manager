import { useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_ROLES } from '../domain/defaultRoles'
import { familiarityLevel } from '../domain/positions'
import { I18nContext, type I18n } from './context'
import { en, type Messages } from './en'
import { fr } from './fr'
import type { Lang } from './languages'

const MESSAGES: Record<Lang, Messages> = { en, fr }
const STORAGE_KEY = 'lang'

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'fr') return v
  } catch { /* stockage indisponible */ }
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang)

  const value = useMemo<I18n>(() => {
    const t = MESSAGES[lang]
    const money = new Intl.NumberFormat(t.locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, notation: 'compact' })
    return {
      lang,
      t,
      setLang(next) {
        setLangState(next)
        try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignoré */ }
      },
      roleName(role) {
        const original = DEFAULT_ROLES.find((r) => r.id === role.id)
        const renamed = original && role.name !== original.name
        return (!renamed && t.roleNames[role.id]) || role.name
      },
      familiarity(v) {
        const level = familiarityLevel(v)
        return level ? t.familiarity[level] : t.common.none
      },
      money: (v) => (v === null ? t.common.none : money.format(v)),
      date(d) {
        if (!d) return t.common.none
        const date = new Date(d)
        return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString(t.locale)
      },
    }
  }, [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
