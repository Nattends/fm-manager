import { Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EmptyState, PageHeader } from '@/components/layout'
import { PositionChip } from '@/components/chips'
import { Flag } from '@/components/Nationality'
import { PlayerDetail } from '@/components/PlayerDetail'
import { AvgRating, RatingBadge } from '@/components/ui'
import { saveYouth, scanSave } from '@/data/fmSave'
import { saveFields, todayGameDate, youthTeamLabel, type GameDate, type YouthPlayer } from '@/domain/fmSave'
import type { Position } from '@/domain/positions'
import { rolesForPlayer } from '@/domain/rating'
import { SCOUT_PLAYS_AT } from '@/domain/scouting'
import type { Player } from '@/domain/types'
import { getSaveLink } from '@/lib/saveLink'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import { CompareDialog } from './CompareDialog'

interface YouthRow {
  /** Équipe (« U19 », « B »…). */
  team: string
  player: Player
  best: ReturnType<typeof rolesForPlayer>[number] | null
}

/** Joueur de l'application tiré d'un joueur de la sauvegarde (identifiant négatif : jamais dans l'effectif). */
function asPlayer(y: YouthPlayer, index: number, team: string, today: GameDate): Player {
  return {
    ...saveFields(y, today),
    id: -(index + 1),
    clubId: 0,
    club: team,
    onLoan: false,
    caStars: 0,
    paStars: 0,
    status: 'rotation',
    notes: '',
    photo: null,
    photoLookup: null,
  }
}

/** Équipes de jeunes (U19…) et affiliées (B, C…) du club actif, lues dans la sauvegarde liée. */
export function YouthPage() {
  const { t, roleName } = useI18n()
  const { roles, activeClub } = useStore()
  const link = getSaveLink(activeClub.id)
  const [rows, setRows] = useState<YouthRow[] | null>(null)
  const [loading, setLoading] = useState(!!link)
  const [team, setTeam] = useState('all')
  const [selected, setSelected] = useState<Player | null>(null)
  const [comparing, setComparing] = useState<Player | null>(null)
  // rôles avec ballon : les rôles sans ballon n'ont que 2-3 attributs clés
  const bestRoles = useMemo(() => roles.filter((r) => r.phase !== 'oop'), [roles])

  const [reloads, setReloads] = useState(0)
  useEffect(() => {
    if (!link) return
    let cancelled = false
    ;(async () => {
      try {
        const summary = await scanSave(link.path)
        const clubId = link.saveClubId ?? summary.managedClubId
        if (clubId === null) throw new Error('club introuvable dans la sauvegarde')
        const today = summary.gameDate ?? todayGameDate()
        const youth = await saveYouth(link.path, clubId)
        if (cancelled) return
        setRows(youth.map((y, i) => {
          const label = youthTeamLabel(y.kind, y.rank)
          const player = asPlayer(y, i, label, today)
          return { team: label, player, best: rolesForPlayer(player, bestRoles)[0] ?? null }
        }))
      } catch (e) {
        if (cancelled) return
        toast.error(t.youth.readFailed(String(e)))
        setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [link?.path, link?.saveClubId, bestRoles, t, reloads]) // eslint-disable-line react-hooks/exhaustive-deps
  const reload = () => { setLoading(true); setReloads((n) => n + 1) }
  const teams = useMemo(() => [...new Set((rows ?? []).map((r) => r.team))], [rows])
  const shown = useMemo(
    () => (rows ?? []).filter((r) => team === 'all' || r.team === team)
      .sort((a, b) => (b.best?.rating.score ?? 0) - (a.best?.rating.score ?? 0)),
    [rows, team])

  if (!link) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title={t.youth.title} />
        <EmptyState message={t.youth.noSave} />
      </div>
    )
  }

  const played = (p: Player) => (Object.entries(p.positions) as [Position, number][])
    .filter(([, v]) => v >= SCOUT_PLAYS_AT).sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t.youth.title} count={rows ? t.youth.count(shown.length) : undefined}
        actions={(
          <Button variant="outline" size="sm" className="h-8" onClick={reload} disabled={loading}>
            {loading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}{t.youth.reload}
          </Button>
        )}>
        <ToggleGroup type="single" variant="outline" size="sm" value={team}
          onValueChange={(v) => { if (v) setTeam(v) }}>
          <ToggleGroupItem value="all" title={t.youth.hint}>{t.youth.all}</ToggleGroupItem>
          {teams.map((x) => <ToggleGroupItem key={x} value={x} title={t.youth.teamTitle(x)}>{x}</ToggleGroupItem>)}
        </ToggleGroup>
      </PageHeader>

      {rows === null ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />{t.common.loading}</div>
      ) : rows.length === 0 ? (
        <EmptyState message={t.youth.empty} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2.5 py-2">{t.fmImport.nameCol}</th>
                  <th className="px-2.5 py-2">{t.youth.team}</th>
                  <th className="px-2.5 py-2 text-right">{t.squad.col.age}</th>
                  <th className="px-2.5 py-2">{t.squad.col.positions}</th>
                  <th className="px-2.5 py-2">{t.player.contractEnd}</th>
                  <th className="px-2.5 py-2 text-right">{t.rating.avgShort}</th>
                  <th className="px-2.5 py-2 text-right">{t.scouting.bestRating}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ player: p, team: label, best }) => (
                  <tr key={p.id} onClick={() => setSelected(p)}
                    className={cn('cursor-pointer border-b border-border/50 hover:bg-secondary/40', selected?.id === p.id && 'bg-emerald-500/10')}>
                    <td className="px-2.5 py-1.5 font-medium">
                      <span className="inline-flex items-center gap-1.5">{p.nationality && <Flag code={p.nationality} />}{p.name}</span>
                    </td>
                    <td className="px-2.5 py-1.5 text-slate-300">{label}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{p.age}</td>
                    <td className="px-2.5 py-1.5">
                      <span className="inline-flex gap-1">{played(p).map(([pos, v]) => <PositionChip key={pos} position={pos} familiarity={v} />)}</span>
                    </td>
                    <td className="px-2.5 py-1.5 tabular-nums text-slate-300">{p.contractEnd ?? '–'}</td>
                    <td className="px-2.5 py-1.5 text-right"><AvgRating value={p.avgRating ?? null} matches={p.ratedMatches ?? 0} className="text-xs" /></td>
                    <td className="px-2.5 py-1.5">
                      {best && (
                        <span className="flex items-center justify-end gap-2">
                          <span className="max-w-40 truncate text-[11px] text-muted-foreground">{roleName(best.role)}</span>
                          <RatingBadge rating={best.rating} size="sm" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="w-[26rem] shrink-0 overflow-y-auto border-l border-border bg-card/40">
            {selected
              ? <PlayerDetail player={selected} roles={bestRoles} onCompare={setComparing} />
              : <EmptyState message={t.scouting.selectHint} />}
          </aside>
        </div>
      )}
      {comparing && <CompareDialog first={comparing} source="club" onClose={() => setComparing(null)} />}
    </div>
  )
}
