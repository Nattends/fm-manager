import { cn } from '@/lib/utils'
import { POSITION_GRID } from '@/domain/positions'
import type { PositionFamiliarity } from '@/domain/types'
import { useI18n } from '@/i18n'
import { familiaritySolid } from './styles'

const COL_X = [17, 0, 50, 0, 83]
const ROW_Y = [9, 25, 42, 59, 75, 91]

/** Niveaux affichés dans la légende (Naturel, Confirmé, Compétent, en dessous). */
const LEGEND = [20, 17, 14, 10] as const

/**
 * Mini-terrain illustrant les postes d'un joueur, colorés selon sa familiarité.
 * Avec `fill`, le terrain grandit pour occuper toute la place disponible (en gardant ses proportions).
 */
export function PositionPitch({ positions, fill, className }: { positions: PositionFamiliarity; fill?: boolean; className?: string }) {
  const { t, familiarity } = useI18n()
  const pitch = (
      <div className={cn('relative overflow-hidden rounded-md ring-1 ring-emerald-800', !fill && 'aspect-[68/90] w-full')}
        style={{
          background: 'repeating-linear-gradient(180deg, #166534 0 12.5%, #15803d 12.5% 25%)',
          ...(fill ? { width: 'min(100cqw, calc(100cqh * 68 / 90))', aspectRatio: '68 / 90' } : {}),
        }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 68 90" preserveAspectRatio="none">
          <g fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.6">
            <rect x="2" y="2" width="64" height="86" />
            <line x1="2" y1="45" x2="66" y2="45" />
            <circle cx="34" cy="45" r="7" />
            <rect x="16" y="2" width="36" height="12" />
            <rect x="16" y="76" width="36" height="12" />
          </g>
        </svg>
        {POSITION_GRID.flatMap((row, r) =>
          row.map((pos, c) => {
            if (!pos) return null
            const value = positions[pos]
            return (
              <span key={pos} title={`${t.positions[pos]} · ${value ? familiarity(value) : t.tactic.neverPlayed}`}
                style={{ left: `${COL_X[c]}%`, top: `${ROW_Y[r]}%` }}
                className={cn(
                  'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-bold',
                  fill ? 'h-6 min-w-10 px-1.5 text-[11px]' : 'h-5 min-w-8 px-1 text-[10px]',
                  familiaritySolid(value),
                )}>
                {t.positions[pos]}
              </span>
            )
          }),
        )}
      </div>
  )
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {fill
        ? <div className="flex min-h-0 flex-1 items-center justify-center" style={{ containerType: 'size' }}>{pitch}</div>
        : pitch}
      <div className="grid shrink-0 grid-cols-2 gap-x-2 gap-y-0.5">
        {LEGEND.map((l) => (
          <span key={l} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={cn('size-2 shrink-0 rounded-full', familiaritySolid(l))} />
            <span className="truncate">{l === 10 ? t.player.lowerFamiliarity : familiarity(l)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
