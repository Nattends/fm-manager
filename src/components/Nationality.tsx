import { ChevronsUpDownIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { nationCode, nationalityLabel, sortedNations } from '@/domain/nationalities'
import { useI18n } from '@/i18n'

/** Drapeau d'une nation (code ISO en minuscules, ex. « fr », « gb-eng »). */
export function Flag({ code, className }: { code: string; className?: string }) {
  return <span className={cn('fi shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.12)]', `fi-${code}`, className)} />
}

/** Drapeau et nom de la nationalité (saisie libre des anciennes fiches affichée telle quelle). */
export function Nationality({ value, className, flagOnly }: { value: string; className?: string; flagOnly?: boolean }) {
  const { lang } = useI18n()
  const code = nationCode(value)
  const name = nationalityLabel(value, lang)
  if (!value.trim()) return null
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)} title={name}>
      {code && <Flag code={code} />}
      {!flagOnly && <span className="truncate">{name}</span>}
    </span>
  )
}

/** Choix de la nationalité : liste alphabétique avec drapeaux et recherche. Enregistre le code. */
export function NationalityPicker({ value, onChange, placeholder, className }: {
  value: string
  onChange: (code: string) => void
  /** Texte affiché sans valeur (par défaut : « Choisir une nationalité »). */
  placeholder?: string
  className?: string
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const nations = useMemo(() => sortedNations(lang), [lang])
  const current = nationCode(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button"
          className={cn('flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30', className)}>
          {value.trim() ? <Nationality value={value} className="flex-1" /> : <span className="flex-1 truncate text-muted-foreground">{placeholder ?? t.player.chooseNationality}</span>}
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={t.player.searchNationality} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t.player.noNationality}</CommandEmpty>
            {value.trim() && (
              <CommandGroup>
                <CommandItem value="__none" onSelect={() => { onChange(''); setOpen(false) }} className="text-muted-foreground">
                  <XIcon />{t.player.clearNationality}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {nations.map((n) => (
                <CommandItem key={n.code} value={`${n.name} ${n.code}`} data-checked={n.code === current}
                  onSelect={() => { onChange(n.code); setOpen(false) }}>
                  <Flag code={n.code} />
                  <span className="truncate">{n.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
