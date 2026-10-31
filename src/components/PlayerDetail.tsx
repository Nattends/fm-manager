import { ArrowLeftRightIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SectionTitle } from '@/components/layout'
import { LoanBadge } from '@/components/chips'
import { Flag } from '@/components/Nationality'
import { PositionPitch } from '@/components/PositionPitch'
import { AvgRating, RatingBadge } from '@/components/ui'
import { attrColor } from '@/components/styles'
import { ATTRIBUTE_GROUP_IDS, attributesOf, FIRST_SET_PIECE } from '@/domain/attributes'
import { rolesForPlayer } from '@/domain/rating'
import type { Player, RoleDefinition } from '@/domain/types'
import { useValueFormat } from '@/lib/useValueFormat'
import { useI18n } from '@/i18n'

/** Fiche d'un joueur hors de l'effectif (base de scouting, équipes de jeunes) : infos, meilleurs rôles, terrain et attributs. */
export function PlayerDetail({ player: p, roles, owner, actions, onCompare }: {
  player: Player
  roles: RoleDefinition[]
  /** Club propriétaire d'un joueur prêté. */
  owner?: string
  /** Boutons supplémentaires à côté de « Comparer ». */
  actions?: ReactNode
  onCompare: (p: Player) => void
}) {
  const { t, lang, roleName } = useI18n()
  const best = useMemo(() => rolesForPlayer(p, roles).slice(0, 5), [p, roles])
  const valueText = useValueFormat()
  return (
    <div className="space-y-5 p-5">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {p.nationality && <Flag code={p.nationality} />}{p.name}
          </h2>
          <span className="flex shrink-0 items-center gap-1">
            {actions}
            <Button variant="outline" size="sm" onClick={() => onCompare(p)}><ArrowLeftRightIcon />{t.compare.action}</Button>
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t.squad.col.age} {p.age} · {p.club || t.scouting.free} · {t.foot[p.foot]}
          {p.contractEnd && ` · ${t.player.contractEnd} ${p.contractEnd}`}
        </p>
        <p className="text-sm text-muted-foreground">
          {t.scouting.value} <span className="font-medium text-slate-200" title={t.scouting.valueTitle}>{valueText(p.value)}</span>
          {' · '}{t.rating.avg} <AvgRating value={p.avgRating ?? null} matches={p.ratedMatches ?? 0} />
          {(p.ratedMatches ?? 0) > 0 && <span className="text-xs"> ({t.rating.matches(p.ratedMatches ?? 0)})</span>}
          {p.wage !== null && <> · {t.player.wage} <span className="font-medium text-slate-200">{t.scouting.perWeek(p.wage.toLocaleString(lang))}</span></>}
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
