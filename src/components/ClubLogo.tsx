import { ArrowRightIcon, ShieldIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Player } from '@/domain/types'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'

/** Logo d'un club (cherché sur Transfermarkt d'après son nom), écusson neutre sinon. */
export function ClubLogo({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const { clubLogo } = useStore()
  const logo = name.trim() ? clubLogo(name) : null
  if (logo) {
    return <img src={logo} alt="" title={name} className={cn('shrink-0 object-contain', className)} style={{ width: size, height: size }} />
  }
  return (
    <ShieldIcon className={cn('shrink-0 text-slate-600', logo === undefined && name.trim() && 'animate-pulse', className)}
      style={{ width: size, height: size }} aria-label={name} />
  )
}

/**
 * Club d'un joueur : logo et nom de son club ; pour un joueur prêté, logo de son club
 * puis logo et nom du club qui l'accueille.
 */
export function PlayerClub({ player, size = 18, className }: { player: Player; size?: number; className?: string }) {
  const { clubs } = useStore()
  const { t } = useI18n()
  const owner = clubs.find((c) => c.id === player.clubId)?.name ?? ''
  if (player.onLoan) {
    return (
      <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)} title={`${owner} → ${t.player.loanedTo(player.club)}`}>
        <ClubLogo name={owner} size={size} />
        <ArrowRightIcon className="size-3 shrink-0 text-cyan-400" />
        <ClubLogo name={player.club} size={size} />
        <span className="truncate text-cyan-200">{player.club || t.player.onLoan}</span>
      </span>
    )
  }
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <ClubLogo name={owner} size={size} />
      <span className="truncate">{owner}</span>
    </span>
  )
}
