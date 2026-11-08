import { Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSaveRefresh } from '@/lib/useSaveRefresh'
import { cn } from '@/lib/utils'
import { checkForUpdate } from '@/lib/updates'
import { restoreWindow, trackWindow } from '@/lib/windowMode'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ClubSwitcher } from '@/components/ClubSwitcher'
import { offerUpdate } from '@/components/updateToast'
import { NAV, pageKey, parsePage, SECTIONS, type PageRef, type Section, type SubPage } from './domain/navigation'
import { useI18n } from './i18n'
import { ClubComparePage } from './pages/ClubComparePage'
import { MoneyballPage } from './pages/MoneyballPage'
import { RolesPage } from './pages/RolesPage'
import { ScoutingPage } from './pages/ScoutingPage'
import { SettingsPage } from './pages/SettingsPage'
import { SquadPage } from './pages/SquadPage'
import { TacticPage } from './pages/TacticPage'
import { YouthPage } from './pages/YouthPage'
import { useStore } from './store'

/** Contenu de chaque sous-onglet. */
const PAGES: Record<SubPage, () => ReactNode> = {
  first: () => <SquadPage view="squad" />,
  loaned: () => <SquadPage view="loaned" />,
  youth: () => <YouthPage />,
  lineup: () => <TacticPage />,
  roles: () => <RolesPage />,
  scouting: () => <ScoutingPage />,
  moneyball: () => <MoneyballPage />,
  clubs: () => <ClubComparePage />,
  general: () => <SettingsPage section="general" />,
  data: () => <SettingsPage section="data" />,
  rating: () => <SettingsPage section="rating" />,
}

const PAGE_KEY = 'app.page'
/** Dernier sous-onglet ouvert de chaque onglet. */
const subKey = (s: Section) => `app.sub.${s}`

function loadPage(): PageRef {
  try { return parsePage(localStorage.getItem(PAGE_KEY)) } catch { return parsePage(null) }
}

export default function App() {
  const { loading, error, photoSearching, logoSearching, activeClub } = useStore()
  const { t } = useI18n()
  const [page, setPageState] = useState<PageRef>(loadPage)

  // Au démarrage, la fenêtre reprend sa place et sa taille de la dernière session, puis les retient.
  useEffect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    restoreWindow()
      .catch((e) => console.warn('Position de la fenêtre', e))
      .then(() => trackWindow())
      .then((s) => { if (cancelled) s?.(); else stop = s })
      .catch((e) => console.warn('Suivi de la fenêtre', e))
    return () => { cancelled = true; stop?.() }
  }, [])

  // Au démarrage de l'appli installée, recherche d'une nouvelle version sur GitHub (pas en mode dev).
  const updateChecked = useRef(false)
  useEffect(() => {
    if (import.meta.env.DEV || updateChecked.current) return
    updateChecked.current = true
    checkForUpdate()
      .then((u) => u && offerUpdate(u, t))
      .catch((e) => console.warn('Recherche de mise à jour impossible', e))
  }, [t])

  // Rafraîchissement rapide : la page est remontée ensuite (scouting et jeunes relisent leurs données).
  const { refreshing, refresh } = useSaveRefresh()
  const [refreshCount, setRefreshCount] = useState(0)
  const quickRefresh = async () => {
    if (await refresh()) setRefreshCount((n) => n + 1)
  }
  const setPage = (next: PageRef) => {
    setPageState(next)
    try {
      localStorage.setItem(PAGE_KEY, pageKey(next))
      localStorage.setItem(subKey(next.section), next.sub)
    } catch { /* ignoré */ }
  }
  /** Ouvre un onglet sur son dernier sous-onglet. */
  const openSection = (section: Section) => {
    let stored: string | null = null
    try { stored = localStorage.getItem(subKey(section)) } catch { /* ignoré */ }
    setPage(parsePage(stored ? `${section}/${stored}` : section))
  }
  const navButton = (active: boolean) => cn(
    'relative shrink-0 px-2 text-sm font-medium whitespace-nowrap transition-colors lg:px-3',
    active ? 'text-slate-100' : 'text-muted-foreground hover:text-slate-200',
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-(--header-height) shrink-0 items-center gap-3 border-b border-border bg-card px-3 lg:gap-6 lg:px-5">
          <div className="flex shrink-0 items-baseline gap-2">
            <span className="text-[15px] font-bold tracking-tight whitespace-nowrap text-emerald-400">FM27<span className="max-lg:hidden"> Manager</span></span>
            <span className="hidden text-xs text-muted-foreground xl:inline">{t.nav.subtitle}</span>
          </div>

          {!loading && !error && <ClubSwitcher />}

          <nav className="flex h-full min-w-0 items-stretch gap-0.5 lg:gap-1">
            {SECTIONS.map((s) => (
              <button key={s} onClick={() => openSection(s)} className={navButton(page.section === s)}>
                {t.nav.section[s]}
                {page.section === s && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-400" />}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-3">
            {logoSearching && !photoSearching && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={t.clubs.searchingLogo}>
                <Loader2Icon className="size-3.5 animate-spin" />
                <span className="max-xl:hidden">{t.clubs.searchingLogo}</span>
              </span>
            )}
            {photoSearching && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={t.photo.searching}>
                <Loader2Icon className="size-3.5 animate-spin" />
                <span className="max-xl:hidden">{t.photo.searching}</span>
              </span>
            )}
            {!loading && !error && (
              <button onClick={quickRefresh} disabled={refreshing} title={t.nav.quickRefreshTitle}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-slate-200 disabled:opacity-60">
                <RefreshCwIcon className={cn('size-3.5', refreshing && 'animate-spin')} />
                <span className="max-lg:hidden">{refreshing ? t.settings.refreshing : t.nav.quickRefresh}</span>
              </button>
            )}
          </div>
        </header>

        <nav className="flex h-9 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border bg-card/60 px-3 lg:px-5">
          {NAV[page.section].map((sub) => (
            <button key={sub} onClick={() => setPage({ section: page.section, sub })}
              className={cn(navButton(page.sub === sub), 'text-[13px]')}>
              {t.nav.sub[sub]}
              {page.sub === sub && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-400/80" />}
            </button>
          ))}
        </nav>

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {error ? (
            <div className="p-6 text-rose-400">{t.common.loadError(error)}</div>
          ) : loading ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> {t.common.loading}
            </div>
          ) : (
            // Changer de club remonte la page (la tactique en cours est celle du nouveau club).
            <Fragment key={`${pageKey(page)}:${activeClub.id}:${refreshCount}`}>{PAGES[page.sub]()}</Fragment>
          )}
        </main>
        <Toaster position="bottom-right" richColors />
      </div>
    </TooltipProvider>
  )
}
