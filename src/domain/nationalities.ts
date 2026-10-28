import { normalizeText } from './photoMatch'

/**
 * Nationalités proposées : codes ISO 3166-1 (en minuscules, comme les drapeaux du
 * paquet flag-icons), sans le Royaume-Uni mais avec ses quatre nations sportives et le Kosovo.
 * Généré depuis flag-icons/country.json.
 */
export const NATION_CODES: readonly string[] = [
  'ad', 'ae', 'af', 'ag', 'ai', 'al', 'am', 'ao', 'aq', 'ar', 'as', 'at', 'au', 'aw', 'ax', 'az',
  'ba', 'bb', 'bd', 'be', 'bf', 'bg', 'bh', 'bi', 'bj', 'bl', 'bm', 'bn', 'bo', 'bq', 'br', 'bs',
  'bt', 'bv', 'bw', 'by', 'bz', 'ca', 'cc', 'cd', 'cf', 'cg', 'ch', 'ci', 'ck', 'cl', 'cm', 'cn',
  'co', 'cr', 'cu', 'cv', 'cw', 'cx', 'cy', 'cz', 'de', 'dj', 'dk', 'dm', 'do', 'dz', 'ec', 'ee',
  'eg', 'eh', 'er', 'es', 'et', 'fi', 'fj', 'fk', 'fm', 'fo', 'fr', 'ga', 'gb-eng', 'gb-nir', 'gb-sct', 'gb-wls',
  'gd', 'ge', 'gf', 'gg', 'gh', 'gi', 'gl', 'gm', 'gn', 'gp', 'gq', 'gr', 'gs', 'gt', 'gu', 'gw',
  'gy', 'hk', 'hm', 'hn', 'hr', 'ht', 'hu', 'id', 'ie', 'il', 'im', 'in', 'io', 'iq', 'ir', 'is',
  'it', 'je', 'jm', 'jo', 'jp', 'ke', 'kg', 'kh', 'ki', 'km', 'kn', 'kp', 'kr', 'kw', 'ky', 'kz',
  'la', 'lb', 'lc', 'li', 'lk', 'lr', 'ls', 'lt', 'lu', 'lv', 'ly', 'ma', 'mc', 'md', 'me', 'mf',
  'mg', 'mh', 'mk', 'ml', 'mm', 'mn', 'mo', 'mp', 'mq', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx',
  'my', 'mz', 'na', 'nc', 'ne', 'nf', 'ng', 'ni', 'nl', 'no', 'np', 'nr', 'nu', 'nz', 'om', 'pa',
  'pe', 'pf', 'pg', 'ph', 'pk', 'pl', 'pm', 'pn', 'pr', 'ps', 'pt', 'pw', 'py', 'qa', 're', 'ro',
  'rs', 'ru', 'rw', 'sa', 'sb', 'sc', 'sd', 'se', 'sg', 'sh', 'si', 'sj', 'sk', 'sl', 'sm', 'sn',
  'so', 'sr', 'ss', 'st', 'sv', 'sx', 'sy', 'sz', 'tc', 'td', 'tf', 'tg', 'th', 'tj', 'tk', 'tl',
  'tm', 'tn', 'to', 'tr', 'tt', 'tv', 'tw', 'tz', 'ua', 'ug', 'um', 'us', 'uy', 'uz', 'va', 'vc',
  've', 'vg', 'vi', 'vn', 'vu', 'wf', 'ws', 'xk', 'ye', 'yt', 'za', 'zm', 'zw',
]

/** Noms des nations sans nom dans Intl.DisplayNames. */
const EXTRA_NAMES: Record<string, Record<'en' | 'fr', string>> = {
  'gb-eng': { en: 'England', fr: 'Angleterre' },
  'gb-sct': { en: 'Scotland', fr: 'Écosse' },
  'gb-wls': { en: 'Wales', fr: 'Pays de Galles' },
  'gb-nir': { en: 'Northern Ireland', fr: 'Irlande du Nord' },
  xk: { en: 'Kosovo', fr: 'Kosovo' },
}

const CODE_SET = new Set(NATION_CODES)
const displayNames = new Map<string, Intl.DisplayNames | null>()

function regionNames(lang: string): Intl.DisplayNames | null {
  if (!displayNames.has(lang)) {
    try { displayNames.set(lang, new Intl.DisplayNames([lang], { type: 'region' })) } catch { displayNames.set(lang, null) }
  }
  return displayNames.get(lang)!
}

/** Nom d'une nation dans la langue demandée (anglais si la langue n'est pas connue). */
export function nationName(code: string, lang: string): string {
  const extra = EXTRA_NAMES[code]
  if (extra) return lang === 'fr' ? extra.fr : extra.en
  return regionNames(lang)?.of(code.toUpperCase()) ?? code.toUpperCase()
}

let byName: Map<string, string> | null = null

/** Code de nation pour une valeur saisie : code (« fr ») ou nom anglais / français (« Brésil »). */
export function nationCode(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (!v) return null
  if (CODE_SET.has(v)) return v
  if (!byName) {
    byName = new Map()
    for (const code of NATION_CODES) {
      for (const lang of ['en', 'fr']) byName.set(normalizeText(nationName(code, lang)), code)
    }
  }
  return byName.get(normalizeText(value)) ?? null
}

/** Nations triées par nom dans la langue demandée. */
export function sortedNations(lang: string): { code: string; name: string }[] {
  const collator = new Intl.Collator(lang)
  return NATION_CODES.map((code) => ({ code, name: nationName(code, lang) })).sort((a, b) => collator.compare(a.name, b.name))
}

/** Nom anglais de la nationalité saisie (pour comparer avec Transfermarkt), ou la saisie telle quelle. */
export function englishNationality(value: string): string {
  const code = nationCode(value)
  return code ? nationName(code, 'en') : value
}

/** Nom affiché d'une nationalité saisie : nom traduit si elle est reconnue, sinon la saisie. */
export function nationalityLabel(value: string, lang: string): string {
  const code = nationCode(value)
  return code ? nationName(code, lang) : value
}