import { cn } from '@/lib/utils'
import type { RoleRating } from '@/domain/rating'
import type { Player } from '@/domain/types'
import { useI18n } from '@/i18n'
import { matchRatingColor, scoreColor, scoreSolid } from './styles'

export function Stars({ value, className }: { value: number; className?: string }) {
  const full = Math.floor(value)
  const half = value - full >= 0.5
  return (
    <span className={cn('whitespace-nowrap text-amber-400', className)} title={`${value} / 5`}>
      {'★'.repeat(full)}
      {half && <span className="opacity-60">★</span>}
      <span className="text-slate-700">{'★'.repeat(5 - full - (half ? 1 : 0))}</span>
    </span>
  )
}

const RATING_SIZES = {
  sm: 'h-5 min-w-8 px-1 text-[11px]',
  md: 'h-6 min-w-10 px-1.5 text-xs',
  lg: 'h-8 min-w-12 px-2 text-base',
} as const

/** Note sur 100 d'un joueur dans un rôle : « — » si aucun attribut, « ~ » si partielle. */
export function RatingBadge({ rating, size = 'md', solid, className }: {
  rating: RoleRating
  size?: keyof typeof RATING_SIZES
  /** Fond plein (cartes du terrain) au lieu du fond translucide. */
  solid?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const base = cn('inline-flex shrink-0 items-center justify-center rounded-md font-semibold tabular-nums ring-1', RATING_SIZES[size], className)
  if (!rating.rated) {
    return <span title={t.rating.noData} className={cn(base, 'text-slate-500 ring-slate-700')}>—</span>
  }
  const title = rating.estimated
    ? t.rating.estimated(Math.round(rating.coverage * 100), rating.average)
    : t.rating.detail(rating.average, rating.familiarityFactor.toFixed(2))
  return (
    <span title={title} className={cn(base, solid ? scoreSolid(rating.score) : scoreColor(rating.score), solid && 'font-bold shadow-md')}>
      {rating.score.toFixed(0)}
      {rating.estimated && <span className="ml-0.5 opacity-70">~</span>}
    </span>
  )
}

/** Note moyenne en match de la saison (lue dans la sauvegarde FM), « – » sans match noté. */
export function AvgRating({ value, matches, className }: { value: number | null | undefined; matches?: number | null; className?: string }) {
  const { t, lang } = useI18n()
  if (value === null || value === undefined) {
    return <span className={cn('text-slate-600 tabular-nums', className)} title={t.rating.avgNone}>–</span>
  }
  return (
    <span title={t.rating.avgTitle(matches ?? 0)}
      className={cn('inline-flex shrink-0 items-center justify-center rounded px-1 font-semibold tabular-nums ring-1', matchRatingColor(value), className)}>
      {value.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}

/** Photo du joueur, ou silhouette « joueur inconnu » s'il n'en a pas (joueur généré, introuvable…). */
export function PlayerAvatar({ player, size = 32, className }: {
  player: Pick<Player, 'name' | 'photo' | 'photoLookup'>
  size?: number
  className?: string
}) {
  const { t } = useI18n()
  const pending = !player.photo && player.photoLookup !== player.name
  const style = { width: size, height: size }
  if (player.photo) {
    return (
      <img src={player.photo} alt={player.name} style={style} draggable={false}
        className={cn('shrink-0 rounded-full bg-slate-800 object-cover object-top ring-1 ring-slate-700', className)} />
    )
  }
  return (
    <span style={style} title={pending ? t.photo.searching : t.photo.unknown}
      className={cn('inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full bg-slate-800 ring-1 ring-slate-700', pending && 'animate-pulse', className)}>
      <svg viewBox="0 0 24 24" className="h-[85%] w-[85%] text-slate-600" fill="currentColor" aria-hidden>
        <circle cx="12" cy="9" r="4.5" />
        <path d="M3 24c0-5 4-8.5 9-8.5s9 3.5 9 8.5z" />
      </svg>
    </span>
  )
}
