import { Loader2Icon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ClubLogo, PlayerClub } from '@/components/ClubLogo'
import { Flag } from '@/components/Nationality'
import { SectionTitle } from '@/components/layout'
import { RoleSelect } from '@/components/RoleSelect'
import { PlayerAvatar, RatingBadge } from '@/components/ui'
import { scoreColor } from '@/components/styles'
import { loadScouting } from '@/data/fmSave'
import { allRoleRatings } from '@/domain/rating'
import {
  defaultTarget, rateTarget, scoutReplacements, squadReplacements, tacticTargets, targetParts,
  type TacticTarget, type TargetPart, type TargetRating,
} from '@/domain/replacements'
import { clubName, scoutAsPlayer, scoutToday, type ScoutDb } from '@/domain/scouting'
import type { Player, RoleDefinition } from '@/domain/types'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'

/** Joueurs de la base affichés au plus. */
const DB_LIMIT = 100
/** Choix « rôle au choix » du sélecteur de poste (Radix Select refuse une valeur vide). */
const FREE_ROLE = 'role'

const targetKey = (t: TacticTarget) => `${t.tacticId}:${t.slotId}`

/**
 * Onglet « Remplaçants » de la fiche : effectif et base de scouting qui font aussi bien ou mieux sur un poste
 * d'une tactique (notes avec et sans ballon, comme le meilleur XI), ou sur un rôle au choix.
 */
export function ReplacementsTab({ player, onCompare }: { player: Player; onCompare: (other: Player, role: RoleDefinition) => void }) {
  const { t, roleName, money } = useI18n()
  const { players, roles, tactics } = useStore()
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  // postes de toutes les tactiques du club, du gardien à l'attaque
  const groups = useMemo(() => tactics.map((tactic) => ({
    tactic,
    targets: tacticTargets(tactic, roles)
      .map((target, i) => ({ target, slot: tactic.slots[i] }))
      .sort((a, b) => b.slot.row - a.slot.row || a.slot.col - b.slot.col)
      .map((x) => x.target),
  })), [tactics, roles])
  const allTargets = useMemo(() => groups.flatMap((g) => g.targets), [groups])
  const proposed = useMemo(() => defaultTarget(player, allTargets), [player, allTargets])

  // rôles du meilleur au moins bon pour ce joueur (rôle au choix)
  const sortedRoles = useMemo(() => allRoleRatings(player, roles).map((r) => r.role), [player, roles])
  const [choice, setChoice] = useState<string | null>(null)
  const [pickedRole, setPickedRole] = useState<RoleDefinition | null>(null)
  const key = choice ?? (proposed ? targetKey(proposed) : FREE_ROLE)
  const slot = allTargets.find((x) => targetKey(x) === key) ?? null
  const freeRole = pickedRole ?? sortedRoles[0] ?? null
  const parts = useMemo<TargetPart[] | null>(() => (slot ? targetParts(slot) : freeRole ? [{ role: freeRole }] : null), [slot, freeRole])
  // rôle comparé dans la fenêtre de comparaison : celui avec ballon du poste
  const compareRole = slot ? slot.ip.role : freeRole

  const [maxAge, setMaxAge] = useState('')
  const [hideLoaned, setHideLoaned] = useState(false)
  const [db, setDb] = useState<ScoutDb | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    loadScouting()
      .then((d) => { if (!cancelled) setDb(d) })
      .catch(() => { if (!cancelled) setDb(null) })
    return () => { cancelled = true }
  }, [])

  const own = parts ? rateTarget(player, parts) : null
  const squadRows = useMemo(() => (parts ? squadReplacements(player, players, parts) : []), [player, players, parts])
  const age = maxAge.trim() === '' ? null : Number(maxAge)
  const dbResult = useMemo(
    () => (parts && db ? scoutReplacements(player, players, db, parts, scoutToday(db), {
      maxAge: age !== null && Number.isFinite(age) ? age : null, hideLoaned, limit: DB_LIMIT,
    }) : null),
    [player, players, db, parts, age, hideLoaned],
  )

  if (!parts || !compareRole || !own?.parts.every((p) => p.rated)) {
    return <p className="p-8 text-center text-sm text-muted-foreground">{t.player.noAttributes}</p>
  }

  const slotLabel = (x: TacticTarget) => {
    const holder = x.playerId === player.id ? t.replacements.himself : x.playerId !== null ? byId.get(x.playerId)?.name : null
    const rolesText = x.ip.role.id === x.oop.role.id ? roleName(x.ip.role) : `${roleName(x.ip.role)} / ${roleName(x.oop.role)}`
    return `${t.positions[x.ip.position]} · ${rolesText}${holder ? ` (${holder})` : ''}`
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-2.5">
        <Select value={key} onValueChange={setChoice}>
          <SelectTrigger size="sm" className="w-80"><SelectValue /></SelectTrigger>
          <SelectContent position="popper" className="max-h-96">
            {groups.map(({ tactic, targets }) => (
              <SelectGroup key={tactic.id}>
                {groups.length > 1 && <SelectLabel>{tactic.name}</SelectLabel>}
                {targets.map((x) => <SelectItem key={targetKey(x)} value={targetKey(x)} className="text-xs">{slotLabel(x)}</SelectItem>)}
              </SelectGroup>
            ))}
            {groups.length > 0 && <SelectSeparator />}
            <SelectItem value={FREE_ROLE} className="text-xs">{t.replacements.freeRole}</SelectItem>
          </SelectContent>
        </Select>
        {!slot && <RoleSelect roles={sortedRoles} value={freeRole} onChange={setPickedRole} className="w-56" />}
        <span className="flex items-center gap-2 text-xs text-slate-300">
          {t.replacements.target}<Score rating={own} />
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="repl-age" className="text-xs text-slate-300">{t.replacements.maxAge}</Label>
          <Input id="repl-age" className="h-8 w-16" inputMode="numeric" value={maxAge} onChange={(e) => setMaxAge(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="repl-loaned" checked={hideLoaned} onCheckedChange={setHideLoaned} />
          <Label htmlFor="repl-loaned" className="text-xs text-slate-300">{t.replacements.hideLoaned}</Label>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-3">
        <section>
          <SectionTitle>{t.replacements.squad(squadRows.length)}</SectionTitle>
          {squadRows.length === 0
            ? <p className="px-2 text-sm text-muted-foreground">{t.replacements.noneInSquad}</p>
            : squadRows.map((r) => (
              <Row key={r.player.id} rating={r} target={own.score} onClick={() => onCompare(r.player, compareRole)}
                avatar={<PlayerAvatar player={r.player} size={26} />} name={r.player.name} age={t.player.ageValue(r.player.age)}
                nationality={r.player.nationality} club={<PlayerClub player={r.player} size={16} className="text-xs text-slate-300" />}
                value={money(r.player.value)} wage={money(r.player.wage)} />
            ))}
        </section>

        <section>
          <SectionTitle>
            {dbResult ? t.replacements.database(dbResult.total, Math.min(dbResult.total, DB_LIMIT)) : t.compare.database}
          </SectionTitle>
          {db === undefined
            ? <p className="flex items-center gap-2 px-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />{t.common.loading}</p>
            : !db || !dbResult
              ? <p className="px-2 text-sm text-muted-foreground">{t.compare.noDatabase}</p>
              : dbResult.rows.length === 0
                ? <p className="px-2 text-sm text-muted-foreground">{t.replacements.noneInDatabase}</p>
                : dbResult.rows.map((r) => {
                  const s = r.player
                  const club = clubName(db, s.club)
                  return (
                    <Row key={s.index} rating={r} target={own.score} onClick={() => onCompare(scoutAsPlayer(s, db, scoutToday(db)), compareRole)}
                      name={s.name} age={t.player.ageValue(r.age)} nationality={s.nationality}
                      club={(
                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-300">
                          <ClubLogo name={club} size={16} />
                          <span className="truncate">{club || t.scouting.free}</span>
                          {s.owner >= 0 && <span className="shrink-0 text-muted-foreground">· {t.replacements.loanedFrom(clubName(db, s.owner))}</span>}
                        </span>
                      )}
                      value={money(s.value)} wage={money(s.wage)} />
                  )
                })}
        </section>
      </div>
    </div>
  )
}

/** Note sur la cible : badge du rôle seul, ou moyenne avec / sans ballon d'un poste (détail au survol). */
function Score({ rating }: { rating: TargetRating }) {
  const { t } = useI18n()
  if (rating.parts.length === 1) return <RatingBadge rating={rating.parts[0]} size="sm" />
  const [ip, oop] = rating.parts
  return (
    <span title={t.replacements.slotScore(ip.score.toFixed(0), oop.score.toFixed(0))}
      className={cn('inline-flex h-5 min-w-8 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums ring-1', scoreColor(rating.score))}>
      {rating.score.toFixed(0)}
    </span>
  )
}

/** Une ligne de remplaçant ; un clic ouvre la comparaison avec le joueur de la fiche. */
function Row({ rating, target, avatar, name, age, nationality, club, value, wage, onClick }: {
  rating: TargetRating
  target: number
  avatar?: ReactNode
  name: string
  age: string
  nationality: string
  club: ReactNode
  value: string
  wage: string
  onClick: () => void
}) {
  const { t } = useI18n()
  const gain = Math.round(rating.score) - Math.round(target)
  return (
    <button type="button" onClick={onClick} title={t.replacements.compareHint}
      className="grid w-full grid-cols-[3rem_2.5rem_minmax(0,1.6fr)_minmax(0,1.4fr)_6rem_6rem] items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-secondary/40">
      <Score rating={rating} />
      <span className="text-xs font-semibold text-emerald-300 tabular-nums">{gain > 0 ? `+${gain}` : '='}</span>
      <span className="flex min-w-0 items-center gap-2">
        {avatar}
        <span className="min-w-0">
          <span className="block truncate text-[13px] text-slate-200">{name}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{age}{nationality && <Flag code={nationality} />}</span>
        </span>
      </span>
      {club}
      <span className="text-right text-xs text-slate-300 tabular-nums" title={t.player.value}>{value}</span>
      <span className="text-right text-xs text-slate-300 tabular-nums" title={t.player.wage}>{wage}</span>
    </button>
  )
}
