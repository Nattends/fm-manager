import { useMemo, type ReactNode } from 'react'
import { DEFAULT_ROLES } from '../domain/defaultRoles'
import { familiarityLevel } from '../domain/positions'
import { I18nContext, type I18n } from './context'
import { en } from './en'

export function I18nProvider({ children }: { children: ReactNode }) {
  const value = useMemo<I18n>(() => {
    const t = en
    const money = new Intl.NumberFormat(t.locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, notation: 'compact' })
    return {
      lang: 'en',
      t,
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
  }, [])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
