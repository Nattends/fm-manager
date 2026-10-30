import {
  createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type SortingState, type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpIcon, Columns3Icon, HardDriveDownloadIcon, MonitorDownIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EmptyState, PageHeader } from '@/components/layout'
import { PositionChip, StatusBadge } from '@/components/chips'
import { PlayerClub } from '@/components/ClubLogo'
import { Nationality } from '@/components/Nationality'
import { PlayerAvatar, RatingBadge, Stars } from '@/components/ui'
import { attrColor } from '@/components/styles'
import { ATTRIBUTE_GROUP_IDS, attributesOf, type AttributeGroup, type AttributeKey } from '@/domain/attributes'
import { nationalityLabel } from '@/domain/nationalities'
import { POSITIONS, type Position } from '@/domain/positions'
import { bestRole, type BestRole } from '@/domain/rating'
import type { Player, PlayerStatus } from '@/domain/types'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import { FmImportDialog } from './FmImportDialog'
import { FmSaveImportDialog } from './FmSaveImportDialog'
import { PlayerForm } from './PlayerForm'
import { PlayerSheet } from './PlayerSheet'

interface Row {
  player: Player
  best: BestRole | undefined
}

/** Familiarité minimale pour considérer qu'un joueur « joue » à un poste (Compétent). */
const PLAYS_AT = 14
const VISIBILITY_KEY = 'squad.columns'
const VIEW_KEY = 'squad.view'
type SquadView = 'all' | 'squad' | 'loaned'

function loadView(): SquadView {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    if (v === 'all' || v === 'squad' || v === 'loaned') return v
  } catch { /* stockage indisponible */ }
  return 'squad'
}
const ALL = 'all'
const STATUSES: PlayerStatus[] = ['key', 'rotation', 'prospect', 'for_sale', 'unavailable']
const BASE_COLUMNS = ['age', 'nationality', 'club', 'positions', 'status', 'ca', 'pa', 'bestRole', 'contract', 'value', 'wage'] as const
/** Colonnes alignées à droite (nombres). */
const NUMERIC = new Set<string>(['age', 'value', 'wage', ...ATTRIBUTE_GROUP_IDS.flatMap((g) => attributesOf(g))])

const col = createColumnHelper<Row>()

function loadVisibility(): VisibilityState {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* stockage indisponible */ }
  const hidden: VisibilityState = { wage: false, nationality: false }
  for (const g of ATTRIBUTE_GROUP_IDS) for (const a of attributesOf(g)) hidden[a] = false
  return hidden
}

export function SquadPage() {
  const { players, roles } = useStore()
  const { t, lang, roleName, money, date } = useI18n()
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState<Position | typeof ALL>(ALL)
  const [status, setStatus] = useState<PlayerStatus | typeof ALL>(ALL)
  const [ageMax, setAgeMax] = useState('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const [visibility, setVisibility] = useState<VisibilityState>(loadVisibility)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importingSave, setImportingSave] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  /** Tous les joueurs du club, ceux présents au club ou ceux prêtés (hors effectif). */
  const [view, setView] = useState<SquadView>(loadView)
  const changeView = (v: SquadView) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignoré */ }
  }
  const loanedCount = players.filter((p) => p.onLoan).length
  const squadCount = players.length - loanedCount

  useEffect(() => {
    try { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(visibility)) } catch { /* ignoré */ }
  }, [visibility])

  const filtered = search !== '' || position !== ALL || status !== ALL || ageMax !== ''
  const resetFilters = () => {
    setSearch('')
    setPosition(ALL)
    setStatus(ALL)
    setAgeMax('')
  }

  const rows = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase()
    const max = Number(ageMax)
    return players
      .filter((p) => view === 'all' || p.onLoan === (view === 'loaned'))
      .filter((p) => !q || [p.name, nationalityLabel(p.nationality, lang), p.club].some((s) => s.toLowerCase().includes(q)))
      .filter((p) => position === ALL || (p.positions[position] ?? 0) >= PLAYS_AT)
      .filter((p) => status === ALL || p.status === status)
      .filter((p) => !ageMax || p.age <= max)
      .map((player) => ({ player, best: bestRole(player, roles) }))
  }, [players, roles, view, lang, search, position, status, ageMax])

  const columns = useMemo(() => [
    col.accessor((r) => r.player.name, {
      id: 'name', header: t.squad.col.name,
      cell: (c) => {
        const p = c.row.original.player
        return (
          <span className="flex min-w-0 items-center gap-2.5">
            <PlayerAvatar player={p} size={30} />
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-100">{p.name}</span>
              <Nationality value={p.nationality} className="flex text-[11px] text-muted-foreground" />
            </span>
          </span>
        )
      },
      sortingFn: (a, b) => a.original.player.name.localeCompare(b.original.player.name, t.locale),
    }),
    col.accessor((r) => r.player.age, { id: 'age', header: t.squad.col.age }),
    col.accessor((r) => nationalityLabel(r.player.nationality, lang), {
      id: 'nationality', header: t.squad.col.nationality,
      cell: (c) => <Nationality value={c.row.original.player.nationality} />,
    }),
    col.accessor((r) => (r.player.onLoan ? r.player.club : ''), {
      id: 'club', header: t.squad.col.club,
      cell: (c) => <PlayerClub player={c.row.original.player} className="max-w-56 text-slate-300" />,
    }),
    col.display({
      id: 'positions', header: t.squad.col.positions,
      cell: (c) => (
        <span className="flex flex-wrap gap-1">
          {POSITIONS.filter((p) => (c.row.original.player.positions[p] ?? 0) >= PLAYS_AT).map((p) => (
            <PositionChip key={p} position={p} familiarity={c.row.original.player.positions[p]} />
          ))}
        </span>
      ),
    }),
    col.accessor((r) => r.player.status, {
      id: 'status', header: t.squad.col.status,
      cell: (c) => <StatusBadge status={c.getValue()} />,
    }),
    col.accessor((r) => r.player.caStars, { id: 'ca', header: t.squad.col.ca, cell: (c) => <Stars value={c.getValue()} className="text-xs" /> }),
    col.accessor((r) => r.player.paStars, { id: 'pa', header: t.squad.col.pa, cell: (c) => <Stars value={c.getValue()} className="text-xs" /> }),
    col.accessor((r) => r.best?.rating.score ?? 0, {
      id: 'bestRole', header: t.squad.col.bestRole, sortDescFirst: true,
      cell: (c) => {
        const best = c.row.original.best
        return best ? (
          <span className="flex min-w-0 items-center gap-2">
            <RatingBadge rating={best.rating} />
            {best.rating.rated && <span className="truncate text-slate-300">{roleName(best.role)}</span>}
          </span>
        ) : <span className="text-muted-foreground">{t.common.none}</span>
      },
    }),
    col.accessor((r) => r.player.contractEnd ?? '', { id: 'contract', header: t.squad.col.contract, cell: (c) => date(c.getValue() || null) }),
    col.accessor((r) => r.player.value ?? -1, { id: 'value', header: t.squad.col.value, cell: (c) => money(c.row.original.player.value) }),
    col.accessor((r) => r.player.wage ?? -1, { id: 'wage', header: t.squad.col.wage, cell: (c) => money(c.row.original.player.wage) }),
    ...ATTRIBUTE_GROUP_IDS.flatMap((g) =>
      attributesOf(g).map((a: AttributeKey) =>
        col.accessor((r) => r.player.attributes[a] ?? 0, {
          id: a,
          header: t.attributes[a],
          sortDescFirst: true,
          cell: (c) => {
            const v = c.row.original.player.attributes[a]
            return <span className={cn('font-semibold tabular-nums', attrColor(v))}>{v ?? '–'}</span>
          },
        }),
      ),
    ),
  ], [t, lang, roleName, money, date])

  // oxlint-disable-next-line react/incompatible-library -- TanStack Table v8, mémoïsation gérée par la table
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const setGroup = (g: AttributeGroup, visible: boolean) =>
    table.setColumnVisibility((v) => ({ ...v, ...Object.fromEntries(attributesOf(g).map((a) => [a, visible])) }))

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t.squad.title} count={t.squad.count(squadCount)}
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportingSave(true)}><HardDriveDownloadIcon />{t.fmSave.button}</Button>
            <Button variant="outline" onClick={() => setImporting(true)}><MonitorDownIcon />{t.fmImport.button}</Button>
            <Button onClick={() => setCreating(true)}><PlusIcon />{t.squad.addPlayer}</Button>
          </div>
        )}>
        <ToggleGroup type="single" variant="outline" size="sm" value={view}
          onValueChange={(v) => v && changeView(v as SquadView)}>
          <ToggleGroupItem value="all">{t.squad.viewAll(players.length)}</ToggleGroupItem>
          <ToggleGroupItem value="squad">{t.squad.viewSquad(squadCount)}</ToggleGroupItem>
          <ToggleGroupItem value="loaned">{t.squad.viewLoaned(loanedCount)}</ToggleGroupItem>
        </ToggleGroup>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 w-56 pl-8" placeholder={t.squad.search} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={position} onValueChange={(v) => setPosition(v as Position | typeof ALL)}>
          <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.squad.allPositions}</SelectItem>
            {POSITIONS.map((p) => <SelectItem key={p} value={p}>{t.positions[p]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as PlayerStatus | typeof ALL)}>
          <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.squad.allStatuses}</SelectItem>
            {STATUSES.map((k) => <SelectItem key={k} value={k}>{t.status[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="h-8 w-24" type="number" min={14} max={45} placeholder={t.squad.maxAge} value={ageMax}
          onChange={(e) => setAgeMax(e.target.value)} />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={resetFilters}><XIcon />{t.squad.resetFilters}</Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><Columns3Icon />{t.squad.columns}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{t.squad.general}</DropdownMenuLabel>
            {BASE_COLUMNS.map((id) => {
              const c = table.getColumn(id)
              return c && (
                <DropdownMenuCheckboxItem key={id} checked={c.getIsVisible()} onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) => c.toggleVisibility(!!v)}>
                  {t.squad.col[id]}
                </DropdownMenuCheckboxItem>
              )
            })}
            <DropdownMenuSeparator />
            {ATTRIBUTE_GROUP_IDS.map((g) => (
              <DropdownMenuSub key={g}>
                <DropdownMenuSubTrigger>{t.attributeGroups[g]}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-96 w-56 overflow-y-auto">
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setGroup(g, true) }}>{t.squad.showAll}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setGroup(g, false) }}>{t.squad.hideAll}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {attributesOf(g).map((a) => {
                    const c = table.getColumn(a)
                    return c && (
                      <DropdownMenuCheckboxItem key={a} checked={c.getIsVisible()} onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(v) => c.toggleVisibility(!!v)}>
                        {t.attributes[a]}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto">
        {players.length === 0 ? (
          <EmptyState message={t.squad.empty}
            action={<Button onClick={() => setCreating(true)}><PlusIcon />{t.squad.addFirst}</Button>} />
        ) : rows.length === 0 && !filtered ? (
          <EmptyState message={view === 'loaned' ? t.squad.loanedEmpty : t.squad.empty} />
        ) : rows.length === 0 ? (
          <EmptyState message={t.squad.noMatch}
            action={<Button variant="outline" onClick={resetFilters}><XIcon />{t.squad.resetFilters}</Button>} />
        ) : (
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-10 bg-card">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const sorted = h.column.getIsSorted()
                    return (
                      <th key={h.id} onClick={h.column.getToggleSortingHandler()}
                        className={cn(
                          'h-9 border-b border-border px-3 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase',
                          NUMERIC.has(h.column.id) ? 'text-right' : 'text-left',
                          h.column.getCanSort() && 'cursor-pointer hover:text-slate-200',
                          sorted && 'text-slate-200',
                        )}>
                        <span className={cn('inline-flex items-center gap-1', NUMERIC.has(h.column.id) && 'flex-row-reverse')}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === 'asc' && <ArrowUpIcon className="size-3" />}
                          {sorted === 'desc' && <ArrowDownIcon className="size-3" />}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} onClick={() => setOpenId(row.original.player.id)}
                  className="cursor-pointer transition-colors hover:bg-secondary/50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}
                      className={cn(
                        'h-12 border-b border-border/60 px-3 whitespace-nowrap text-slate-300',
                        NUMERIC.has(cell.column.id) && 'text-right tabular-nums',
                        cell.column.id === 'name' && 'max-w-64',
                      )}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && <PlayerForm onClose={() => setCreating(false)} />}
      {importing && <FmImportDialog onClose={() => setImporting(false)} />}
      {importingSave && <FmSaveImportDialog onClose={() => setImportingSave(false)} />}
      {openId !== null && <PlayerSheet playerId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

