import { ChevronsUpDownIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Position } from '@/domain/positions'
import type { RoleDefinition } from '@/domain/types'
import { useI18n } from '@/i18n'

/**
 * Choix d'un rôle avec recherche : les rôles prévus pour le poste d'abord, puis tous les autres
 * (avec leurs postes d'origine). Remplace le menu déroulant natif, illisible avec ~95 rôles.
 */
export function RolePicker({ roles, value, current, position, onChange, className }: {
  roles: RoleDefinition[]
  value: string
  /** Rôle affiché (résolu), utile si l'identifiant enregistré n'existe plus. */
  current: RoleDefinition
  position: Position
  onChange: (roleId: string) => void
  className?: string
}) {
  const { t, roleName } = useI18n()
  const [open, setOpen] = useState(false)
  const forPosition = roles.filter((r) => r.positions.includes(position))
  const others = roles.filter((r) => !r.positions.includes(position))
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
    </CommandItem>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title={roleName(current)}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn('flex min-w-0 items-center gap-1 rounded px-1 text-left text-slate-300 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50', className)}>
          <span className="min-w-0 flex-1 truncate">{roleName(current)}</span>
          <ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
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
