import { ChevronsUpDownIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useValueFormat } from '@/lib/useValueFormat'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ClubLogo } from '@/components/ClubLogo'
import { Flag } from '@/components/Nationality'
import { EmptyState, PageHeader, SectionTitle } from '@/components/layout'
import { scoreColor } from '@/components/styles'
import { loadScouting } from '@/data/fmSave'
import { clubReport, searchClubs, type ClubReport } from '@/domain/clubCompare'
import type { LineupSlot, RatedPlayer } from '@/domain/lineup'
import { clubLevels, squadClubIndex } from '@/domain/moneyball'
import { bestScores, scoutToday, type ScoutDb } from '@/domain/scouting'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'

/** Clubs proposés au plus dans le sélecteur. */
const CLUB_RESULTS = 50
/** Écart (en points de note) en dessous duquel deux valeurs sont jugées équivalentes. */
const TIE = 0.5

/** Comparaison de deux clubs de la sauvegarde, alignés dans la même tactique (par exemple avant un entretien). */
export function ClubComparePage() {
  const { t, lang, roleName } = useI18n()
  const { players, roles, tactics } = useStore()
  const valueText = useValueFormat()
  const [db, setDb] = useState<ScoutDb | null | undefined>(undefined)
  const [tacticId, setTacticId] = useState<number | null>(tactics[0]?.id ?? null)
  const [clubA, setClubA] = useState<number | null>(null)
  const [clubB, setClubB] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    loadScouting()
      .then((d) => { if (!cancelled) setDb(d) })
      .catch((e) => { if (!cancelled) { setDb(null); toast.error(String(e)) } })
    return () => { cancelled = true }
  }, [])

  const today = useMemo(() => (db ? scoutToday(db) : null), [db])
  // meilleure note de chaque joueur : rôles avec ballon et rôles perso (comme le Scouting)
  const bestRoles = useMemo(() => roles.filter((r) => r.phase !== 'oop'), [roles])
  const scores = useMemo(() => (db ? bestScores(db, bestRoles).scores : null), [db, bestRoles])
  const levels = useMemo(() => (db && scores ? clubLevels(db, scores) : null), [db, scores])
  // clubs du plus fort au plus faible (niveau inconnu à la fin)
  const order = useMemo(() => {
    if (!db || !levels) return []
    const lv = (i: number) => (Number.isNaN(levels[i]) ? -1 : levels[i])
    return db.clubs.map((_, i) => i).sort((a, b) => lv(b) - lv(a))
  }, [db, levels])
  const ownClub = useMemo(() => (db ? squadClubIndex(db, players) : -1), [db, players])
  const a = clubA ?? (ownClub >= 0 ? ownClub : null)

  const tactic = tactics.find((tc) => tc.id === tacticId) ?? tactics[0] ?? null
  // joueur de la base : id = -(index + 1), voir `scoutAsPlayer`
  const left = useMemo(
    () => (db && today && scores && tactic && a !== null ? clubReport(db, a, tactic.slots, roles, today, (p) => scores[-p.id - 1] ?? 0) : null),
    [db, today, scores, tactic, roles, a])
  const right = useMemo(
    () => (db && today && scores && tactic && clubB !== null ? clubReport(db, clubB, tactic.slots, roles, today, (p) => scores[-p.id - 1] ?? 0) : null),
    [db, today, scores, tactic, roles, clubB])

  if (db === undefined) {
    return <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />{t.common.loading}</div>
  }
  if (!db || !levels) {
    return <div className="flex h-full flex-col"><PageHeader title={t.clubCompare.title} /><EmptyState message={t.moneyball.noDb} /></div>
  }
  if (!tactic) {
    return <div className="flex h-full flex-col"><PageHeader title={t.clubCompare.title} /><EmptyState message={t.moneyball.noTactic} /></div>
  }

  const num = (v: number | null, digits = 1) => (v === null || Number.isNaN(v) ? '–' : v.toLocaleString(lang, { maximumFractionDigits: digits, minimumFractionDigits: digits }))
  const name = (club: number) => db.clubs[club]?.name ?? '–'

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t.clubCompare.title}>
        <ClubPicker db={db} order={order} levels={levels} value={a} onChange={setClubA} placeholder={t.clubCompare.pickOwn} />
        <span className="text-xs font-semibold text-muted-foreground uppercase">{t.compare.vs}</span>
        <ClubPicker db={db} order={order} levels={levels} value={clubB} onChange={setClubB} placeholder={t.clubCompare.pickOther} />
        <Select value={String(tactic.id)} onValueChange={(v) => setTacticId(Number(v))}>
          <SelectTrigger size="sm" className="ml-2 h-8 w-44" title={t.moneyball.tactic}><SelectValue /></SelectTrigger>
          <SelectContent>
            {tactics.map((tc) => <SelectItem key={tc.id} value={String(tc.id)}>{tc.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>

      {!left || !right ? (
        <EmptyState message={t.clubCompare.empty} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <Verdict left={left} right={right} nameA={name(left.club)} nameB={name(right.club)} />

          <div className="mt-5 grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
            <section>
              <SectionTitle>{t.clubCompare.summary}</SectionTitle>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-0.5 text-[13px]">
                <ClubHead club={name(left.club)} />
                <span />
                <ClubHead club={name(right.club)} right />
                <Metric label={t.clubCompare.xi} title={t.clubCompare.xiHint} a={left.summary.average} b={right.summary.average} text={num} strong />
                <Metric label={t.clubCompare.inPossession} a={left.summary.phases.ip} b={right.summary.phases.ip} text={num} />
                <Metric label={t.clubCompare.outOfPossession} a={left.summary.phases.oop} b={right.summary.phases.oop} text={num} />
                <Metric label={t.clubCompare.defence} a={left.summary.lines.defence} b={right.summary.lines.defence} text={num} />
                <Metric label={t.clubCompare.midfield} a={left.summary.lines.midfield} b={right.summary.lines.midfield} text={num} />
                <Metric label={t.clubCompare.attack} a={left.summary.lines.attack} b={right.summary.lines.attack} text={num} />
                <Metric label={t.clubCompare.depth} title={t.clubCompare.depthHint} a={left.depth} b={right.depth} text={num} strong />
                <Metric label={t.clubCompare.level} title={t.clubCompare.levelHint} a={left.level} b={right.level} text={num} strong />
                <Metric label={t.clubCompare.outOfPosition} a={left.summary.outOfPosition} b={right.summary.outOfPosition} text={(v) => num(v, 0)} lowerIsBetter />
                <Metric label={t.clubCompare.xiAge} a={left.summary.averageAge} b={right.summary.averageAge} text={num} neutral />
                <Metric label={t.clubCompare.squadAge} a={left.averageAge} b={right.averageAge} text={num} neutral />
                <Metric label={t.clubCompare.players} a={left.players.length} b={right.players.length} text={(v) => num(v, 0)} neutral />
                <Metric label={t.clubCompare.value} title={t.clubCompare.valueHint} a={left.value.total || null} b={right.value.total || null} text={valueText} neutral />
                <Metric label={t.clubCompare.topWage} title={t.clubCompare.wageHint} a={left.topWage} b={right.topWage}
                  text={(v) => (v === null ? '–' : t.scouting.perWeek(Math.round(v).toLocaleString(lang)))} neutral />
              </div>
            </section>

            <section>
              <SectionTitle>{t.clubCompare.bySlot(tactic.name)}</SectionTitle>
              <div className="space-y-0.5">
                {left.lineup.slots.map((s, i) => (
                  <SlotRow key={s.tacticSlot.slotId} label={`${t.positions[s.slot.position]} · ${roleName(s.role)}`}
                    oopRole={left.oop.slots[i].role.id !== s.role.id ? roleName(left.oop.slots[i].role) : null}
                    a={s} b={right.lineup.slots[i]} />
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

/** Conclusion : quel club a le meilleur XI dans la tactique, et de combien. */
function Verdict({ left, right, nameA, nameB }: { left: ClubReport; right: ClubReport; nameA: string; nameB: string }) {
  const { t, lang } = useI18n()
  const diff = right.summary.average - left.summary.average
  const depth = right.depth - left.depth
  const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`
  const better = diff > TIE
  const worse = diff < -TIE
  return (
    <div className={cn('rounded-lg border px-4 py-3',
      better ? 'border-emerald-500/40 bg-emerald-500/10' : worse ? 'border-rose-500/40 bg-rose-500/10' : 'border-border bg-secondary/30')}>
      <p className="text-sm font-semibold text-slate-100">
        {better ? t.clubCompare.verdictBetter(nameB, nameA) : worse ? t.clubCompare.verdictWorse(nameB, nameA) : t.clubCompare.verdictEqual(nameB, nameA)}
      </p>
      <p className="mt-0.5 text-xs text-slate-300">{t.clubCompare.verdictDetail(fmt(diff), fmt(depth))}</p>
    </div>
  )
}

function ClubHead({ club, right }: { club: string; right?: boolean }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 pb-1 text-xs font-semibold text-slate-200', right && 'flex-row-reverse text-right')}>
      <ClubLogo name={club} size={18} /><span className="truncate">{club}</span>
    </span>
  )
}

/** Une ligne du bilan : valeur de chaque club, la meilleure en vert (sauf pour les valeurs neutres). */
function Metric({ label, title, a, b, text, strong, neutral, lowerIsBetter }: {
  label: string
  title?: string
  a: number | null
  b: number | null
  text: (v: number | null) => string
  strong?: boolean
  neutral?: boolean
  lowerIsBetter?: boolean
}) {
  const known = a !== null && b !== null && !Number.isNaN(a) && !Number.isNaN(b)
  const sign = known && !neutral && Math.abs(a - b) >= TIE ? Math.sign((b - a) * (lowerIsBetter ? -1 : 1)) : 0
  const cell = (v: number | null, wins: boolean, right?: boolean) => (
    <span className={cn('rounded px-1.5 py-0.5 tabular-nums', right ? 'text-left' : 'text-right',
      wins ? 'font-semibold text-emerald-300' : 'text-slate-300', strong && 'text-sm')}>
      {text(v)}
    </span>
  )
  return (
    <>
      {cell(a, sign < 0)}
      <span title={title} className={cn('px-2 text-center text-xs text-muted-foreground', strong && 'font-medium text-slate-300', title && 'cursor-help')}>{label}</span>
      {cell(b, sign > 0, true)}
    </>
  )
}

/** Un poste de la tactique : titulaire (et doublure) de chaque club, écart de note globale au milieu. */
function SlotRow({ label, oopRole, a, b }: { label: string; oopRole: string | null; a: LineupSlot; b: LineupSlot }) {
  const diff = Math.round(b.starter?.overall ?? 0) - Math.round(a.starter?.overall ?? 0)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1 odd:bg-secondary/25">
      <Starter starter={a.starter} backup={a.backups[0] ?? null} />
      <span className="min-w-0 text-center">
        <span className="block truncate text-[11px] text-slate-300" title={label}>{label}</span>
        {oopRole && <span className="block truncate text-[10px] text-muted-foreground" title={oopRole}>{oopRole}</span>}
        <span className={cn('text-xs font-semibold tabular-nums', diff > 0 ? 'text-emerald-300' : diff < 0 ? 'text-rose-300' : 'text-muted-foreground')}>
          {diff > 0 ? `→ +${diff}` : diff < 0 ? `+${-diff} ←` : '='}
        </span>
      </span>
      <Starter starter={b.starter} backup={b.backups[0] ?? null} right />
    </div>
  )
}

function Starter({ starter, backup, right }: { starter: RatedPlayer | null; backup: RatedPlayer | null; right?: boolean }) {
  const { t } = useI18n()
  if (!starter) return <span className={cn('text-xs text-slate-600', right && 'text-right')}>{t.clubCompare.emptySlot}</span>
  return (
    <span className={cn('flex min-w-0 items-center gap-2', right && 'flex-row-reverse text-right')}>
      <OverallChip value={starter.overall} />
      <span className="min-w-0">
        <span className={cn('flex items-center gap-1.5 text-[13px] text-slate-200', right && 'flex-row-reverse')}>
          {starter.player.nationality && <Flag code={starter.player.nationality} />}
          <span className="truncate">{starter.player.name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{starter.player.age}</span>
        </span>
        {backup && (
          <span className="block truncate text-[11px] text-muted-foreground">
            {t.clubCompare.backup(backup.player.name, backup.overall.toFixed(0))}
          </span>
        )}
      </span>
    </span>
  )
}

function OverallChip({ value }: { value: number }) {
  return (
    <span className={cn('inline-flex h-5 min-w-8 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums ring-1', scoreColor(value))}>
      {value.toFixed(0)}
    </span>
  )
}

/** Choix d'un club de la sauvegarde, avec recherche par nom (du plus fort au plus faible). */
function ClubPicker({ db, order, levels, value, onChange, placeholder }: {
  db: ScoutDb
  order: number[]
  levels: Float32Array
  value: number | null
  onChange: (club: number) => void
  placeholder: string
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const found = open ? searchClubs(db, query, order, CLUB_RESULTS) : []
  const club = value !== null ? db.clubs[value] : null
  const level = (i: number): ReactNode => (Number.isNaN(levels[i]) ? '–' : levels[i].toLocaleString(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 }))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button"
          className="flex h-8 w-60 min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30">
          {club && <ClubLogo name={club.name} size={18} />}
          <span className={cn('flex-1 truncate', !club && 'text-muted-foreground')}>{club?.name ?? placeholder}</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t.player.club} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t.clubCompare.noClub}</CommandEmpty>
            <CommandGroup>
              {found.map((i) => (
                <CommandItem key={i} value={`club-${i}`} data-checked={i === value} onSelect={() => { onChange(i); setOpen(false) }}>
                  {db.clubs[i].nation ? <Flag code={db.clubs[i].nation} /> : <span className="w-4" />}
                  <span className="min-w-0 flex-1 truncate text-[13px]">{db.clubs[i].name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums" title={t.clubCompare.levelHint}>{level(i)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
