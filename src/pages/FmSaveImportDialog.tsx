import { open } from '@tauri-apps/plugin-dialog'
import { ChevronsUpDownIcon, FolderOpenIcon, Loader2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LoanBadge, PositionChip } from '@/components/chips'
import { Flag } from '@/components/Nationality'
import { savePlayers, scanSave } from '@/data/fmSave'
import {
  FM_NATIONS, isoDate, planSaveImport, SAVE_POSITIONS, type GameDate, type SaveClub, type SavePlayer, type SaveSummary,
} from '@/domain/fmSave'
import { normalizeText } from '@/domain/photoMatch'
import type { Position } from '@/domain/positions'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'

const PATH_KEY = 'fmSave.path'
/** Clubs affichés au plus dans la liste (il y en a plusieurs milliers). */
const MAX_CLUBS = 60

function lastPath(): string | undefined {
  try {
    return localStorage.getItem(PATH_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/** Date réelle, si la sauvegarde ne donne pas la date du jeu. */
function realToday(): GameDate {
  const now = new Date()
  const start = Date.UTC(now.getFullYear(), 0, 0)
  return { day: Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400000), year: now.getFullYear() }
}

function ClubPicker({ clubs, value, onChange }: { clubs: SaveClub[]; value: number | null; onChange: (id: number) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const current = clubs.find((c) => c.id === value)
  const shown = useMemo(() => {
    const q = normalizeText(search)
    const list = q ? clubs.filter((c) => normalizeText(`${c.shortName} ${c.name}`).includes(q)) : clubs
    return list.slice(0, MAX_CLUBS)
  }, [clubs, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button"
          className="flex h-8 w-72 min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30">
          {current ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {FM_NATIONS[current.nation] && <Flag code={FM_NATIONS[current.nation]} />}
              <span className="truncate">{current.shortName || current.name}</span>
            </span>
          ) : <span className="flex-1 text-muted-foreground">{t.fmSave.chooseClub}</span>}
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t.fmSave.searchClub} value={search} onValueChange={setSearch} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t.fmSave.noClub}</CommandEmpty>
            <CommandGroup>
              {shown.map((c) => (
                <CommandItem key={c.id} value={String(c.id)} data-checked={c.id === value}
                  onSelect={() => { onChange(c.id); setOpen(false) }}>
                  {FM_NATIONS[c.nation] && <Flag code={FM_NATIONS[c.nation]} />}
                  <span className="truncate">{c.shortName || c.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{c.players}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Postes joués (Compétent et plus), du meilleur au moins bon. */
function mainPositions(p: SavePlayer) {
  return SAVE_POSITIONS
    .map((pos, i) => ({ pos, v: p.positions[i] }))
    .filter((x): x is { pos: Position; v: number } => x.pos !== null && x.v >= 14)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
}

export function FmSaveImportDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n()
  const { players, activeClub, savePlayer } = useStore()
  const [path, setPath] = useState<string | null>(null)
  const [summary, setSummary] = useState<SaveSummary | null>(null)
  const [clubId, setClubId] = useState<number | null>(null)
  const [read, setRead] = useState<SavePlayer[]>([])
  const [busy, setBusy] = useState<'scan' | 'players' | null>(null)
  const [applying, setApplying] = useState(false)

  const pick = async () => {
    const picked = await open({ title: t.fmSave.pickTitle, defaultPath: lastPath(), filters: [{ name: 'Football Manager', extensions: ['fm'] }] })
    if (typeof picked !== 'string') return
    try {
      localStorage.setItem(PATH_KEY, picked)
    } catch { /* stockage indisponible */ }
    setPath(picked)
    setSummary(null)
    setRead([])
    setBusy('scan')
    try {
      const s = await scanSave(picked)
      setSummary(s)
      const id = s.managedClubId ?? s.clubs[0]?.id
      if (id !== undefined) await loadClub(picked, id)
    } catch (e) {
      toast.error(t.fmSave.readError(String(e)))
    } finally {
      setBusy(null)
    }
  }

  const loadClub = async (file: string, id: number) => {
    setClubId(id)
    setBusy('players')
    try {
      setRead(await savePlayers(file, id))
    } catch (e) {
      setRead([])
      toast.error(t.fmSave.readError(String(e)))
    } finally {
      setBusy(null)
    }
  }

  const today = useMemo(() => summary?.gameDate ?? realToday(), [summary])
  const plan = useMemo(() => planSaveImport(read, players, activeClub, today), [read, players, activeClub, today])

  const apply = async () => {
    setApplying(true)
    try {
      let created = 0
      let updated = 0
      for (const a of plan.actions) {
        await savePlayer(a.player)
        if (a.kind === 'create') created++
        else updated++
      }
      toast.success(t.fmImport.done(created, updated))
      onClose()
    } catch (e) {
      toast.error(String(e))
      setApplying(false)
    }
  }

  const gameDate = summary?.gameDate
    ? new Date(`${isoDate(summary.gameDate)}T00:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <Dialog open onOpenChange={(o) => !o && !applying && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="border-b border-border px-5 py-3.5">
          <DialogTitle className="text-lg font-semibold">{t.fmSave.title}</DialogTitle>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-sm text-slate-300">{t.fmSave.intro}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Button variant="outline" size="sm" onClick={() => void pick()} disabled={busy !== null || applying}>
              <FolderOpenIcon />{t.fmSave.pick}
            </Button>
            {path && <span className="min-w-0 truncate text-xs text-muted-foreground" title={path}>{path.split(/[\\/]/).pop()}</span>}
            {busy && (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />{busy === 'scan' ? t.fmSave.reading : t.fmSave.loadingPlayers}
              </span>
            )}
          </div>

          {summary && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">{t.fmSave.info(summary.manager, gameDate, summary.totalPlayers)}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t.fmSave.club}</span>
                <ClubPicker clubs={summary.clubs} value={clubId} onChange={(id) => path && void loadClub(path, id)} />
              </div>
            </div>
          )}

          {plan.actions.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-[13px]">
                  <thead className="bg-secondary/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5"></th>
                      <th className="px-2 py-1.5">{t.fmImport.nameCol}</th>
                      <th className="px-2 py-1.5">{t.squad.col.age}</th>
                      <th className="px-2 py-1.5">{t.squad.col.positions}</th>
                      <th className="px-2 py-1.5">{t.player.foot}</th>
                      <th className="px-2 py-1.5">{t.player.contractEnd}</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.actions.map((a, i) => {
                      const p = a.player
                      return (
                        <tr key={i} className="odd:bg-secondary/20">
                          <td className="px-2 py-1">
                            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium',
                              a.kind === 'create' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300')}>
                              {t.fmImport.state[a.kind]}
                            </span>
                          </td>
                          <td className="px-2 py-1 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              {p.nationality && <Flag code={p.nationality} />}{a.source.name}
                            </span>
                          </td>
                          <td className="px-2 py-1 tabular-nums">{p.age}</td>
                          <td className="px-2 py-1">
                            <span className="inline-flex gap-1">
                              {mainPositions(a.source).map((x) => <PositionChip key={x.pos} position={x.pos} familiarity={x.v} />)}
                            </span>
                          </td>
                          <td className="px-2 py-1">{t.foot[p.foot]}</td>
                          <td className="px-2 py-1 tabular-nums">{p.contractEnd ?? '–'}</td>
                          <td className="px-2 py-1">{p.onLoan && <LoanBadge club={p.club} />}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                {plan.missing.length > 0 && <p>{t.fmSave.missing(plan.missing.length)}</p>}
                <p>{t.fmSave.keptHint}</p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={applying}>{t.common.cancel}</Button>
          <Button onClick={() => void apply()} disabled={applying || busy !== null || plan.actions.length === 0}>
            {applying ? t.fmImport.applying : t.fmImport.apply(plan.actions.length)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
