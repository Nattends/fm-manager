import { useMemo } from 'react'
import { useI18n } from '@/i18n'

/** Valeur de transfert courte (« 75 M€ », « 8,53 M€ », « 750 k€ »), « – » si inconnue. */
export function useValueFormat(): (v: number | null) => string {
  const { lang } = useI18n()
  return useMemo(() => {
    const f = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', notation: 'compact', maximumSignificantDigits: 3 })
    return (v: number | null) => (v === null ? '–' : f.format(v))
  }, [lang])
}
