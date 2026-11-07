import { ArrowDownIcon, ArrowUpIcon, Columns3Icon, Loader2Icon, SearchIcon, SlidersHorizontalIcon, StarIcon, XIcon } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { loadColumnLayout, saveColumnLayout } from '@/lib/columnPrefs'
import { useColumnWidths } from '@/lib/useColumnWidths'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ColumnDnd, ReorderableTh } from '@/components/ReorderableColumns'
import { moveColumn } from '@/domain/columnLayout'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { EmptyState, PageHeader } from '@/components/layout'
import { Flag } from '@/components/Nationality'
import { PlayerDetail } from '@/components/PlayerDetail'
import { AvgRating } from '@/components/ui'
import { scoreColor } from '@/components/styles'
import { loadScouting } from '@/data/fmSave'
import { PositionChip } from '@/components/chips'
import { isoDate } from '@/domain/fmSave'
import {
  buildModel, DEFAULT_WEIGHTS, evaluateMoneyball, knownValue, modelParamsKey, moneyballDescending, OUTPUT_GROUP_OF, primaryPosition, rankMoneyball, reachOf,
  statValue, squadClubIndex, teamSlots,
  type MoneyballModel, type MoneyballParams, type MoneyballRow, type MoneyballSort, type MoneyballWeights, type OutputStat, type TeamSlot,
} from '@/domain/moneyball'
import { clubName, scoutAsPlayer, scoutKey, scoutToday, type ScoutDb } from '@/domain/scouting'
import type { Player } from '@/domain/types'
import type { Messages } from '@/i18n/en'
import { setMoneyballSettings, useMoneyballSettings } from '@/lib/scoringParams'
import { useShortlist } from '@/lib/shortlist'
import { useValueFormat } from '@/lib/useValueFormat'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import { CompareDialog } from './CompareDialog'

/** Lignes affichées au plus : au-delà, il faut affiner les filtres. */
const LIMIT = 200
const ALL_SLOTS = 'all'
const CRITERIA = ['gain', 'surplus', 'perf', 'contract'] as const
// v2 : colonnes supplémentaires (masquées par défaut)
const COLUMNS_KEY = 'moneyball.columns.v2'
const WIDTHS_KEY = 'moneyball.columnWidths'
const MONEYBALL_COLUMNS = [
  'name', 'age', 'position', 'club', 'clubLevel', 'slot', 'slotRating', 'rating', 'gain', 'surplus', 'perf', 'contract',
  'avgRating', 'minutes', 'goals', 'assists', 'xg90', 'xa90', 'value', 'fee', 'contractEnd', 'wage', 'score',
] as const
type MoneyballColumn = (typeof MONEYBALL_COLUMNS)[number]
const HIDDEN_COLUMNS: MoneyballColumn[] = ['position', 'clubLevel', 'rating', 'avgRating', 'minutes', 'goals', 'assists', 'xg90', 'xa90', 'value', 'contractEnd']

const pct = (v: number) => `${Math.round(v * 100)} %`

/** Explication d'un critère, avec les paramètres réglés dans Settings. */
function criterionHelp(t: Messages, c: (typeof CRITERIA)[number], p: MoneyballParams): string {
  const h = t.moneyball.help
  if (c === 'gain') return h.gain(pct(p.depthShare))
  if (c === 'perf') return h.perf(String(p.outputPointsPerSd), String(p.outputCap), String(p.outputMinMinutes))
  if (c === 'contract') return h.contract(pct(p.fee.expired), p.fee.shortDays, pct(p.fee.short), p.fee.yearDays, pct(p.fee.year))
  return h.surplus
}

/** Nombre signé à une décimale (« +3,2 », « −1,0 »), coloré selon le signe. */
function Signed({ value, className }: { value: number | null; className?: string }) {
  const { lang } = useI18n()
  if (value === null) return <span className="text-slate-600">–</span>
  const text = Math.abs(value).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <span className={cn('tabular-nums', value > 0.05 ? 'text-emerald-300' : value < -0.05 ? 'text-rose-300' : 'text-slate-500', className)}>
      {value > 0.05 ? '+' : value < -0.05 ? '−' : ''}{text}
    </span>
  )
}

/** Détail du score d'un joueur : chaque critère, son poids et sa part du score. */
function Breakdown({ row, model, params, slotText, clubLine, onClose }: {
  row: MoneyballRow
  model: MoneyballModel
  params: MoneyballParams
  slotText: (s: TeamSlot) => string
  /** Niveau du club du joueur comparé à celui de l'effectif. */
  clubLine: string
  /** Ferme le panneau (plus aucun joueur sélectionné). */
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const weights = params.weights
  const p = row.player
  const pos = primaryPosition(p)
  const group = pos ? OUTPUT_GROUP_OF[pos] : null
  const norms = group ? model.output.norms.get(group) : undefined
  // stats du rendement de son poste, avec la moyenne des joueurs du même poste
  const stats = group && p.stats ? (Object.keys(model.output.weights[group]) as OutputStat[]) : []
  const fmt = (stat: OutputStat, v: number | null | undefined) => v === null || v === undefined ? '–'
    : stat === 'passPct' ? `${Math.round(v)} %`
    : v.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="space-y-2 border-b border-border p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.moneyball.breakdown}</h2>
        <span className="ml-auto text-lg font-semibold tabular-nums text-slate-100"><Signed value={row.score} /></span>
        <Button variant="ghost" size="icon-xs" onClick={onClose} title={t.common.close} aria-label={t.common.close}
          className="ml-2 self-center text-muted-foreground hover:text-slate-200">
          <XIcon />
        </Button>
      </div>
      {row.slot && (
        <p className="text-xs text-slate-300">
          {t.moneyball.breakdownAt(slotText(row.slot))} · {t.moneyball.col.slotRating} {row.slotRating}
          <br />
          <span className="text-muted-foreground">
            {row.slot.starterName ? t.moneyball.starterNow(row.slot.starterName, row.slot.starter) : t.moneyball.noStarter}
            <br />
            {clubLine}
          </span>
        </p>
      )}
      <table className="w-full text-xs">
        <tbody>
          {CRITERIA.map((c) => (
            <tr key={c} title={criterionHelp(t, c, params)} className="border-t border-border/50">
              <td className="py-1 text-slate-300">{t.moneyball.col[c]}</td>
              <td className="py-1 text-right"><Signed value={row[c]} /></td>
              <td className="py-1 pl-2 text-right text-muted-foreground tabular-nums">×{weights[c]}</td>
              <td className="py-1 pl-2 text-right font-medium"><Signed value={row[c] === null ? null : row[c]! * weights[c]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.stats && (
        <table className="w-full text-xs" title={criterionHelp(t, 'perf', params)}>
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-left font-normal">
                {t.moneyball.season(p.stats.minutes.toLocaleString(lang))} · {p.stats.goals} {t.moneyball.stat.goals.toLowerCase()}, {p.stats.assists} {t.moneyball.stat.assists.toLowerCase()}
              </th>
              <th className="py-1 text-right font-normal">{t.moneyball.per90}</th>
              <th className="py-1 pl-2 text-right font-normal">{t.moneyball.groupMean}</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat} className="border-t border-border/50">
                <td className="py-1 text-slate-300">{t.moneyball.stat[stat]}</td>
                <td className="py-1 text-right tabular-nums text-slate-100">{fmt(stat, statValue(p, stat))}</td>
                <td className="py-1 pl-2 text-right tabular-nums text-muted-foreground">{fmt(stat, norms?.get(stat)?.mean)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Garde la même valeur tant que sa clé ne change pas (évite de relancer un calcul long pour un réglage sans effet dessus). */
function useStableBy<T>(value: T, key: string): T {
  const [kept, setKept] = useState({ value, key })
  if (kept.key !== key) {
    setKept({ value, key })
    return value
  }
  return kept.value
}

export function MoneyballPage() {
  const { t, lang, roleName } = useI18n()
  const { players, roles, tactics, activeClub } = useStore()
  const [db, setDb] = useState<ScoutDb | null | undefined>(undefined)
  const [model, setModel] = useState<MoneyballModel | null>(null)
  const [tacticId, setTacticId] = useState<number | null>(tactics[0]?.id ?? null)
  const [slotId, setSlotId] = useState(ALL_SLOTS)
  const [search, setSearch] = useState('')
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  // indemnité en millions d'euros, salaire en milliers d'euros par semaine
  const [maxFee, setMaxFee] = useState('')
  const [maxWage, setMaxWage] = useState('')
  const [hideLoaned, setHideLoaned] = useState(false)
  const [onlyGain, setOnlyGain] = useState(true)
  const [realistic, setRealistic] = useState(true)
  const [onlyShortlist, setOnlyShortlist] = useState(false)
  const params = useMoneyballSettings()
  const weights = params.weights
  const setWeights = (w: MoneyballWeights) => setMoneyballSettings({ ...params, weights: w })
  // le modèle n'est réappris que si un de ses réglages change, l'évaluation que si un réglage autre que les poids change
  const modelParams = useStableBy(params, modelParamsKey(params))
  const evalParams = useStableBy(params, JSON.stringify({ ...params, weights: null }))
  const [sort, setSort] = useState<MoneyballSort>('score')
  const [desc, setDesc] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<MoneyballRow | null>(null)
  const [comparing, setComparing] = useState<Player | null>(null)
  const shortlist = useShortlist(activeClub.id)
  const valueText = useValueFormat()
  const [layout, setLayout] = useState(() => loadColumnLayout(COLUMNS_KEY, MONEYBALL_COLUMNS, HIDDEN_COLUMNS))
  const colWidths = useColumnWidths(WIDTHS_KEY)
  useEffect(() => saveColumnLayout(COLUMNS_KEY, layout), [layout])

  useEffect(() => {
    let cancelled = false
    loadScouting()
      .then((d) => { if (!cancelled) setDb(d) })
      .catch((e) => { if (!cancelled) { setDb(null); toast.error(String(e)) } })
    return () => { cancelled = true }
  }, [])

  const today = useMemo(() => (db ? scoutToday(db) : null), [db])
  // mêmes rôles que la meilleure note du Scouting : rôles avec ballon et rôles perso
  const bestRoles = useMemo(() => roles.filter((r) => r.phase !== 'oop'), [roles])
  // apprentissage du marché (≈ 1 s sur une base complète) : après l'affichage, pour montrer l'attente
  useEffect(() => {
    if (!db || !today) return
    const timer = setTimeout(() => setModel(buildModel(db, bestRoles, today, modelParams)), 30)
    return () => clearTimeout(timer)
  }, [db, today, bestRoles, modelParams])

  const tactic = tactics.find((tc) => tc.id === tacticId) ?? tactics[0] ?? null
  const team = useMemo(() => (tactic ? teamSlots(tactic.slots, players, roles) : []), [tactic, players, roles])
  const ownClub = useMemo(() => (db ? squadClubIndex(db, players) : -1), [db, players])
  const reach = useMemo(() => (model ? reachOf(model.clubLevels, ownClub, players, evalParams) : null), [model, ownClub, players, evalParams])
  const slotText = (s: TeamSlot) => `${t.positions[s.ip.position]} · ${roleName(s.ip.role)}`

  const filters = useDeferredValue(useMemo(() => {
    const num = (s: string, unit = 1) => {
      const n = Number(s.replace(',', '.'))
      return s.trim() === '' || !Number.isFinite(n) ? null : n * unit
    }
    return {
      search, slotId: slotId === ALL_SLOTS ? null : slotId, minAge: num(minAge), maxAge: num(maxAge),
      maxFee: num(maxFee, 1e6), maxWage: num(maxWage, 1e3), hideLoaned, onlyGain, ownClub, reach: realistic ? reach : null,
      only: onlyShortlist ? shortlist.keys : null,
    }
  }, [search, slotId, minAge, maxAge, maxFee, maxWage, hideLoaned, onlyGain, ownClub, realistic, reach, onlyShortlist, shortlist.keys]))
  // partie lente (toute la base notée sur chaque poste) : seulement quand les filtres ou les réglages changent
  const rows = useMemo(
    () => (db && model && today && team.length ? evaluateMoneyball(db, model, team, filters, today, evalParams) : null),
    [db, model, today, team, filters, evalParams])
  // tri et poids : classement des lignes déjà évaluées (quelques millisecondes)
  const rank = useDeferredValue(useMemo(() => ({ weights, sort, desc, limit: LIMIT }), [weights, sort, desc]))
  const result = useMemo(() => (rows ? rankMoneyball(rows, rank) : null), [rows, rank])
  // la ligne sélectionnée suit les nouveaux calculs (poids, poste visé…)
  const current = selected && result ? result.rows.find((r) => r.player.index === selected.player.index) ?? selected : selected
  const selectedPlayer = useMemo(() => (db && today && current ? scoutAsPlayer(current.player, db, today) : null), [db, today, current])

  const sortBy = (key: MoneyballSort) => {
    if (key === sort) setDesc(!(desc ?? moneyballDescending(key)))
    else {
      setSort(key)
      setDesc(null)
    }
  }

  if (db === undefined) {
    return <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />{t.common.loading}</div>
  }
  if (!db || !today) {
    return <div className="flex h-full flex-col"><PageHeader title={t.moneyball.title} /><EmptyState message={t.moneyball.noDb} /></div>
  }
  if (!tactic) {
    return <div className="flex h-full flex-col"><PageHeader title={t.moneyball.title} /><EmptyState message={t.moneyball.noTactic} /></div>
  }

  const level = (v: number | null) => (v === null || Number.isNaN(v) ? '–' : v.toLocaleString(lang, { maximumFractionDigits: 1 }))
  const wageText = (v: number | null) => (v === null ? '–' : t.scouting.perWeek(Math.round(v).toLocaleString(lang)))
  const per90 = (v: number | null) => (v === null ? '–' : v.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  const levelOf = (club: number) => (model && club >= 0 ? model.clubLevels[club] : NaN)

  const columnDefs: { id: MoneyballColumn; label: string; title?: string; sort?: MoneyballSort; right?: boolean; cell: (r: MoneyballRow) => ReactNode }[] = [
    {
      id: 'name', label: t.fmImport.nameCol, sort: 'name',
      cell: ({ player: p }) => {
        const on = shortlist.keys.has(scoutKey(p))
        return (
          <span className="inline-flex items-center gap-1.5 font-medium">
            <button type="button" title={on ? t.scouting.shortlistRemove : t.scouting.shortlistAdd} aria-pressed={on}
              onClick={(e) => { e.stopPropagation(); shortlist.toggle(scoutKey(p)) }}
              className={cn('shrink-0 rounded p-0.5 text-slate-500 hover:text-amber-300', on && 'text-amber-300')}>
              <StarIcon className={cn('size-4', on && 'fill-current')} />
            </button>
            {p.nationality && <Flag code={p.nationality} />}{p.name}
          </span>
        )
      },
    },
    { id: 'age', label: t.squad.col.age, sort: 'age', right: true, cell: (r) => <span className="tabular-nums">{r.age}</span> },
    {
      id: 'position', label: t.moneyball.col.position,
      cell: ({ player: p }) => {
        const pos = primaryPosition(p)
        return pos ? <PositionChip position={pos} /> : <span className="text-slate-600">–</span>
      },
    },
    {
      id: 'club', label: t.squad.col.club,
      cell: ({ player: p }) => (
        <span className="block max-w-44 truncate text-slate-300" title={t.moneyball.clubLevel(level(levelOf(p.club)), level(levelOf(ownClub)))}>
          {clubName(db, p.club) || '–'}
        </span>
      ),
    },
    {
      id: 'clubLevel', label: t.moneyball.col.clubLevel, title: t.moneyball.help.clubLevel, sort: 'clubLevel', right: true,
      cell: (r) => <span className="tabular-nums text-slate-300">{level(r.clubLevel)}</span>,
    },
    {
      id: 'slot', label: t.moneyball.col.slot,
      cell: (r) => r.slot && <span className="block max-w-44 truncate text-xs text-slate-300">{slotText(r.slot)}</span>,
    },
    {
      id: 'slotRating', label: t.moneyball.col.slotRating, title: t.moneyball.help.slotRating, sort: 'slotRating', right: true,
      cell: (r) => (
        <span className={cn('inline-flex h-5 min-w-8 items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums ring-1', scoreColor(r.slotRating))}>
          {r.slotRating.toFixed(0)}
        </span>
      ),
    },
    {
      id: 'rating', label: t.moneyball.col.rating, title: t.moneyball.help.rating, sort: 'rating', right: true,
      cell: (r) => <span className="tabular-nums text-slate-300">{r.rating.toFixed(0)}</span>,
    },
    { id: 'gain', label: t.moneyball.col.gain, title: criterionHelp(t, 'gain', params), sort: 'gain', right: true, cell: (r) => <Signed value={r.gain} /> },
    { id: 'surplus', label: t.moneyball.col.surplus, title: t.moneyball.help.surplus, sort: 'surplus', right: true, cell: (r) => <Signed value={r.surplus} /> },
    {
      id: 'perf', label: t.moneyball.col.perf, title: criterionHelp(t, 'perf', params), sort: 'perf', right: true,
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <AvgRating value={r.player.avgRating} matches={r.player.ratedMatches} className="text-[11px]" />
          <Signed value={r.perf} />
        </span>
      ),
    },
    { id: 'contract', label: t.moneyball.col.contract, title: criterionHelp(t, 'contract', params), sort: 'contract', right: true, cell: (r) => <Signed value={r.contract} /> },
    {
      id: 'avgRating', label: t.squad.col.avgRating, sort: 'avgRating', right: true,
      cell: ({ player: p }) => <AvgRating value={p.avgRating} matches={p.ratedMatches} className="text-[11px]" />,
    },
    { id: 'minutes', label: t.moneyball.col.minutes, sort: 'minutes', right: true, cell: ({ player: p }) => <span className="tabular-nums text-slate-300">{p.stats ? p.stats.minutes.toLocaleString(lang) : '–'}</span> },
    { id: 'goals', label: t.moneyball.stat.goals, sort: 'goals', right: true, cell: ({ player: p }) => <span className="tabular-nums text-slate-300">{p.stats?.goals ?? '–'}</span> },
    { id: 'assists', label: t.moneyball.stat.assists, sort: 'assists', right: true, cell: ({ player: p }) => <span className="tabular-nums text-slate-300">{p.stats?.assists ?? '–'}</span> },
    { id: 'xg90', label: t.moneyball.col.xg90, sort: 'xg', right: true, cell: ({ player: p }) => <span className="tabular-nums text-slate-300">{per90(statValue(p, 'xg'))}</span> },
    { id: 'xa90', label: t.moneyball.col.xa90, sort: 'xa', right: true, cell: ({ player: p }) => <span className="tabular-nums text-slate-300">{per90(statValue(p, 'xa'))}</span> },
    { id: 'value', label: t.squad.col.value, sort: 'value', right: true, cell: ({ player: p }) => <span className="tabular-nums text-slate-300">{valueText(knownValue(p))}</span> },
    { id: 'fee', label: t.moneyball.col.fee, title: t.moneyball.help.fee, sort: 'fee', right: true, cell: (r) => <span className="tabular-nums text-slate-300">{valueText(r.fee)}</span> },
    {
      id: 'contractEnd', label: t.player.contractEnd, sort: 'contractEnd', right: true,
      cell: ({ player: p }) => <span className="tabular-nums text-slate-300">{p.contractEnd ? isoDate(p.contractEnd) : '–'}</span>,
    },
    {
      id: 'wage', label: t.player.wage, sort: 'wage', right: true,
      cell: ({ player: p }) => <span className="tabular-nums text-slate-300">{p.wage !== null ? t.scouting.perWeek(p.wage.toLocaleString(lang)) : '–'}</span>,
    },
    { id: 'score', label: t.moneyball.col.score, title: t.moneyball.help.score, sort: 'score', right: true, cell: (r) => <Signed value={r.score} className="font-semibold" /> },
  ]
  // ordre enregistré et colonnes affichées (le nom reste toujours affiché)
  const defOf = (id: string) => columnDefs.find((c) => c.id === id)!
  const columns = layout.order.filter((id) => !layout.hidden.includes(id)).map(defOf)
  const fixedTable = colWidths.tableProps(columns.map((c) => c.id))
  const toggleColumn = (id: string, show: boolean) =>
    setLayout((l) => ({ ...l, hidden: show ? l.hidden.filter((x) => x !== id) : [...l.hidden, id] }))

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t.moneyball.title} count={result ? t.scouting.count(result.rows.length, result.total) : undefined}
        actions={<span className="max-w-72 text-[11px] leading-tight text-muted-foreground">{t.moneyball.limits}</span>}>
        <Select value={String(tactic.id)} onValueChange={(v) => { setTacticId(Number(v)); setSlotId(ALL_SLOTS) }}>
          <SelectTrigger size="sm" className="h-8 w-40" title={t.moneyball.tactic}><SelectValue /></SelectTrigger>
          <SelectContent>
            {tactics.map((tc) => <SelectItem key={tc.id} value={String(tc.id)}>{tc.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={slotId} onValueChange={setSlotId}>
          <SelectTrigger size="sm" className="h-8 w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SLOTS}>{t.moneyball.allSlots}</SelectItem>
            {team.map((s) => (
              <SelectItem key={s.slotId} value={s.slotId}>
                {t.moneyball.slotLabel(t.positions[s.ip.position], roleName(s.ip.role), s.starterName)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 w-44 pl-8" placeholder={t.scouting.search} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Input className="h-8 w-20" type="number" min={14} max={45} placeholder={t.scouting.minAge} value={minAge} onChange={(e) => setMinAge(e.target.value)} />
        <Input className="h-8 w-20" type="number" min={14} max={45} placeholder={t.scouting.maxAge} value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
        <Input className="h-8 w-28" inputMode="decimal" placeholder={t.moneyball.maxFee} title={t.moneyball.maxFeeTitle} value={maxFee} onChange={(e) => setMaxFee(e.target.value)} />
        <Input className="h-8 w-28" inputMode="decimal" placeholder={t.moneyball.maxWage} title={t.moneyball.maxWageTitle} value={maxWage} onChange={(e) => setMaxWage(e.target.value)} />
        <label className="flex items-center gap-2 text-xs text-slate-300"
          title={reach ? t.moneyball.realisticTitle(level(reach.clubLevel), level(reach.level), valueText(reach.fee), wageText(reach.wage),
            params.clubTop, params.reachFeeTop, String(params.reachWageFactor)) : undefined}>
          <Switch checked={realistic} onCheckedChange={setRealistic} />{t.moneyball.realistic}
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300" title={t.moneyball.onlyGainTitle(String(params.minGain))}>
          <Switch checked={onlyGain} onCheckedChange={setOnlyGain} />{t.moneyball.onlyGain}
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <Switch checked={hideLoaned} onCheckedChange={setHideLoaned} />{t.scouting.hideLoaned}
        </label>
        <Button variant={onlyShortlist ? 'default' : 'outline'} size="sm" className="h-8" aria-pressed={onlyShortlist} onClick={() => setOnlyShortlist((v) => !v)}>
          <StarIcon className={cn(onlyShortlist && 'fill-current')} />{t.scouting.shortlist(shortlist.keys.size)}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8"><SlidersHorizontalIcon />{t.moneyball.weights}</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <p className="text-xs text-muted-foreground">{t.moneyball.weightsHint}</p>
            {CRITERIA.map((c) => (
              <label key={c} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-xs" title={criterionHelp(t, c, params)}>
                <span className="text-slate-300">{t.moneyball.col[c]}</span>
                <input type="range" min={0} max={2} step={0.25} value={weights[c]} className="accent-emerald-500"
                  onChange={(e) => setWeights({ ...weights, [c]: Number(e.target.value) })} />
                <span className="text-right tabular-nums">×{weights[c]}</span>
              </label>
            ))}
            <Button variant="ghost" size="sm" className="self-end" onClick={() => setWeights(DEFAULT_WEIGHTS)}>{t.moneyball.resetWeights}</Button>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8"><Columns3Icon />{t.squad.columns}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {layout.order.map((id) => (
              <DropdownMenuCheckboxItem key={id} checked={!layout.hidden.includes(id)} disabled={id === 'name'}
                onSelect={(e) => e.preventDefault()} onCheckedChange={(on) => toggleColumn(id, on === true)}>
                {defOf(id).label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { setLayout({ order: [...MONEYBALL_COLUMNS], hidden: [...HIDDEN_COLUMNS] }); colWidths.reset() }}>{t.columns.reset}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          {!result ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />{t.moneyball.computing}</div>
          ) : (
            <>
              <ColumnDnd onMove={(from, to) => setLayout((l) => ({ ...l, order: moveColumn(l.order, from, to) }))}
                labelOf={(id) => defOf(id).label}>
                <table {...fixedTable} className={cn('w-full text-[13px]', fixedTable.className)}>
                  <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      {columns.map((c) => {
                        const active = c.sort === sort
                        const down = desc ?? moneyballDescending(sort)
                        return (
                          <ReorderableTh key={c.id} columnId={c.id} colWidths={colWidths} onClick={c.sort ? () => sortBy(c.sort!) : undefined}
                            title={[c.title, t.columns.hint].filter(Boolean).join(' — ')}
                            className={cn('px-2.5 py-2 whitespace-nowrap', c.right ? 'text-right' : 'text-left', c.sort && 'cursor-pointer hover:text-slate-200', active && 'text-slate-200')}>
                            <span className={cn('inline-flex items-center gap-1', c.right && 'flex-row-reverse')}>
                              {c.label}
                              {active && (down ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
                            </span>
                          </ReorderableTh>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={row.player.index} onClick={() => setSelected(row)}
                        className={cn('cursor-pointer border-b border-border/50 hover:bg-secondary/40', current?.player.index === row.player.index && 'bg-emerald-500/10')}>
                        {columns.map((c) => (
                          <td key={c.id} className={cn('px-2.5 py-1.5', colWidths.widthOf(c.id) && 'overflow-hidden text-ellipsis', c.right && 'text-right')}>{c.cell(row)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ColumnDnd>
              {result.total > result.rows.length && (
                <p className="px-5 py-3 text-xs text-muted-foreground">{t.scouting.more(result.total - result.rows.length)}</p>
              )}
            </>
          )}
        </div>
        {/* panneau latéral seulement quand un joueur est sélectionné */}
        {current && selectedPlayer && model && (
          <aside className="w-[26rem] shrink-0 overflow-y-auto border-l border-border bg-card/40">
            <Breakdown row={current} model={model} params={params} slotText={slotText} onClose={() => setSelected(null)}
              clubLine={t.moneyball.clubLevel(level(levelOf(current.player.club)), level(levelOf(ownClub)))} />
            <PlayerDetail player={selectedPlayer} roles={bestRoles} owner={clubName(db, current.player.owner)} onCompare={setComparing} />
          </aside>
        )}
      </div>
      {comparing && <CompareDialog first={comparing} source="club" onClose={() => setComparing(null)} />}
    </div>
  )
}
