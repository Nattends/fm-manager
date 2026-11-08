import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { SectionTitle } from '@/components/layout'
import { percentileColor } from '@/components/styles'
import type { ScoutDb, ScoutPlayer } from '@/domain/scouting'
import { formatStat, seasonStat, STAT_DEFS, type SeasonStat } from '@/domain/seasonStats'
import { PERCENTILE_MIN_MINUTES, sampleSize, statGroupOf, statPercentile } from '@/domain/statPercentiles'
import { useI18n } from '@/i18n'

const TOTALS: SeasonStat[] = ['apps', 'minutes', 'goals', 'assists', 'pom']
const GROUPS: { id: 'goalkeeping' | 'attack' | 'creation' | 'defence' | 'discipline'; stats: SeasonStat[] }[] = [
  { id: 'goalkeeping', stats: ['saves90', 'savePct', 'conceded90'] },
  { id: 'attack', stats: ['goals90', 'xg90', 'xgDiff', 'shots90', 'shotsOnTarget90', 'shotAccuracy', 'conversion', 'xgPerShot'] },
  { id: 'creation', stats: ['assists90', 'xa90', 'passes90', 'passPct', 'dribbles90', 'crosses90', 'crossPct'] },
  { id: 'defence', stats: ['tacklesWon90', 'tackleWinPct', 'aerialsWon90', 'aerialWinPct'] },
  { id: 'discipline', stats: ['fouls90', 'fouled90', 'offsides90'] },
]

/** Stats de la saison d'un joueur de la base : totaux, puis chaque stat avec son percentile parmi les joueurs du même poste. */
export function ScoutStats({ db, player: p }: { db: ScoutDb; player: ScoutPlayer }) {
  const { t, lang } = useI18n()
  const group = useMemo(() => statGroupOf(p), [p])
  const sample = useMemo(() => (group ? sampleSize(db, group) : 0), [db, group])
  const s = p.stats
  const detailed = !!s && (s.passes > 0 || s.shots > 0)

  return (
    <div>
      <SectionTitle>{t.scouting.stats}</SectionTitle>
      {!s?.minutes ? (
        <p className="text-[13px] text-muted-foreground">{t.scouting.statsNone}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-1.5">
            {TOTALS.map((stat) => (
              <div key={stat} className="rounded-md bg-secondary/40 px-2 py-1.5 text-center" title={t.scouting.stat[stat].long}>
                <div className="text-[11px] text-muted-foreground">{t.scouting.stat[stat].short}</div>
                <div className="text-sm font-semibold tabular-nums text-slate-100">{formatStat(stat, seasonStat(p, stat), lang)}</div>
              </div>
            ))}
          </div>
          {!detailed && <p className="text-[13px] text-muted-foreground">{t.scouting.statsBasic}</p>}
          {detailed && !s.extended && <p className="text-[13px] text-muted-foreground">{t.scouting.statsOld}</p>}
          {GROUPS.map((g) => {
            const rows = g.stats.map((stat) => ({ stat, v: seasonStat(p, stat) })).filter((r) => r.v !== null)
            if (!rows.length) return null
            return (
              <div key={g.id}>
                <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t.scouting.statsGroup[g.id]}</div>
                <div className="space-y-0.5">
                  {rows.map(({ stat, v }) => {
                    const pct = statPercentile(db, p, stat, group)
                    return (
                      <div key={stat} className="grid grid-cols-[1fr_4rem_6rem] items-center gap-2 rounded px-1.5 py-0.5 text-[13px] odd:bg-secondary/30"
                        title={t.scouting.stat[stat].long}>
                        <span className="truncate text-slate-300">
                          {t.scouting.stat[stat].label}
                          {STAT_DEFS[stat].kind === 'per90' && <span className="text-muted-foreground"> /90</span>}
                        </span>
                        <span className="text-right font-semibold tabular-nums text-slate-100">{formatStat(stat, v, lang)}</span>
                        {pct === null ? <span /> : (
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                              <span className={cn('block h-full rounded-full', percentileColor(pct))} style={{ width: `${Math.max(pct, 3)}%` }} />
                            </span>
                            <span className="w-6 text-right text-[11px] tabular-nums text-muted-foreground">{pct}</span>
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {group && detailed && sample > 0 && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t.scouting.percentileHint(t.scouting.groupName[group], sample, PERCENTILE_MIN_MINUTES)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
