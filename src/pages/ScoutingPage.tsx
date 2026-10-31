import { open } from '@tauri-apps/plugin-dialog'
import { ArrowDownIcon, ArrowLeftRightIcon, ArrowUpIcon, ChevronsUpDownIcon, Columns3Icon, DatabaseIcon, Loader2Icon, SearchIcon } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { EmptyState, PageHeader, SectionTitle } from '@/components/layout'
import { LoanBadge, PositionChip } from '@/components/chips'
import { Flag, NationalityPicker } from '@/components/Nationality'
import { PositionPitch } from '@/components/PositionPitch'
import { ColumnDnd, ReorderableTh } from '@/components/ReorderableColumns'
import { useColumnWidths } from '@/lib/useColumnWidths'
import { RoleSelect } from '@/components/RoleSelect'
import { AvgRating, RatingBadge } from '@/components/ui'
import { attrColor } from '@/components/styles'
import { loadScouting, refreshScouting } from '@/data/fmSave'
import { ATTRIBUTE_GROUP_IDS, attributesOf, FIRST_SET_PIECE } from '@/domain/attributes'
import { moveColumn } from '@/domain/columnLayout'
import { isoDate, SAVE_POSITIONS, type GameDate } from '@/domain/fmSave'
import { POSITIONS, type Position } from '@/domain/positions'
import { rolesForPlayer } from '@/domain/rating'
import {
  clubName, defaultDescending, SCOUT_PLAYS_AT, scoutAsPlayer, scoutFoot, scoutToday, searchScouts,
  type ScoutDb, type ScoutPlayer, type ScoutRow, type ScoutSort,
} from '@/domain/scouting'
import type { Player, RoleDefinition } from '@/domain/types'
import { loadColumnLayout, saveColumnLayout } from '@/lib/columnPrefs'
import { getSaveLink, lastSavePath, setSaveLink } from '@/lib/saveLink'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import { CompareDialog } from './CompareDialog'

/** Lignes affichées au plus : au-delà, il faut affiner les filtres. */
const LIMIT = 200

/** Colonnes du tableau ; chacune (sauf les postes) sert aussi de critère de tri. */
type ScoutColumn = 'name' | 'age' | 'club' | 'positions' | 'foot' | 'contract' | 'wage' | 'value' | 'avgRating' | 'rating'
const SCOUT_COLUMNS: ScoutColumn[] = ['name', 'age', 'club', 'positions', 'foot', 'contract', 'wage', 'value', 'avgRating', 'rating']
const COLUMNS_KEY = 'scouting.columns'
const WIDTHS_KEY = 'scouting.columnWidths'
const sortOf = (c: ScoutColumn): ScoutSort | null => (c === 'positions' ? null : c)

/** Valeur de transfert courte (« 75 M€ », « 8,53 M€ », « 750 k€ »), « – » si inconnue. */
function useValueFormat(): (v: number | null) => string {
  const { lang } = useI18n()
  return useMemo(() => {
    const f = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', notation: 'compact', maximumSignificantDigits: 3 })
    return (v: number | null) => (v === null ? '–' : f.format(v))
  }, [lang])
}

/** Deux bornes (min, max) d'un montant, sous un même libellé. */
function RangeInputs({ label, title, min, max, onMin, onMax }: {
  label: string
  title: string
  min: string
  max: string
  onMin: (v: string) => void
  onMax: (v: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-1" title={title}>
      <span className="text-xs whitespace-nowrap text-muted-foreground">{label}</span>
      <Input className="h-8 w-16" inputMode="decimal" placeholder={t.scouting.min} value={min} onChange={(e) => onMin(e.target.value)} />
      <span className="text-xs text-muted-foreground">–</span>
      <Input className="h-8 w-16" inputMode="decimal" placeholder={t.scouting.max} value={max} onChange={(e) => onMax(e.target.value)} />
    </div>
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

function ScoutDetail({ db, player, today, roles, onCompare }: {
  db: ScoutDb
  player: ScoutPlayer
  today: GameDate
  roles: RoleDefinition[]
  onCompare: (p: Player) => void
}) {
  const { t, lang, roleName } = useI18n()
  const p = useMemo(() => scoutAsPlayer(player, db, today), [player, db, today])
  const best = useMemo(() => rolesForPlayer(p, roles).slice(0, 5), [p, roles])
  const owner = clubName(db, player.owner)
  const valueText = useValueFormat()
  return (
    <div className="space-y-5 p-5">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {p.nationality && <Flag code={p.nationality} />}{p.name}
          </h2>
          <Button variant="outline" size="sm" onClick={() => onCompare(p)}><ArrowLeftRightIcon />{t.compare.action}</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {t.squad.col.age} {p.age} · {p.club || t.scouting.free} · {t.foot[p.foot]}
          {p.contractEnd && ` · ${t.player.contractEnd} ${p.contractEnd}`}
        </p>
        <p className="text-sm text-muted-foreground">
          {t.scouting.value} <span className="font-medium text-slate-200" title={t.scouting.valueTitle}>{valueText(player.value)}</span>
          {' · '}{t.rating.avg} <AvgRating value={player.avgRating} matches={player.ratedMatches} />
          {player.ratedMatches > 0 && <span className="text-xs"> ({t.rating.matches(player.ratedMatches)})</span>}
          {player.wage !== null && <> · {t.player.wage} <span className="font-medium text-slate-200">{t.scouting.perWeek(player.wage.toLocaleString(lang))}</span></>}
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
  const [clubNation, setClubNation] = useState('')
  const [role, setRole] = useState<RoleDefinition | null>(null)
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  // salaire en milliers d'euros par semaine, valeur en millions d'euros
  const [minWage, setMinWage] = useState('')
  const [maxWage, setMaxWage] = useState('')
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [nationality, setNationality] = useState('')
  const [club, setClub] = useState('')
  const [sort, setSort] = useState<ScoutSort>('rating')
  /** Sens du tri choisi en cliquant à nouveau sur la colonne ; null = sens par défaut de la colonne. */
  const [desc, setDesc] = useState<boolean | null>(null)
  const [layout, setLayout] = useState(() => loadColumnLayout(COLUMNS_KEY, SCOUT_COLUMNS))
  const colWidths = useColumnWidths(WIDTHS_KEY)
  useEffect(() => saveColumnLayout(COLUMNS_KEY, layout), [layout])
  const [selected, setSelected] = useState<ScoutPlayer | null>(null)
  const [comparing, setComparing] = useState<Player | null>(null)

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
  // base lue avant la v0.15 : pas de valeurs tant qu'elle n'est pas actualisée
  // base lue avant la v0.16 : pas de notes moyennes tant qu'elle n'est pas actualisée
  const hasValues = useMemo(() => !!db?.players.some((p) => p.value !== null) && !!db?.players.some((p) => p.avgRating !== null), [db])
  // meilleure note : rôles avec ballon (les rôles sans ballon n'ont que 2-3 attributs clés) et rôles perso
  const bestRoles = useMemo(() => roles.filter((r) => r.phase !== 'oop'), [roles])
  const positionRoles = useMemo(
    () => (positions.length ? roles.filter((r) => r.positions.some((p) => positions.includes(p))) : roles), [roles, positions])
  // objet stable (sinon la recherche repartirait à chaque rendu), différé pour garder la saisie fluide
  const filters = useDeferredValue(useMemo(() => {
    const num = (s: string, unit = 1) => {
      const n = Number(s.replace(',', '.'))
      return s.trim() === '' || !Number.isFinite(n) ? null : n * unit
    }
    return {
      search, positions, role, roles: bestRoles, minAge: num(minAge), maxAge: num(maxAge),
      minWage: num(minWage, 1e3), maxWage: num(maxWage, 1e3), minValue: num(minValue, 1e6), maxValue: num(maxValue, 1e6),
      nationality: nationality || null, club, clubNation: clubNation || null, hideLoaned, sort, desc, limit: LIMIT,
    }
  }, [search, positions, role, bestRoles, minAge, maxAge, minWage, maxWage, minValue, maxValue, nationality, club, clubNation, hideLoaned, sort, desc]))
  /** Clic sur une colonne : la trie ; un second clic inverse le sens. */
  const sortBy = (key: ScoutSort) => {
    if (key === sort) setDesc(!(desc ?? defaultDescending(key)))
    else {
      setSort(key)
      setDesc(null)
    }
  }
  const valueText = useValueFormat()
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

  /** Contenu de chaque colonne du tableau. */
  const columnDefs: Record<ScoutColumn, { label: string; title?: string; right?: boolean; cellClass?: string; cell: (r: ScoutRow) => ReactNode }> = {
    name: {
      label: t.fmImport.nameCol, cellClass: 'font-medium',
      cell: ({ player: p }) => <span className="inline-flex items-center gap-1.5">{p.nationality && <Flag code={p.nationality} />}{p.name}</span>,
    },
    age: { label: t.squad.col.age, right: true, cellClass: 'tabular-nums', cell: (r) => r.age },
    club: {
      label: t.squad.col.club, cellClass: 'max-w-56',
      cell: ({ player: p }) => {
        const owner = clubName(db, p.owner)
        return (
          <span className="block truncate text-slate-300" title={owner ? t.scouting.loanFrom(owner) : undefined}>
            {clubName(db, p.club) || <span className="text-muted-foreground">{t.scouting.free}</span>}
            {owner && <span className="text-muted-foreground"> · {t.scouting.loanFrom(owner)}</span>}
          </span>
        )
      },
    },
    positions: {
      label: t.squad.col.positions,
      cell: ({ player: p }) => <span className="inline-flex gap-1">{playedPositions(p).map((x) => <PositionChip key={x.pos} position={x.pos} familiarity={x.v} />)}</span>,
    },
    foot: { label: t.player.foot, cell: ({ player: p }) => t.foot[scoutFoot(p)] },
    contract: { label: t.player.contractEnd, cellClass: 'tabular-nums text-slate-300', cell: ({ player: p }) => (p.contractEnd ? isoDate(p.contractEnd) : '–') },
    wage: {
      label: t.player.wage, right: true, cellClass: 'tabular-nums text-slate-300',
      cell: ({ player: p }) => (p.wage !== null ? t.scouting.perWeek(p.wage.toLocaleString(lang)) : '–'),
    },
    value: { label: t.scouting.value, title: t.scouting.valueTitle, right: true, cellClass: 'tabular-nums text-slate-300', cell: ({ player: p }) => valueText(p.value) },
    avgRating: {
      label: t.rating.avgShort, title: t.rating.avg, right: true,
      cell: ({ player: p }) => <AvgRating value={p.avgRating} matches={p.ratedMatches} className="text-xs" />,
    },
    rating: {
      label: role ? t.scouting.rating : t.scouting.bestRating, right: true,
      cell: ({ rating, ratedRole }) => rating && ratedRole && (
        <span className="flex items-center justify-end gap-2">
          {!role && <span className="max-w-40 truncate text-[11px] text-muted-foreground">{roleName(ratedRole)}</span>}
          <RatingBadge rating={rating} size="sm" />
        </span>
      ),
    },
  }
  // ordre enregistré et colonnes affichées (le nom reste toujours affiché)
  const order = layout.order as ScoutColumn[]
  const visible = order.filter((c) => !layout.hidden.includes(c))
  const fixedTable = colWidths.tableProps(visible)
  const toggleColumn = (id: string, show: boolean) =>
    setLayout((l) => ({ ...l, hidden: show ? l.hidden.filter((x) => x !== id) : [...l.hidden, id] }))

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t.scouting.title} count={t.scouting.count(result.rows.length, result.total)}
        actions={(
          <span className="text-xs text-muted-foreground">
            {!hasValues && <span className="mr-2 text-amber-300">{t.scouting.noValues}</span>}
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
        <RangeInputs label={t.scouting.wageRange} title={t.scouting.wageRangeTitle} min={minWage} max={maxWage} onMin={setMinWage} onMax={setMaxWage} />
        <RangeInputs label={t.scouting.valueRange} title={t.scouting.valueRangeTitle} min={minValue} max={maxValue} onMin={setMinValue} onMax={setMaxValue} />
        <NationalityPicker value={nationality} onChange={setNationality} className="h-8 w-48" />
        <Input className="h-8 w-40" placeholder={t.scouting.club} value={club} onChange={(e) => setClub(e.target.value)} />
        <NationalityPicker value={clubNation} onChange={setClubNation} placeholder={t.scouting.clubNation} className="h-8 w-48" />
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <Switch checked={hideLoaned} onCheckedChange={setHideLoaned} />{t.scouting.hideLoaned}
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8"><Columns3Icon />{t.squad.columns}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {order.map((id) => (
              <DropdownMenuCheckboxItem key={id} checked={!layout.hidden.includes(id)} disabled={id === 'name'}
                onSelect={(e) => e.preventDefault()} onCheckedChange={(on) => toggleColumn(id, on === true)}>
                {columnDefs[id].label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { setLayout({ order: [...SCOUT_COLUMNS], hidden: [] }); colWidths.reset() }}>{t.columns.reset}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">

          <ColumnDnd onMove={(from, to) => setLayout((l) => ({ ...l, order: moveColumn(l.order, from, to) }))}
            labelOf={(id) => columnDefs[id as ScoutColumn].label}>
            <table {...fixedTable} className={cn('w-full text-[13px]', fixedTable.className)}>
              <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  {visible.map((id) => {
                    const def = columnDefs[id]
                    const key = sortOf(id)
                    const active = key !== null && key === sort
                    return (
                      <ReorderableTh key={id} columnId={id} colWidths={colWidths} onClick={key ? () => sortBy(key) : undefined}
                        title={[def.title, t.columns.hint].filter(Boolean).join(' — ')}
                        className={cn('px-2.5 py-2', def.right ? 'text-right' : 'text-left', key && 'cursor-pointer hover:text-slate-200', active && 'text-slate-200')}>
                        <span className={cn('inline-flex items-center gap-1', def.right && 'flex-row-reverse')}>
                          {def.label}
                          {active && (desc ?? defaultDescending(key)) && <ArrowDownIcon className="size-3" />}
                          {active && !(desc ?? defaultDescending(key)) && <ArrowUpIcon className="size-3" />}
                        </span>
                      </ReorderableTh>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.player.index} onClick={() => setSelected(row.player)}
                    className={cn('cursor-pointer border-b border-border/50 hover:bg-secondary/40', selected?.index === row.player.index && 'bg-emerald-500/10')}>
                    {visible.map((id) => (
                      <td key={id} className={cn('px-2.5 py-1.5', colWidths.widthOf(id) && 'overflow-hidden text-ellipsis', columnDefs[id].right && 'text-right', columnDefs[id].cellClass)}>{columnDefs[id].cell(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ColumnDnd>
          {result.total > result.rows.length && (
            <p className="px-5 py-3 text-xs text-muted-foreground">{t.scouting.more(result.total - result.rows.length)}</p>
          )}
        </div>
        <aside className="w-[26rem] shrink-0 overflow-y-auto border-l border-border bg-card/40">
          {selected
            ? <ScoutDetail db={db} player={selected} today={today} roles={bestRoles} onCompare={setComparing} />
            : <EmptyState message={t.scouting.selectHint} />}
        </aside>
      </div>
      {comparing && <CompareDialog first={comparing} source="club" onClose={() => setComparing(null)} />}
    </div>
  )
}

