import { ChevronsUpDownIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Position } from '@/domain/positions'
import { rateRole, type RoleRating } from '@/domain/rating'
import type { Phase, Player, RoleDefinition } from '@/domain/types'
import { RatingBadge } from '@/components/ui'
import { useI18n } from '@/i18n'

/**
 * Choix d'un rôle avec recherche : les rôles prévus pour le poste (et la phase, si elle est donnée) d'abord,
 * puis tous les autres (avec leurs postes d'origine). Remplace le menu déroulant natif, illisible avec ~80 rôles.
 * Avec un joueur, chaque rôle affiche sa note à ce poste et les rôles du poste sont triés
 * de la meilleure à la moins bonne note.
 */
export function RolePicker({ roles, value, current, position, phase, player, onChange, className }: {
  roles: RoleDefinition[]
  value: string
  /** Rôle affiché (résolu), utile si l'identifiant enregistré n'existe plus. */
  current: RoleDefinition
  position: Position
  /** Phase du terrain : les rôles FM de l'autre phase passent avec les autres rôles. */
  phase?: Phase
  /** Joueur placé sur le poste : sa note pour chaque rôle. */
  player?: Player | null
  onChange: (roleId: string) => void
  className?: string
}) {
  const { t, roleName } = useI18n()
  const [open, setOpen] = useState(false)
  // Notes calculées seulement à l'ouverture (environ 80 rôles).
  const ratings = new Map<string, RoleRating>()
  if (open && player) for (const r of roles) ratings.set(r.id, rateRole(player, r, position))
  const byRating = (a: RoleDefinition, b: RoleDefinition) => (ratings.get(b.id)?.score ?? 0) - (ratings.get(a.id)?.score ?? 0)
  const fits = (r: RoleDefinition) => r.positions.includes(position) && (!phase || !r.phase || r.phase === phase)
  const forPosition = roles.filter(fits)
  const others = roles.filter((r) => !fits(r))
  if (player) {
    forPosition.sort(byRating)
    others.sort(byRating)
  }
  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
  }
  const item = (r: RoleDefinition, withPositions: boolean) => (
    <CommandItem key={r.id} value={`${roleName(r)} ${r.id}`} data-checked={r.id === value} onSelect={() => pick(r.id)}
      className="text-xs">
      <span className="truncate">{roleName(r)}</span>
      {withPositions && (
        <span className="ml-auto shrink-0 pl-2 text-[10px] text-muted-foreground">
          {r.positions.map((p) => t.positions[p]).join('/')}
        </span>
      )}
      {ratings.has(r.id) && <RatingBadge rating={ratings.get(r.id)!} size="sm" className={withPositions ? 'ml-2' : 'ml-auto'} />}
    </CommandItem>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title={roleName(current)}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn('flex min-w-0 items-center gap-1 rounded px-1 text-left text-slate-300 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50', className)}>
          {/* note du joueur placé pour le rôle choisi, juste avant le nom du rôle */}
          {player && <RatingBadge rating={rateRole(player, current, position)} size="sm" className="h-4 min-w-7 shrink-0 px-1 text-[10px]" />}
          <span className="min-w-0 flex-1 truncate">{roleName(current)}</span>
          <ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn('p-0', player ? 'w-80' : 'w-72')} align="start">
        <Command>
          <CommandInput placeholder={t.tactic.searchRole} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t.tactic.noRole}</CommandEmpty>
            <CommandGroup heading={t.tactic.rolesForPosition(t.positions[position])}>
              {forPosition.map((r) => item(r, false))}
            </CommandGroup>
            {others.length > 0 && (
              <CommandGroup heading={t.tactic.otherRoles}>
                {others.map((r) => item(r, true))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
