// Point d'entrée de l'i18n : le Provider (provider.tsx) et le hook (context.ts) sont séparés
// pour que le rechargement à chaud des textes ne casse pas le contexte.
export { I18nProvider } from './provider'
export { useI18n, type I18n } from './context'

