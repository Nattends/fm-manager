import { ChevronsUpDownIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { RoleDefinition } from '@/domain/types'
import { useI18n } from '@/i18n'

/** Choix d'un rôle (ou d'aucun) avec recherche, sans poste imposé. */
export function RoleSelect({ roles, value, onChange, className }: {
  roles: RoleDefinition[]
  value: RoleDefinition | null
  onChange: (r: RoleDefinition | null) => void
  className?: string
}) {
  const { t, roleName } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button"
          className={cn('flex h-8 w-52 min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30', className)}>
          <span className={cn('flex-1 truncate', !value && 'text-muted-foreground')}>{value ? roleName(value) : t.scouting.role}</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={t.roles.search} />
          <CommandList className="max-h-80">
            <CommandEmpty>–</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none" onSelect={() => { onChange(null); setOpen(false) }} className="text-muted-foreground">
                {t.scouting.noRole}
              </CommandItem>
              {roles.map((r) => (
                <CommandItem key={r.id} value={`${roleName(r)} ${r.id}`} data-checked={r.id === value?.id}
                  onSelect={() => { onChange(r); setOpen(false) }} className="text-xs">
                  <span className="truncate">{roleName(r)}</span>
                  <span className="ml-auto shrink-0 pl-2 text-[10px] text-muted-foreground">{r.positions.map((p) => t.positions[p]).join('/')}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
