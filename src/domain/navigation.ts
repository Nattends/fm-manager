// Navigation de l'appli : 4 onglets, chacun avec ses sous-onglets.

export const NAV = {
  squad: ['first', 'loaned', 'youth'],
  tactic: ['lineup', 'roles'],
  recruit: ['scouting', 'moneyball', 'clubs'],
  settings: ['general', 'data', 'rating'],
} as const

export type Section = keyof typeof NAV
export type SubPage<S extends Section = Section> = (typeof NAV)[S][number]
export interface PageRef { section: Section; sub: SubPage }

export const SECTIONS = Object.keys(NAV) as Section[]

/** Anciens identifiants de page (navigation à 8 onglets) → nouvel emplacement. */
const LEGACY: Record<string, PageRef> = {
  squad: { section: 'squad', sub: 'first' },
  youth: { section: 'squad', sub: 'youth' },
  tactic: { section: 'tactic', sub: 'lineup' },
  roles: { section: 'tactic', sub: 'roles' },
  scouting: { section: 'recruit', sub: 'scouting' },
  moneyball: { section: 'recruit', sub: 'moneyball' },
  clubs: { section: 'recruit', sub: 'clubs' },
  settings: { section: 'settings', sub: 'general' },
}

export const DEFAULT_PAGE: PageRef = { section: 'squad', sub: 'first' }

export function isSubPage(section: Section, sub: string): sub is SubPage {
  return (NAV[section] as readonly string[]).includes(sub)
}

/** Page enregistrée (« section/sous-onglet », ou ancien identifiant) → page valide. */
export function parsePage(stored: string | null): PageRef {
  if (!stored) return DEFAULT_PAGE
  if (stored in LEGACY) return LEGACY[stored]
  const [section, sub] = stored.split('/')
  if (!(section in NAV)) return DEFAULT_PAGE
  const s = section as Section
  return { section: s, sub: sub && isSubPage(s, sub) ? sub : NAV[s][0] }
}

export const pageKey = (p: PageRef) => `${p.section}/${p.sub}`
