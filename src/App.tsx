import { Loader2Icon, MonitorIcon, SmartphoneIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { applyWindowMode, loadSizeLock, loadWindowMode, setSizeLock, type WindowMode } from '@/lib/windowMode'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ClubSwitcher } from '@/components/ClubSwitcher'
import { useI18n } from './i18n'
import { LANGUAGES } from './i18n/languages'
import { RolesPage } from './pages/RolesPage'
import { SettingsPage } from './pages/SettingsPage'
import { SquadPage } from './pages/SquadPage'
import { TacticPage } from './pages/TacticPage'
import { useStore } from './store'

const PAGES = {
  squad: SquadPage,
  tactic: TacticPage,
  roles: RolesPage,
  settings: SettingsPage,
} as const

type PageId = keyof typeof PAGES

const PAGE_KEY = 'app.page'

function loadPage(): PageId {
  try {
    const v = localStorage.getItem(PAGE_KEY)
    if (v && v in PAGES) return v as PageId
  } catch { /* stockage indisponible */ }
  return 'squad'
}

export default function App() {
  const { loading, error, photoSearching, logoSearching, activeClub } = useStore()
  const { t, lang, setLang } = useI18n()
  const [page, setPageState] = useState<PageId>(loadPage)
  const Page = PAGES[page]
  const [windowMode, setWindowMode] = useState<WindowMode>(loadWindowMode)

  // Au démarrage, la fenêtre s'ouvre en taille standard : on rétablit le mode portrait s'il était actif.
  useEffect(() => {
    if (loadWindowMode() === 'portrait') applyWindowMode('portrait').catch((e) => console.warn('Mode portrait', e))
    else if (!loadSizeLock()) setSizeLock(false).catch((e) => console.warn('Taille de fenêtre libre', e))
  }, [])

  const toggleWindowMode = () => {
    const next: WindowMode = windowMode === 'portrait' ? 'standard' : 'portrait'
    setWindowMode(next)
    applyWindowMode(next).catch((e) => console.warn('Changement de taille de fenêtre', e))
  }
  const setPage = (id: PageId) => {
    setPageState(id)
    try { localStorage.setItem(PAGE_KEY, id) } catch { /* ignoré */ }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-(--header-height) shrink-0 items-center gap-6 border-b border-border bg-card px-5">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold tracking-tight text-emerald-400">FM27 Manager</span>
            <span className="hidden text-xs text-muted-foreground xl:inline">{t.nav.subtitle}</span>
          </div>

          {!loading && !error && <ClubSwitcher />}

          <nav className="flex h-full items-stretch gap-1">
            {(Object.keys(PAGES) as PageId[]).map((id) => (
              <button key={id} onClick={() => setPage(id)}
                className={cn(
                  'relative px-3 text-sm font-medium transition-colors',
                  page === id ? 'text-slate-100' : 'text-muted-foreground hover:text-slate-200',
                )}>
                {t.nav[id]}
                {page === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-400" />}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {logoSearching && !photoSearching && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" />
                {t.clubs.searchingLogo}
              </span>
            )}
            {photoSearching && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" />
                {t.photo.searching}
              </span>
            )}
            <button onClick={toggleWindowMode}
              title={windowMode === 'portrait' ? t.nav.standardModeTitle : t.nav.portraitModeTitle}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-slate-200">
              {windowMode === 'portrait' ? <MonitorIcon className="size-3.5" /> : <SmartphoneIcon className="size-3.5" />}
              {windowMode === 'portrait' ? t.nav.standardMode : t.nav.portraitMode}
            </button>
            <div className="flex rounded-md bg-secondary p-0.5">
              {LANGUAGES.map((l) => (
                <button key={l.id} onClick={() => setLang(l.id)} title={l.label}
                  className={cn(
                    'rounded px-2 py-0.5 text-[11px] font-semibold uppercase transition-colors',
                    lang === l.id ? 'bg-slate-700 text-white' : 'text-muted-foreground hover:text-slate-200',
                  )}>
                  {l.id}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {error ? (
            <div className="p-6 text-rose-400">{t.common.loadError(error)}</div>
          ) : loading ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> {t.common.loading}
            </div>
          ) : (
            // Changer de club remonte la page (la tactique en cours est celle du nouveau club).
            <Page key={`${page}:${activeClub.id}`} />
          )}
        </main>
        <Toaster position="bottom-right" richColors />
      </div>
    </TooltipProvider>
  )
}
