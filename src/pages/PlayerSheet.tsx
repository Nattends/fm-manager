import { EllipsisIcon, PencilIcon, RefreshCwIcon, SearchIcon, Trash2Icon, UserXIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { askConfirm } from '@/lib/confirm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoanBadge, PositionChip, StatusBadge } from '@/components/chips'
import { PlayerClub } from '@/components/ClubLogo'
import { PositionPitch } from '@/components/PositionPitch'
import { EmptyState, SectionTitle } from '@/components/layout'
import { PlayerAvatar, RatingBadge, Stars } from '@/components/ui'
import { attrColor } from '@/components/styles'
import { attributesOf, type AttributeGroup } from '@/domain/attributes'
import { POSITIONS } from '@/domain/positions'
import { allRoleRatings, bestRole } from '@/domain/rating'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import { PlayerForm } from './PlayerForm'

export function PlayerSheet({ playerId, onClose }: { playerId: number; onClose: () => void }) {
  const { players, roles, deletePlayer, resetPhoto } = useStore()
  const { t, roleName, money, date } = useI18n()
  const [editing, setEditing] = useState(false)
  const [roleSearch, setRoleSearch] = useState('')
  const [playedOnly, setPlayedOnly] = useState(true)
  const player = players.find((p) => p.id === playerId)
  if (!player) return null

  const best = bestRole(player, roles)
  const isGk = player.positions.GK !== undefined
  const groups: AttributeGroup[] = isGk ? ['goalkeeping', 'technical', 'mental', 'physical'] : ['technical', 'mental', 'physical']
  const hasAttrs = Object.keys(player.attributes).length > 0
  const q = roleSearch.trim().toLowerCase()
  const ratings = allRoleRatings(player, roles)
    .filter((r) => !playedOnly || r.playsPosition)
    .filter((r) => !q || roleName(r.role).toLowerCase().includes(q))

  const remove = async () => {
    if (!(await askConfirm(t.player.deleteConfirm(player.name)))) return
    await deletePlayer(player.id)
    onClose()
  }

  if (editing) return <PlayerForm player={player} onClose={() => setEditing(false)} />

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {/* En-tête : identité du joueur */}
        <div className="flex items-start gap-5 border-b border-border p-5">
          <div className="relative shrink-0">
            <PlayerAvatar player={player} size={88} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon-xs" className="absolute -right-1 -bottom-1 rounded-full ring-2 ring-popover"
                  aria-label={t.photo.actions}>
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => void resetPhoto(player.id, 'search')}>
                  <RefreshCwIcon />{t.photo.retry}
                </DropdownMenuItem>
                {player.photo && (
                  <DropdownMenuItem onSelect={() => void resetPhoto(player.id, 'wrong')} title={t.photo.wrongTitle}>
                    <UserXIcon />{t.photo.wrong}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="truncate text-xl font-semibold text-slate-50">{player.name}</DialogTitle>
              <StatusBadge status={player.status} />
              {player.onLoan && <LoanBadge club={player.club} />}
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              {[t.player.ageValue(player.age), player.nationality, t.player.footValue(t.foot[player.foot])].filter(Boolean).join(' · ')}
            </DialogDescription>
            <PlayerClub player={player} size={22} className="text-sm font-medium text-slate-200" />
            <div className="flex flex-wrap gap-1.5">
              {POSITIONS.filter((p) => player.positions[p] !== undefined).map((p) => (
                <PositionChip key={p} position={p} familiarity={player.positions[p]} />
              ))}
            </div>
          </div>

          {/* Étoiles CA / PA (information seulement, n'entrent pas dans les notes) */}
          <div className="flex shrink-0 flex-col gap-1.5 self-center border-r border-border pr-5" title={t.player.starsHint}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t.squad.col.ca}</span>
              <Stars value={player.caStars} className="text-base" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t.squad.col.pa}</span>
              <Stars value={player.paStars} className="text-base" />
            </div>
          </div>

          {best && (
            <div className="mr-6 flex shrink-0 flex-col items-end gap-1 text-right">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t.squad.col.bestRole}</span>
              <RatingBadge rating={best.rating} size="lg" />
              {best.rating.rated && <span className="max-w-48 truncate text-xs text-slate-300">{roleName(best.role)}</span>}
            </div>
          )}
        </div>

        {/* Corps : onglets, et le mini-terrain des postes sur le côté */}
        <div className="flex min-h-[26rem] flex-1">
        <Tabs defaultValue="attributes" className="min-h-0 min-w-0 flex-1 gap-0">
          <TabsList variant="line" className="w-full justify-start border-b border-border px-5">
            <TabsTrigger value="attributes" className="flex-none px-3">{t.player.tabAttributes}</TabsTrigger>
            <TabsTrigger value="roles" className="flex-none px-3">{t.player.tabRoles}</TabsTrigger>
            <TabsTrigger value="contract" className="flex-none px-3">{t.player.tabContract}</TabsTrigger>
          </TabsList>

          <TabsContent value="attributes" className="min-h-0 overflow-y-auto p-5">
            {hasAttrs ? (
              <div className={cn('grid gap-6', groups.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
                {groups.map((g) => (
                  <div key={g}>
                    <SectionTitle>{t.attributeGroups[g]}</SectionTitle>
                    <div className="space-y-0.5">
                      {attributesOf(g).map((a) => (
                        <div key={a} className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-[13px] odd:bg-secondary/30">
                          <span className="truncate text-slate-300">{t.attributes[a]}</span>
                          <span className={cn('font-semibold tabular-nums', attrColor(player.attributes[a]))}>{player.attributes[a] ?? '–'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message={t.player.noAttributes}
                action={<Button variant="outline" onClick={() => setEditing(true)}><PencilIcon />{t.common.edit}</Button>} />
            )}
          </TabsContent>

          <TabsContent value="roles" className="flex min-h-0 flex-col">
            <div className="flex items-center gap-4 border-b border-border px-5 py-2.5">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-8 w-64 pl-8" placeholder={t.player.searchRole} value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="played-only" checked={playedOnly} onCheckedChange={setPlayedOnly} />
                <Label htmlFor="played-only" className="text-xs text-slate-300">{t.player.playedOnly}</Label>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">{t.player.roleCount(ratings.length)}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {ratings.map(({ role, rating, playsPosition }) => (
                  <div key={role.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-secondary/40">
                    <span className="min-w-0">
                      <span className={cn('block truncate text-[13px]', playsPosition ? 'text-slate-200' : 'text-slate-500')}>{roleName(role)}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {role.positions.map((p) => t.positions[p]).join(' / ')}
                        {!playsPosition && <> · {t.player.positionNotPlayed}</>}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {rating.rated && rating.familiarityFactor < 1 && (
                        <span className="text-[11px] text-muted-foreground tabular-nums" title={t.player.baseRatingTitle}>
                          {rating.base.toFixed(0)} ×{rating.familiarityFactor.toFixed(2)}
                        </span>
                      )}
                      <RatingBadge rating={rating} />
                    </span>
                  </div>
                ))}
              </div>
              {ratings.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t.tactic.noRole}</p>}
            </div>
          </TabsContent>

          <TabsContent value="contract" className="min-h-0 overflow-y-auto p-5">
            <dl className="grid grid-cols-3 gap-x-6 gap-y-4">
              <Info label={t.player.contractEnd}>{date(player.contractEnd)}</Info>
              <Info label={t.player.wage}>{money(player.wage)}</Info>
              <Info label={t.player.value}>{money(player.value)}</Info>
              <Info label={t.player.ca} title={t.player.starsHint}><Stars value={player.caStars} /></Info>
              <Info label={t.player.pa} title={t.player.starsHint}><Stars value={player.paStars} /></Info>
              <Info label={t.player.foot}>{t.foot[player.foot]}</Info>
            </dl>
            <div className="mt-6">
              <SectionTitle>{t.player.notes}</SectionTitle>
              {player.notes
                ? <p className="rounded-md bg-secondary/40 p-3 text-[13px] whitespace-pre-wrap text-slate-300 select-text">{player.notes}</p>
                : <p className="text-sm text-muted-foreground">{t.common.none}</p>}
            </div>
          </TabsContent>
        </Tabs>
          <aside className="flex w-64 shrink-0 flex-col border-l border-border p-4">
            <SectionTitle>{t.player.positions.replace(' *', '')}</SectionTitle>
            <PositionPitch positions={player.positions} fill className="min-h-0 flex-1" />
          </aside>
        </div>

        {/* Pied */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <Button variant="destructive" onClick={remove}><Trash2Icon />{t.common.delete}</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t.common.close}</Button>
            <Button onClick={() => setEditing(true)}><PencilIcon />{t.common.edit}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Info({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div title={title}>
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">{children}</dd>
    </div>
  )
}
