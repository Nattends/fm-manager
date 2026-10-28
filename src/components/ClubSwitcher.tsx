import { CheckIcon, ChevronsUpDownIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { askConfirm } from '@/lib/confirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import { ClubLogo } from './ClubLogo'

/** Sélecteur de club (une partie de FM par club) dans la barre du haut. */
export function ClubSwitcher() {
  const { clubs, activeClub, setActiveClub, createClub, renameClub, deleteClub, refreshClubLogo } = useStore()
  const { t } = useI18n()
  /** Boîte de saisie du nom : création ou renommage du club actif. */
  const [editing, setEditing] = useState<'create' | 'rename' | null>(null)
  const [name, setName] = useState('')

  const open = (mode: 'create' | 'rename') => {
    setName(mode === 'rename' ? activeClub.name : '')
    setEditing(mode)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (editing === 'create') setActiveClub((await createClub(trimmed)).id)
    else await renameClub(activeClub.id, trimmed)
    setEditing(null)
  }

  const remove = async () => {
    if (!(await askConfirm(t.clubs.deleteConfirm(activeClub.name)))) return
    const name = activeClub.name
    await deleteClub(activeClub.id)
    toast.success(t.clubs.deleted(name))
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-8 max-w-56 items-center gap-2 rounded-md px-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-secondary">
            <ClubLogo name={activeClub.name} size={22} />
            <span className="truncate">{activeClub.name}</span>
            <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{t.clubs.title}</DropdownMenuLabel>
          {clubs.map((c) => (
            <DropdownMenuItem key={c.id} onSelect={() => setActiveClub(c.id)}>
              <ClubLogo name={c.name} size={20} />
              <span className="flex-1 truncate">{c.name}</span>
              {c.id === activeClub.id && <CheckIcon className="text-emerald-400" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => open('create')}><PlusIcon />{t.clubs.create}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('rename')}><PencilIcon />{t.clubs.rename}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => refreshClubLogo(activeClub.name)}><RefreshCwIcon />{t.clubs.refreshLogo}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={clubs.length <= 1} onSelect={() => void remove()}>
            <Trash2Icon />{t.clubs.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing === 'create' ? t.clubs.createTitle : t.clubs.renameTitle}</DialogTitle>
              <DialogDescription>{t.clubs.nameHint}</DialogDescription>
            </DialogHeader>
            <Input autoFocus value={name} placeholder={t.clubs.namePlaceholder} onChange={(e) => setName(e.target.value)} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>{t.common.cancel}</Button>
              <Button type="submit" disabled={!name.trim()}>{editing === 'create' ? t.clubs.create : t.common.save}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
