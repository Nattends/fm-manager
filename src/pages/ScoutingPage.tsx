import { open } from '@tauri-apps/plugin-dialog'
import { ChevronsUpDownIcon, DatabaseIcon, Loader2Icon, SearchIcon } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { EmptyState, PageHeader, SectionTitle } from '@/components/layout'
import { LoanBadge, PositionChip } from '@/components/chips'
import { Flag, NationalityPicker } from '@/components/Nationality'
import { PositionPitch } from '@/components/PositionPitch'
import { RatingBadge } from '@/components/ui'
import { attrColor } from '@/components/styles'
import { loadScouting, refreshScouting } from '@/data/fmSave'
import { ATTRIBUTE_GROUP_IDS, attributesOf, FIRST_SET_PIECE } from '@/domain/attributes'
import { isoDate, SAVE_POSITIONS, type GameDate } from '@/domain/fmSave'
import { POSITIONS, type Position } from '@/domain/positions'
import { rolesForPlayer } from '@/domain/rating'
import {
  clubName, SCOUT_PLAYS_AT, scoutAsPlayer, scoutFoot, scoutToday, searchScouts,
  type ScoutDb, type ScoutPlayer, type ScoutSort,
} from '@/domain/scouting'
import type { RoleDefinition } from '@/domain/types'
import { getSaveLink, lastSavePath, setSaveLink } from '@/lib/saveLink'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'

/** Lignes affichées au plus : au-delà, il faut affiner les filtres. */
const LIMIT = 200

function RoleSelect({ roles, value, onChange }: { roles: RoleDefinition[]; value: RoleDefinition | null; onChange: (r: RoleDefinition | null) => void }) {
  const { t, roleName } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button"
          className="flex h-8 w-52 min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30">
          <span className={cn('flex-1 truncate', !value && 'text-muted-foreground')}>{value ? roleName(value) : t.scouting.role}</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={t.roles.search} />
          <CommandList className="max-h-80">
            <CommandEmpty>–</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none" onSelect={() => { onChange(null); setOpen(false) }} className="text-muted-foreground">
                {t.scouting.noRole}
              </CommandItem>
              {roles.map((r) => (
                <CommandItem key={r.id} value={`${roleName(r)} ${r.id}`} data-checked={r.id === value?.id}
                  onSelect={() => { onChange(r); setOpen(false) }} className="text-xs">
                  <span className="truncate">{roleName(r)}</span>
                  <span className="ml-auto shrink-0 pl-2 text-[10px] text-muted-foreground">{r.positions.map((p) => t.positions[p]).join('/')}</span>
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
function playedPositions(p: ScoutPlayer) {
  return SAVE_POSITIONS
    .map((pos, i) => ({ pos, v: p.positions[i] }))
    .filter((x): x is { pos: Position; v: number } => x.pos !== null && x.v >= SCOUT_PLAYS_AT)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
}

function ScoutDetail({ db, player, today, roles }: { db: ScoutDb; player: ScoutPlayer; today: GameDate; roles: RoleDefinition[] }) {
  const { t, roleName } = useI18n()
  const p = useMemo(() => scoutAsPlayer(player, db, today), [player, db, today])
  const best = useMemo(() => rolesForPlayer(p, roles).slice(0, 5), [p, roles])
  const owner = clubName(db, player.owner)
  return (
    <div className="space-y-5 p-5">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {p.nationality && <Flag code={p.nationality} />}{p.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.squad.col.age} {p.age} · {p.club || t.scouting.free} · {t.foot[p.foot]}
          {p.contractEnd && ` · ${t.player.contractEnd} ${p.contractEnd}`}
        </p>
        {owner && <LoanBadge club={owner} />}
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-4">
        <div>
          <SectionTitle>{t.scouting.bestRoles}</SectionTitle>
          <div className="space-y-1">
            {best.map((b) => (
              <div key={b.role.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate text-slate-300">{roleName(b.role)}</span>
                <RatingBadge rating={b.rating} size="sm" />
              </div>
            ))}
          </div>
        </div>
        <PositionPitch positions={p.positions} />
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        {ATTRIBUTE_GROUP_IDS.map((g) => (
          <div key={g}>
            <SectionTitle>{t.attributeGroups[g]}</SectionTitle>
            <div className="space-y-0.5">
              {attributesOf(g).map((a) => (
                <div key={a} className={cn('flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[13px] odd:bg-secondary/30',
                  a === FIRST_SET_PIECE && 'relative mt-3 before:absolute before:inset-x-1.5 before:-top-[7px] before:border-t before:border-border')}>
                  <span className="truncate text-slate-300">{t.attributes[a]}</span>
                  <span className={cn('font-semibold tabular-nums', attrColor(p.attributes[a]))}>{p.attributes[a] ?? '–'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ScoutingPage() {
  const { t, lang, roleName } = useI18n()
  const { roles, activeClub } = useStore()
  const [db, setDb] = useState<ScoutDb | null | undefined>(undefined)
  const [reading, setReading] = useState(false)
  const [search, setSearch] = useState('')
  const [positions, setPositions] = useState<Position[]>([])
  const [hideLoaned, setHideLoaned] = useState(false)
  const [role, setRole] = useState<RoleDefinition | null>(null)
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [nationality, setNationality] = useState('')
  const [club, setClub] = useState('')
  const [sort, setSort] = useState<ScoutSort>('rating')
  const [selected, setSelected] = useState<ScoutPlayer | null>(null)

  useEffect(() => {
    let cancelled = false
    loadScouting()
      .then((d) => { if (!cancelled) setDb(d) })
      .catch((e) => { if (!cancelled) { setDb(null); toast.error(String(e)) } })
    return () => { cancelled = true }
  }, [])

  /** Première base : lit la sauvegarde liée au club actif, ou en demande une. */
  const build = async () => {
    let path = getSaveLink(activeClub.id)?.path ?? null
    if (!path) {
      const picked = await open({ title: t.fmSave.pickTitle, defaultPath: lastSavePath(), filters: [{ name: 'Football Manager', extensions: ['fm'] }] })
      if (typeof picked !== 'string') return
      path = picked
      setSaveLink(activeClub.id, { path, saveClubId: null })
    }
    setReading(true)
    try {
      await refreshScouting(path)
      setDb(await loadScouting())
    } catch (e) {
      toast.error(t.settings.refreshFailed(String(e)))
    } finally {
      setReading(false)
    }
  }

  const today = useMemo(() => (db ? scoutToday(db) : null), [db])
  // meilleure note : rôles avec ballon et profils du notebook (les rôles sans ballon n'ont que 2-3 attributs clés)
  const bestRoles = useMemo(() => roles.filter((r) => r.phase !== 'oop'), [roles])
  const positionRoles = useMemo(
    () => (positions.length ? roles.filter((r) => r.positions.some((p) => positions.includes(p))) : roles), [roles, positions])
  // objet stable (sinon la recherche repartirait à chaque rendu), différé pour garder la saisie fluide
  const filters = useDeferredValue(useMemo(() => {
    const age = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s))
    return {
      search, positions, role, roles: bestRoles, minAge: age(minAge), maxAge: age(maxAge), nationality: nationality || null, club, hideLoaned, sort, limit: LIMIT,
    }
  }, [search, positions, role, bestRoles, minAge, maxAge, nationality, club, hideLoaned, sort]))
  const result = useMemo(() => (db && today ? searchScouts(db, filters, today, t.scouting.free) : null), [db, today, filters, t])
  const togglePosition = (p: Position, on: boolean) => {
    const next = POSITIONS.filter((x) => (x === p ? on : positions.includes(x)))
    setPositions(next)
    if (role && next.length && !role.positions.some((x) => next.includes(x))) setRole(null)
  }

  const dateLabel = (d: GameDate) => new Date(`${isoDate(d)}T00:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })

  if (db === undefined) {
    return <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />{t.common.loading}</div>
  }
  if (!db || !today || !result) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title={t.scouting.title} />
        <EmptyState message={t.scouting.empty}
          action={(
            <Button onClick={() => void build()} disabled={reading}>
              {reading ? <Loader2Icon className="animate-spin" /> : <DatabaseIcon />}{reading ? t.scouting.reading : t.scouting.emptyAction}
            </Button>
          )} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t.scouting.title} count={t.scouting.count(result.rows.length, result.total)}
        actions={(
          <span className="text-xs text-muted-foreground">
            {t.scouting.updated(db.refreshedAt.toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }), db.gameDate && dateLabel(db.gameDate))}
          </span>
        )}>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 w-52 pl-8" placeholder={t.scouting.search} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-44 justify-between font-normal">
              <span className="truncate">{positions.length ? positions.map((p) => t.positions[p]).join(', ') : t.squad.allPositions}</span>
              <ChevronsUpDownIcon className="size-3.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuCheckboxItem checked={!positions.length} onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => setPositions([])}>{t.squad.allPositions}</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {POSITIONS.map((p) => (
              <DropdownMenuCheckboxItem key={p} checked={positions.includes(p)} onSelect={(e) => e.preventDefault()}
                onCheckedChange={(on) => togglePosition(p, on === true)}>{t.positions[p]}</DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <RoleSelect roles={positionRoles} value={role} onChange={setRole} />
        <Input className="h-8 w-20" type="number" min={14} max={45} placeholder={t.scouting.minAge} value={minAge} onChange={(e) => setMinAge(e.target.value)} />
        <Input className="h-8 w-20" type="number" min={14} max={45} placeholder={t.scouting.maxAge} value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
        <NationalityPicker value={nationality} onChange={setNationality} className="h-8 w-48" />
        <Input className="h-8 w-40" placeholder={t.scouting.club} value={club} onChange={(e) => setClub(e.target.value)} />
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <Switch checked={hideLoaned} onCheckedChange={setHideLoaned} />{t.scouting.hideLoaned}
        </label>
        <Select value={sort} onValueChange={(v) => setSort(v as ScoutSort)}>
          <SelectTrigger size="sm" className="h-8 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(['rating', 'age', 'name'] as const).map((s) => <SelectItem key={s} value={s}>{t.scouting.sortBy} : {t.scouting.sort[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">

          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2">{t.fmImport.nameCol}</th>
                <th className="px-2 py-2 text-right">{t.squad.col.age}</th>
                <th className="px-2 py-2">{t.squad.col.club}</th>
                <th className="px-2 py-2">{t.squad.col.positions}</th>
                <th className="px-2 py-2">{t.player.foot}</th>
                <th className="px-2 py-2">{t.player.contractEnd}</th>
                <th className="px-3 py-2 text-right">{role ? t.scouting.rating : t.scouting.bestRating}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map(({ player: p, age, rating, ratedRole }) => {
                const owner = clubName(db, p.owner)
                return (
                  <tr key={p.index} onClick={() => setSelected(p)}
                    className={cn('cursor-pointer border-b border-border/50 hover:bg-secondary/40', selected?.index === p.index && 'bg-emerald-500/10')}>
                    <td className="px-3 py-1.5 font-medium">
                      <span className="inline-flex items-center gap-1.5">{p.nationality && <Flag code={p.nationality} />}{p.name}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{age}</td>
                    <td className="max-w-56 px-2 py-1.5">
                      <span className="block truncate text-slate-300" title={owner ? t.scouting.loanFrom(owner) : undefined}>
                        {clubName(db, p.club) || <span className="text-muted-foreground">{t.scouting.free}</span>}
                        {owner && <span className="text-muted-foreground"> · {t.scouting.loanFrom(owner)}</span>}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="inline-flex gap-1">{playedPositions(p).map((x) => <PositionChip key={x.pos} position={x.pos} familiarity={x.v} />)}</span>
                    </td>
                    <td className="px-2 py-1.5">{t.foot[scoutFoot(p)]}</td>
                    <td className="px-2 py-1.5 tabular-nums text-slate-300">{p.contractEnd ? isoDate(p.contractEnd) : '–'}</td>
                    <td className="px-3 py-1.5">
                      {rating && ratedRole && (
                        <span className="flex items-center justify-end gap-2">
                          {!role && <span className="max-w-40 truncate text-[11px] text-muted-foreground">{roleName(ratedRole)}</span>}
                          <RatingBadge rating={rating} size="sm" />
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {result.total > result.rows.length && (
            <p className="px-5 py-3 text-xs text-muted-foreground">{t.scouting.more(result.total - result.rows.length)}</p>
          )}
        </div>
        <aside className="w-[26rem] shrink-0 overflow-y-auto border-l border-border bg-card/40">
          {selected
            ? <ScoutDetail db={db} player={selected} today={today} roles={bestRoles} />
            : <EmptyState message={t.scouting.selectHint} />}
        </aside>
      </div>
    </div>
  )
}

