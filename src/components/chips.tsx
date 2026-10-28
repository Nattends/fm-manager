import { cn } from '@/lib/utils'
import type { Position } from '@/domain/positions'
import type { PlayerStatus } from '@/domain/types'
import { useI18n } from '@/i18n'
import { familiarityColor, LINE_COLORS, lineColorOf, STATUS_STYLES } from './styles'

/** Étiquette d'un poste (ex. « DC »), colorée selon sa ligne, avec la familiarité en option. */
export function PositionChip({ position, familiarity, className }: {
  position: Position
  familiarity?: number
  className?: string
}) {
  const { t, familiarity: label } = useI18n()
  return (
    <span title={familiarity !== undefined ? label(familiarity) : undefined}
      className={cn('inline-flex h-5 items-center rounded px-1.5 text-[11px] font-semibold', LINE_COLORS[lineColorOf(position)].soft, className)}>
      {t.positions[position]}
      {familiarity !== undefined && familiarity < 20 && (
        <span className={cn('ml-1 size-1.5 rounded-full bg-current', familiarityColor(familiarity))} />
      )}
    </span>
  )
}

/** Familiarité au poste en toutes lettres et en couleur (« Jamais joué » si absente). */
export function FamiliarityTag({ value, className }: { value: number | undefined; className?: string }) {
  const { t, familiarity } = useI18n()
  return (
    <span className={cn('font-medium', familiarityColor(value), className)}>
      {value ? familiarity(value) : t.tactic.neverPlayed}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: PlayerStatus; className?: string }) {
  const { t } = useI18n()
  return (
    <span className={cn('inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium ring-1', STATUS_STYLES[status], className)}>
      {t.status[status]}
    </span>
  )
}
