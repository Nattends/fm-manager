import { ArrowDownIcon, ArrowUpIcon, Loader2Icon, SearchIcon, SlidersHorizontalIcon, StarIcon } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
import {
  buildModel, DEFAULT_WEIGHTS, moneyballDescending, OUTPUT_GROUP_OF, OUTPUT_WEIGHTS, primaryPosition, reachOf, statValue, searchMoneyball, squadClubIndex, teamSlots,
  type MoneyballModel, type MoneyballRow, type MoneyballSort, type MoneyballWeights, type OutputStat, type TeamSlot,
} from '@/domain/moneyball'
import { clubName, scoutAsPlayer, scoutKey, scoutToday, type ScoutDb } from '@/domain/scouting'
import type { Player } from '@/domain/types'
import { useShortlist } from '@/lib/shortlist'
import { useValueFormat } from '@/lib/useValueFormat'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import { CompareDialog } from './CompareDialog'

/** Lignes affichées au plus : au-delà, il faut affiner les filtres. */
const LIMIT = 200
const WEIGHTS_KEY = 'moneyball.weights'
const ALL_SLOTS = 'all'
const CRITERIA = ['gain', 'surplus', 'perf', 'contract'] as const

function loadWeights(): MoneyballWeights {
  try {
    const saved = JSON.parse(localStorage.getItem(WEIGHTS_KEY) ?? 'null') as Partial<MoneyballWeights> | null
    return { ...DEFAULT_WEIGHTS, ...saved }
  } catch {
    return DEFAULT_WEIGHTS
  }
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
function Breakdown({ row, model, weights, slotText, clubLine }: {
  row: MoneyballRow
  model: MoneyballModel
  weights: MoneyballWeights
  slotText: (s: TeamSlot) => string
  /** Niveau du club du joueur comparé à celui de l'effectif. */
  clubLine: string
}) {
  const { t, lang } = useI18n()
  const p = row.player
  const pos = primaryPosition(p)
  const group = pos ? OUTPUT_GROUP_OF[pos] : null
  const norms = group ? model.output.norms.get(group) : undefined
  // stats du rendement de son poste, avec la moyenne des joueurs du même poste
  const stats = group && p.stats ? (Object.keys(OUTPUT_WEIGHTS[group]) as OutputStat[]) : []
  const fmt = (stat: OutputStat, v: number | null | undefined) => v === null || v === undefined ? '–'
    : stat === 'passPct' ? `${Math.round(v)} %`
    : v.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="space-y-2 border-b border-border p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.moneyball.breakdown}</h2>
        <span className="text-lg font-semibold tabular-nums text-slate-100"><Signed value={row.score} /></span>
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
            <tr key={c} title={t.moneyball.help[c]} className="border-t border-border/50">
              <td className="py-1 text-slate-300">{t.moneyball.col[c]}</td>
              <td className="py-1 text-right"><Signed value={row[c]} /></td>
              <td className="py-1 pl-2 text-right text-muted-foreground tabular-nums">×{weights[c]}</td>
              <td className="py-1 pl-2 text-right font-medium"><Signed value={row[c] === null ? null : row[c]! * weights[c]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.stats && (
        <table className="w-full text-xs" title={t.moneyball.help.perf}>
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
  const [weights, setWeights] = useState(loadWeights)
  const [sort, setSort] = useState<MoneyballSort>('score')
  const [desc, setDesc] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<MoneyballRow | null>(null)
  const [comparing, setComparing] = useState<Player | null>(null)
  const shortlist = useShortlist(activeClub.id)
  const valueText = useValueFormat()

  useEffect(() => {
    try { localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights)) } catch { /* ignoré */ }
  }, [weights])

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
    const timer = setTimeout(() => setModel(buildModel(db, bestRoles, today)), 30)
    return () => clearTimeout(timer)
  }, [db, today, bestRoles])

  const tactic = tactics.find((tc) => tc.id === tacticId) ?? tactics[0] ?? null
  const team = useMemo(() => (tactic ? teamSlots(tactic.slots, players, roles) : []), [tactic, players, roles])
  const ownClub = useMemo(() => (db ? squadClubIndex(db, players) : -1), [db, players])
  const reach = useMemo(() => (model ? reachOf(model.clubLevels, ownClub, players) : null), [model, ownClub, players])
  const slotText = (s: TeamSlot) => `${t.positions[s.ip.position]} · ${roleName(s.ip.role)}`

  const filters = useDeferredValue(useMemo(() => {
    const num = (s: string, unit = 1) => {
      const n = Number(s.replace(',', '.'))
      return s.trim() === '' || !Number.isFinite(n) ? null : n * unit
    }
    return {
      search, slotId: slotId === ALL_SLOTS ? null : slotId, minAge: num(minAge), maxAge: num(maxAge),
      maxFee: num(maxFee, 1e6), maxWage: num(maxWage, 1e3), hideLoaned, onlyGain, ownClub, reach: realistic ? reach : null,
      only: onlyShortlist ? shortlist.keys : null, weights, sort, desc, limit: LIMIT,
    }
  }, [search, slotId, minAge, maxAge, maxFee, maxWage, hideLoaned, onlyGain, ownClub, realistic, reach, onlyShortlist, shortlist.keys, weights, sort, desc]))
  const result = useMemo(
    () => (db && model && today && team.length ? searchMoneyball(db, model, team, filters, today) : null),
    [db, model, today, team, filters])
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
  const levelOf = (club: number) => (model && club >= 0 ? model.clubLevels[club] : NaN)

  const columns: { id: string; label: string; title?: string; sort?: MoneyballSort; right?: boolean; cell: (r: MoneyballRow) => ReactNode }[] = [
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
      id: 'club', label: t.squad.col.club,
      cell: ({ player: p }) => (
        <span className="block max-w-44 truncate text-slate-300" title={t.moneyball.clubLevel(level(levelOf(p.club)), level(levelOf(ownClub)))}>
          {clubName(db, p.club) || '–'}
        </span>
      ),
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
    { id: 'gain', label: t.moneyball.col.gain, title: t.moneyball.help.gain, sort: 'gain', right: true, cell: (r) => <Signed value={r.gain} /> },
    { id: 'surplus', label: t.moneyball.col.surplus, title: t.moneyball.help.surplus, sort: 'surplus', right: true, cell: (r) => <Signed value={r.surplus} /> },
    {
      id: 'perf', label: t.moneyball.col.perf, title: t.moneyball.help.perf, sort: 'perf', right: true,
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <AvgRating value={r.player.avgRating} matches={r.player.ratedMatches} className="text-[11px]" />
          <Signed value={r.perf} />
        </span>
      ),
    },
    { id: 'contract', label: t.moneyball.col.contract, title: t.moneyball.help.contract, sort: 'contract', right: true, cell: (r) => <Signed value={r.contract} /> },
    { id: 'fee', label: t.moneyball.col.fee, title: t.moneyball.help.fee, sort: 'fee', right: true, cell: (r) => <span className="tabular-nums text-slate-300">{valueText(r.fee)}</span> },
    {
      id: 'wage', label: t.player.wage, sort: 'wage', right: true,
      cell: ({ player: p }) => <span className="tabular-nums text-slate-300">{p.wage !== null ? t.scouting.perWeek(p.wage.toLocaleString(lang)) : '–'}</span>,
    },
    { id: 'score', label: t.moneyball.col.score, title: t.moneyball.help.score, sort: 'score', right: true, cell: (r) => <Signed value={r.score} className="font-semibold" /> },
  ]

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
          title={reach ? t.moneyball.realisticTitle(level(reach.clubLevel), level(reach.level), valueText(reach.fee), wageText(reach.wage)) : undefined}>
          <Switch checked={realistic} onCheckedChange={setRealistic} />{t.moneyball.realistic}
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300" title={t.moneyball.onlyGainTitle}>
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
              <label key={c} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-xs" title={t.moneyball.help[c]}>
                <span className="text-slate-300">{t.moneyball.col[c]}</span>
                <input type="range" min={0} max={2} step={0.25} value={weights[c]} className="accent-emerald-500"
                  onChange={(e) => setWeights((w) => ({ ...w, [c]: Number(e.target.value) }))} />
                <span className="text-right tabular-nums">×{weights[c]}</span>
              </label>
            ))}
            <Button variant="ghost" size="sm" className="self-end" onClick={() => setWeights(DEFAULT_WEIGHTS)}>{t.moneyball.resetWeights}</Button>
          </PopoverContent>
        </Popover>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          {!result ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />{t.moneyball.computing}</div>
          ) : (
            <>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    {columns.map((c) => {
                      const active = c.sort === sort
                      const down = desc ?? moneyballDescending(sort)
                      return (
                        <th key={c.id} title={c.title} onClick={c.sort ? () => sortBy(c.sort!) : undefined}
                          className={cn('px-2.5 py-2 whitespace-nowrap', c.right && 'text-right', c.sort && 'cursor-pointer hover:text-slate-200', active && 'text-slate-200')}>
                          <span className={cn('inline-flex items-center gap-1', c.right && 'flex-row-reverse')}>
                            {c.label}
                            {active && (down ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.player.index} onClick={() => setSelected(row)}
                      className={cn('cursor-pointer border-b border-border/50 hover:bg-secondary/40', current?.player.index === row.player.index && 'bg-emerald-500/10')}>
                      {columns.map((c) => <td key={c.id} className={cn('px-2.5 py-1.5', c.right && 'text-right')}>{c.cell(row)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.total > result.rows.length && (
                <p className="px-5 py-3 text-xs text-muted-foreground">{t.scouting.more(result.total - result.rows.length)}</p>
              )}
            </>
          )}
        </div>
        <aside className="w-[26rem] shrink-0 overflow-y-auto border-l border-border bg-card/40">
          {current && selectedPlayer && model
            ? (
              <>
                <Breakdown row={current} model={model} weights={weights} slotText={slotText}
                  clubLine={t.moneyball.clubLevel(level(levelOf(current.player.club)), level(levelOf(ownClub)))} />
                <PlayerDetail player={selectedPlayer} roles={bestRoles} owner={clubName(db, current.player.owner)} onCompare={setComparing} />
              </>
            )
            : <EmptyState message={t.scouting.selectHint} />}
        </aside>
      </div>
      {comparing && <CompareDialog first={comparing} source="club" onClose={() => setComparing(null)} />}
    </div>
  )
}
