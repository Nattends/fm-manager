import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, RefreshCwIcon, SearchIcon, UserPlusIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PositionChip } from '@/components/chips'
import { ClubLogo, PlayerClub } from '@/components/ClubLogo'
import { Flag, Nationality } from '@/components/Nationality'
import { SectionTitle } from '@/components/layout'
import { RoleSelect } from '@/components/RoleSelect'
import { PlayerAvatar, RatingBadge } from '@/components/ui'
import { attrColor } from '@/components/styles'
import { loadScouting } from '@/data/fmSave'
import { attributesOf, FIRST_SET_PIECE, type AttributeGroup } from '@/domain/attributes'
import { compareAttributes, compareRoles, countBetter, searchByName, type Side } from '@/domain/compare'
import { POSITIONS } from '@/domain/positions'
import { bestRole, rateRole } from '@/domain/rating'
import { scoutAsPlayer, scoutToday, type ScoutDb } from '@/domain/scouting'
import type { Player, RoleDefinition } from '@/domain/types'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'

/** Où chercher le joueur à comparer : l'effectif du club actif ou la base de scouting. */
export type CompareSource = 'club' | 'database'

/** Joueurs de la base proposés au plus dans le sélecteur. */
const DB_RESULTS = 30

/** Poids d'un attribut dans le rôle comparé : ×5 essentiel, ×3 clé, ×1 préféré. */
function weightTone(weight: number): string {
  if (weight >= 5) return 'text-amber-300'
  if (weight >= 3) return 'text-emerald-300'
  return 'text-sky-300'
}

/** Joueur de la base de scouting (id négatif, voir `scoutAsPlayer`). */
const isScout = (p: Player) => p.id < 0

/** Sélecteur d'un joueur : effectif du club actif ou base de scouting, avec recherche par nom. */
function PlayerPicker({ source, roles, onPick, children }: {
  source: CompareSource
  roles: RoleDefinition[]
  onPick: (p: Player) => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const { players } = useStore()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<CompareSource>(source)
  const [query, setQuery] = useState('')
  const [db, setDb] = useState<ScoutDb | null | undefined>(undefined)

  useEffect(() => {
    if (!open || tab !== 'database' || db !== undefined) return
    let cancelled = false
    loadScouting()
      .then((d) => { if (!cancelled) setDb(d) })
      .catch(() => { if (!cancelled) setDb(null) })
    return () => { cancelled = true }
  }, [open, tab, db])

  // listes calculées seulement à l'ouverture (meilleure note de chaque joueur proposé)
  const clubRows = open && tab === 'club'
    ? searchByName(players, query, 60).map((p) => ({ p, best: bestRole(p, roles) }))
    : []
  const dbRows = open && tab === 'database' && db && query.trim().length >= 2
    ? searchByName(db.players, query, DB_RESULTS).map((s) => {
      const p = scoutAsPlayer(s, db, scoutToday(db))
      return { key: s.index, p, best: bestRole(p, roles) }
    })
    : []

  const pick = (p: Player) => {
    onPick(p)
    setOpen(false)
  }
  const row = (p: Player, best: ReturnType<typeof bestRole>, meta: ReactNode) => (
    <>
      {isScout(p) ? (p.nationality ? <Flag code={p.nationality} /> : <span className="w-4" />) : <PlayerAvatar player={p} size={22} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{p.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{meta}</span>
      </span>
      {best && <RatingBadge rating={best.rating} size="sm" />}
    </>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="center">
        <div className="flex gap-1 border-b border-border p-1.5">
          {(['club', 'database'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setTab(s)}
              className={cn('flex-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                tab === s ? 'bg-secondary text-slate-100' : 'text-muted-foreground hover:bg-secondary/50')}>
              {s === 'club' ? t.compare.myClub : t.compare.database}
            </button>
          ))}
        </div>
        <Command shouldFilter={false}>
          <CommandInput placeholder={t.scouting.search} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-80">
            {tab === 'club' && (
              <>
                <CommandEmpty>{t.compare.noPlayer}</CommandEmpty>
                <CommandGroup>
                  {clubRows.map(({ p, best }) => (
                    <CommandItem key={p.id} value={`club-${p.id}`} onSelect={() => pick(p)}>
                      {row(p, best, <>{t.player.ageValue(p.age)}{p.onLoan && <> · {t.player.loanedTo(p.club)}</>}</>)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {tab === 'database' && (
              db === undefined
                ? <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />{t.common.loading}</p>
                : !db
                  ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t.compare.noDatabase}</p>
                  : query.trim().length < 2
                    ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t.compare.typeToSearch}</p>
                    : (
                      <>
                        <CommandEmpty>{t.compare.noPlayer}</CommandEmpty>
                        <CommandGroup>
                          {dbRows.map(({ key, p, best }) => (
                            <CommandItem key={key} value={`db-${key}`} onSelect={() => pick(p)}>
                              {row(p, best, <>{t.player.ageValue(p.age)} · {p.club || t.scouting.free}</>)}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </>
                    )
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** En-tête d'un des deux joueurs (le second est en miroir). */
function SideCard({ player, side, roles, source, onPick }: {
  player: Player | null
  side: Side
  roles: RoleDefinition[]
  source: CompareSource
  onPick: (p: Player) => void
}) {
  const { t, roleName } = useI18n()
  const right = side === 'b'
  if (!player) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-6">
        <PlayerPicker source={source} roles={roles} onPick={onPick}>
          <Button variant="outline"><UserPlusIcon />{t.compare.pick}</Button>
        </PlayerPicker>
      </div>
    )
  }
  const best = bestRole(player, roles)
  const positions = POSITIONS.filter((p) => player.positions[p] !== undefined)
    .sort((x, y) => (player.positions[y] ?? 0) - (player.positions[x] ?? 0))
    .slice(0, 4)
  return (
    <div className={cn('flex min-w-0 items-start gap-4 rounded-lg bg-secondary/30 p-4', right && 'flex-row-reverse text-right')}>
      <PlayerAvatar player={player} size={64} />
      <div className={cn('min-w-0 flex-1 space-y-1.5', right && 'flex flex-col items-end')}>
        <div className={cn('flex min-w-0 items-center gap-2', right && 'flex-row-reverse')}>
          <span className="truncate text-lg font-semibold text-slate-50">{player.name}</span>
          <PlayerPicker source={source} roles={roles} onPick={onPick}>
            <Button variant="ghost" size="icon-xs" title={t.compare.change} aria-label={t.compare.change}><RefreshCwIcon /></Button>
          </PlayerPicker>
        </div>
        <div className={cn('flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground', right && 'justify-end')}>
          {t.player.ageValue(player.age)}
          {player.nationality.trim() && <> · <Nationality value={player.nationality} /></>}
          {' · '}{t.player.footValue(t.foot[player.foot])}
        </div>
        {isScout(player)
          ? (
            <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-sm text-slate-200', right && 'flex-row-reverse')}>
              <ClubLogo name={player.club} size={18} />
              <span className="truncate">{player.club || t.scouting.free}</span>
            </span>
          )
          : <PlayerClub player={player} className="text-sm text-slate-200" />}
        <div className={cn('flex flex-wrap gap-1', right && 'justify-end')}>
          {positions.map((p) => <PositionChip key={p} position={p} familiarity={player.positions[p]} />)}
        </div>
      </div>
      {best && (
        <div className={cn('flex shrink-0 flex-col gap-1', right ? 'items-start text-left' : 'items-end')}>
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{t.squad.col.bestRole}</span>
          <RatingBadge rating={best.rating} size="lg" />
          <span className="max-w-36 truncate text-[11px] text-slate-300">{roleName(best.role)}</span>
        </div>
      )}
    </div>
  )
}

/** Écart de note entre les deux joueurs, la flèche pointe vers le meilleur. */
function Diff({ value, className }: { value: number; className?: string }) {
  const rounded = Math.round(value)
  if (rounded === 0) return <span className={cn('text-xs text-muted-foreground tabular-nums', className)}>=</span>
  const Icon = rounded > 0 ? ChevronLeftIcon : ChevronRightIcon
  return (
    <span className={cn('inline-flex items-center text-xs font-semibold text-emerald-300 tabular-nums', rounded < 0 && 'flex-row-reverse', className)}>
      <Icon className="size-3.5" />+{Math.abs(rounded)}
    </span>
  )
}

/** Comparaison de deux joueurs : attributs côte à côte et notes par rôle. */
export function CompareDialog({ first, source, onClose }: {
  first: Player
  /** Source proposée d'abord pour choisir l'autre joueur. */
  source: CompareSource
  onClose: () => void
}) {
  const { t, roleName } = useI18n()
  const { roles } = useStore()
  // meilleure note : rôles avec ballon et rôles perso (comme le scouting)
  const bestRoles = useMemo(() => roles.filter((r) => r.phase !== 'oop'), [roles])
  const [a, setA] = useState(first)
  const [b, setB] = useState<Player | null>(null)
  const [role, setRole] = useState<RoleDefinition | null>(() => bestRole(first, bestRoles)?.role ?? null)
  const [roleSearch, setRoleSearch] = useState('')
  const [playedOnly, setPlayedOnly] = useState(true)

  const isGk = a.positions.GK !== undefined || b?.positions.GK !== undefined
  const groups: AttributeGroup[] = isGk ? ['goalkeeping', 'technical', 'mental', 'physical'] : ['technical', 'mental', 'physical']
  const attributeRows = b ? compareAttributes(a, b, groups.flatMap((g) => attributesOf(g))) : []
  const byKey = new Map(attributeRows.map((r) => [r.key, r]))
  const better = countBetter(attributeRows)
  const inRole = role ? countBetter(attributeRows.filter((r) => role.weights[r.key])) : null
  const q = roleSearch.trim().toLowerCase()
  const roleRows = useMemo(() => (b ? compareRoles(a, b, roles, playedOnly) : []), [a, b, roles, playedOnly])
    .filter((r) => !q || roleName(r.role).toLowerCase().includes(q))
  const ratingA = role ? rateRole(a, role) : null
  const ratingB = role && b ? rateRole(b, role) : null

  const valueCell = (v: number | undefined, side: Side, winner: Side | null) => (
    <span className={cn('rounded py-px text-center font-semibold tabular-nums', attrColor(v),
      winner === side && 'bg-emerald-500/20 ring-1 ring-emerald-400/50',
      winner && winner !== side && 'opacity-55')}>
      {v ?? '–'}
    </span>
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogTitle className="sr-only">{t.compare.title}</DialogTitle>
        <DialogDescription className="sr-only">{t.compare.description}</DialogDescription>

        {/* En-tête : les deux joueurs, et au centre le rôle comparé */}
        <div className="grid grid-cols-[minmax(0,1fr)_15rem_minmax(0,1fr)] items-stretch gap-4 border-b border-border p-5 pr-12">
          <SideCard player={a} side="a" roles={bestRoles} source={isScout(first) ? 'database' : 'club'} onPick={setA} />
          <div className="flex flex-col items-center justify-center gap-2">
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{t.compare.role}</span>
            <RoleSelect roles={roles} value={role} onChange={setRole} className="w-full" />
            {ratingA && (
              <div className="flex items-center gap-3">
                <RatingBadge rating={ratingA} size="lg" />
                {ratingB ? <Diff value={ratingA.score - ratingB.score} /> : <span className="text-xs text-muted-foreground">{t.compare.vs}</span>}
                {ratingB ? <RatingBadge rating={ratingB} size="lg" /> : <span className="h-8 w-12 rounded-md border border-dashed border-border" />}
              </div>
            )}
          </div>
          <SideCard player={b} side="b" roles={bestRoles} source={source} onPick={setB} />
        </div>

        {b ? (
          <Tabs defaultValue="attributes" className="min-h-[26rem] min-w-0 flex-1 gap-0 overflow-hidden">
            <TabsList variant="line" className="w-full justify-start border-b border-border px-5">
              <TabsTrigger value="attributes" className="flex-none px-3">{t.player.tabAttributes}</TabsTrigger>
              <TabsTrigger value="roles" className="flex-none px-3">{t.player.tabRoles}</TabsTrigger>
              <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <span><span className="font-semibold text-emerald-300 tabular-nums">{better.a}</span> – <span className="font-semibold text-emerald-300 tabular-nums">{better.b}</span> {t.compare.betterAttributes}</span>
                {role && inRole && <span>· {t.compare.inRole(inRole.a, inRole.b)}</span>}
              </span>
            </TabsList>

            <TabsContent value="attributes" className="min-h-0 overflow-y-auto p-5">
              <div className={cn('grid gap-6', groups.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
                {groups.map((g) => (
                  <div key={g}>
                    <SectionTitle>{t.attributeGroups[g]}</SectionTitle>
                    <div className="space-y-0.5">
                      {attributesOf(g).map((key) => {
                        const r = byKey.get(key)
                        const weight = role?.weights[key] ?? 0
                        return (
                          <div key={key} className={cn('grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-1.5 rounded px-1 py-0.5 text-[13px] odd:bg-secondary/30',
                            key === FIRST_SET_PIECE && 'relative mt-3 before:absolute before:inset-x-1.5 before:-top-[7px] before:border-t before:border-border')}>
                            {valueCell(r?.a, 'a', r?.better ?? null)}
                            <span className={cn('flex min-w-0 items-center justify-center gap-1 text-center', role && !weight ? 'text-slate-500' : 'text-slate-300')}>
                              <span className="truncate">{t.attributes[key]}</span>
                              {weight > 0 && <span className={cn('shrink-0 text-[10px] font-semibold', weightTone(weight))} title={t.compare.weightTitle(weight)}>×{weight}</span>}
                            </span>
                            {valueCell(r?.b, 'b', r?.better ?? null)}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="roles" className="flex min-h-0 flex-col">
              <div className="flex items-center gap-4 border-b border-border px-5 py-2.5">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input className="h-8 w-64 pl-8" placeholder={t.player.searchRole} value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="compare-played" checked={playedOnly} onCheckedChange={setPlayedOnly} />
                  <Label htmlFor="compare-played" className="text-xs text-slate-300">{t.compare.playedByEither}</Label>
                </div>
                <span className="ml-auto text-xs text-muted-foreground">{t.compare.pickRoleHint}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {roleRows.map((r) => (
                    <button key={r.role.id} type="button" onClick={() => setRole(r.role)}
                      className={cn('grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem_2.5rem] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary/40',
                        role?.id === r.role.id && 'bg-emerald-500/10 ring-1 ring-emerald-500/30')}>
                      <RatingBadge rating={r.a} className={cn(!r.aPlays && 'opacity-50')} />
                      <span className="min-w-0 text-center">
                        <span className="block truncate text-[13px] text-slate-200">{roleName(r.role)}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{r.role.positions.map((p) => t.positions[p]).join(' / ')}</span>
                      </span>
                      <Diff value={r.diff} className="justify-center" />
                      <RatingBadge rating={r.b} className={cn(!r.bPlays && 'opacity-50')} />
                    </button>
                  ))}
                </div>
                {roleRows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t.tactic.noRole}</p>}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="flex min-h-[26rem] flex-1 items-center justify-center p-10 text-sm text-muted-foreground">{t.compare.empty}</p>
        )}

        <div className="flex items-center justify-end border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose}>{t.common.close}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
