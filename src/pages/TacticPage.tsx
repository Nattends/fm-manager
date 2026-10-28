import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  GripVerticalIcon, LockIcon, LockOpenIcon, Maximize2Icon, Minimize2Icon, PanelRightCloseIcon, PanelRightOpenIcon,
  RotateCcwIcon, SaveIcon, Trash2Icon, Undo2Icon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { askConfirm } from '@/lib/confirm'
import { cn } from '@/lib/utils'
import { useIsPortrait } from '@/lib/windowMode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FamiliarityTag, PositionChip } from '@/components/chips'
import { PageHeader, StatTile } from '@/components/layout'
import { RolePicker } from '@/components/RolePicker'
import { PlayerAvatar, RatingBadge } from '@/components/ui'
import { LINE_COLORS, lineColorOf, scoreColor, scoreRing, scoreText } from '@/components/styles'
import { CUSTOM_FORMATION_ID, FORMATIONS, getFormation, type Formation } from '@/domain/formations'
import {
  benchPlayer, computeLineup, defaultTacticSlots, isAvailable, layoutName, moveSlot, placePlayer, summarizeLineup,
  type Assignment, type Lineup, type LineupSlot, type LineupSummary, type PitchLine,
} from '@/domain/lineup'
import { PITCH_COLS, PITCH_ROWS, cellCenter, isFieldCell, positionAt } from '@/domain/pitch'
import { POSITIONS } from '@/domain/positions'
import { bestRole } from '@/domain/rating'
import type { Duty, NewTactic, Player, RoleDefinition, TacticSlot } from '@/domain/types'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import { PlayerSheet } from './PlayerSheet'

const BENCH_ID = 'bench'
const SLOT_PREFIX = 'slot:'
const CELL_PREFIX = 'cell:'
const NEW_TACTIC = 'new'

/** Ce qui est glissé : un joueur, ou une carte de poste (changement de formation). */
type DragData = { kind: 'player'; playerId: number } | { kind: 'card'; slotId: string }

type Dragged = { kind: 'player'; player: Player } | { kind: 'card'; slot: LineupSlot }

type PanelTab = 'backups' | 'squad' | 'instructions'

const DUTIES: Duty[] = ['auto', 'defend', 'support', 'attack']

/** Largeur / hauteur du terrain affiché (plus large que réel, pour des cartes lisibles). */
const PITCH_RATIO = 1.25
/** Grande vue : terrain horizontal (attaque vers la droite), proportions d'un vrai terrain. */
const LANDSCAPE_RATIO = 1.55
const BIG_VIEW_KEY = 'tactic.bigView'

/**
 * Position d'un point du terrain (coordonnées de la vue verticale, en %) à l'écran.
 * En grande vue, le terrain est tourné : le gardien à gauche, le couloir gauche en haut.
 */
function pitchPoint(x: number, y: number, big: boolean): { left: string; top: string } {
  return big ? { left: `${100 - y}%`, top: `${x}%` } : { left: `${x}%`, top: `${y}%` }
}

function loadBigView(): boolean {
  try { return localStorage.getItem(BIG_VIEW_KEY) === '1' } catch { return false }
}

function newTactic(name: string, formationId = '4-2-3-1'): NewTactic {
  const f = getFormation(formationId)
  return { name, formation: f.id, slots: defaultTacticSlots(f), excludedPlayerIds: [], notes: '' }
}

/** Applique une formation prédéfinie en gardant rôles, devoirs et verrous des postes communs. */
function remapSlots(prev: TacticSlot[], formation: Formation, roles: RoleDefinition[]): TacticSlot[] {
  return defaultTacticSlots(formation).map((fresh, i) => {
    const old = prev.find((p) => p.slotId === fresh.slotId)
    if (!old) return fresh
    const role = roles.find((r) => r.id === old.roleId)
    const keepRole = role?.positions.includes(formation.slots[i].position)
    return { ...fresh, lockedPlayerId: old.lockedPlayerId, ...(keepRole ? { roleId: old.roleId, duty: old.duty } : {}) }
  })
}

export function TacticPage() {
  const { players, roles, tactics, saveTactic, deleteTactic } = useStore()
  const { t, roleName } = useI18n()
  const [draft, setDraft] = useState<NewTactic>(() => tactics[0] ?? newTactic(t.tactic.defaultName))
  const [dirty, setDirty] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [dragged, setDragged] = useState<Dragged | null>(null)
  const [tab, setTab] = useState<PanelTab>('squad')
  const [big, setBigState] = useState(loadBigView)
  const [panelOpen, setPanelOpen] = useState(false)
  // Fenêtre en portrait (écran vertical) : terrain vertical même en grande vue, panneau sous le terrain.
  const portrait = useIsPortrait()
  const rotated = big && !portrait
  const stacked = portrait && !big
  const setBig = (value: boolean) => {
    setBigState(value)
    try { localStorage.setItem(BIG_VIEW_KEY, value ? '1' : '0') } catch { /* ignoré */ }
  }

  // Échap quitte la grande vue (sauf si une fiche joueur est ouverte : elle se ferme d'abord).
  useEffect(() => {
    if (!big || openId !== null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[data-state="open"][role="dialog"], [data-radix-popper-content-wrapper]')) {
        setBigState(false)
        try { localStorage.setItem(BIG_VIEW_KEY, '0') } catch { /* ignoré */ }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [big, openId])

  // Distance minimale : un simple clic ouvre toujours la fiche joueur.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const layout = layoutName(draft.slots)
  const lineup = useMemo(
    () => computeLineup(draft.slots, players, roles, draft.excludedPlayerIds),
    [draft.slots, draft.excludedPlayerIds, players, roles],
  )
  const summary = summarizeLineup(lineup)
  const starterIds = new Set(lineup.slots.flatMap((s) => (s.starter ? [s.starter.player.id] : [])))

  const update = (patch: Partial<NewTactic>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }
  const apply = (a: Assignment) => update(a)
  const updateSlot = (slotId: string, patch: Partial<TacticSlot>) =>
    update({ slots: draft.slots.map((s) => (s.slotId === slotId ? { ...s, ...patch } : s)) })

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData
    if (data.kind === 'player') {
      const player = players.find((p) => p.id === data.playerId)
      setDragged(player ? { kind: 'player', player } : null)
      // Un titulaire glissé peut être déposé dans l'effectif : on affiche cette zone.
      if (player && starterIds.has(player.id)) setTab('squad')
    } else {
      const slot = lineup.slots.find((s) => s.slot.id === data.slotId)
      setDragged(slot ? { kind: 'card', slot } : null)
    }
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragged(null)
    const overId = e.over?.id
    if (typeof overId !== 'string') return
    const data = e.active.data.current as DragData
    if (data.kind === 'card') {
      if (!overId.startsWith(CELL_PREFIX)) return
      const [row, col] = overId.slice(CELL_PREFIX.length).split(':').map(Number)
      update({ slots: moveSlot(draft.slots, data.slotId, row, col, roles) })
    } else if (overId === BENCH_ID) {
      if (starterIds.has(data.playerId)) apply(benchPlayer(lineup, draft.excludedPlayerIds, data.playerId))
    } else if (overId.startsWith(SLOT_PREFIX)) {
      apply(placePlayer(lineup, draft.excludedPlayerIds, data.playerId, overId.slice(SLOT_PREFIX.length)))
    }
  }

  const save = async () => {
    const saved = await saveTactic({ ...draft, formation: layout.presetId })
    setDraft(saved)
    setDirty(false)
  }

  const select = async (value: string) => {
    if (dirty && !(await askConfirm(t.tactic.unsavedConfirm))) return
    setDirty(value === NEW_TACTIC)
    setDraft(value === NEW_TACTIC ? newTactic(t.tactic.defaultName, layout.presetId) : tactics.find((tc) => tc.id === Number(value))!)
  }

  const remove = async () => {
    if (draft.id === undefined || !(await askConfirm(t.tactic.deleteConfirm(draft.name)))) return
    await deleteTactic(draft.id)
    const next = tactics.find((tc) => tc.id !== draft.id)
    setDraft(next ?? newTactic(t.tactic.defaultName))
    setDirty(false)
  }

  const resetXi = () => update({ slots: draft.slots.map((s) => ({ ...s, lockedPlayerId: null })), excludedPlayerIds: [] })
  const showPanel = !big || panelOpen

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragged(null)}>
      <div className={big ? 'fixed inset-0 z-40 flex flex-col bg-background' : 'flex h-full flex-col'}>
        <PageHeader title={t.tactic.title}
          actions={
            <>
              {big && (
                <span className={cn('inline-flex h-8 items-center rounded-md px-2.5 text-sm font-semibold tabular-nums ring-1', scoreColor(summary.average))}>
                  {t.tactic.xiRating} {summary.average.toFixed(0)}
                </span>
              )}
              {big && (
                <Button variant="outline" onClick={() => setPanelOpen((v) => !v)}>
                  {panelOpen ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
                  {panelOpen ? t.tactic.hideSquad : t.tactic.showSquad}
                </Button>
              )}
              <Button variant="outline" onClick={() => setBig(!big)} title={big ? t.tactic.exitBigViewTitle : t.tactic.bigViewTitle}>
                {big ? <Minimize2Icon /> : <Maximize2Icon />}
                {big ? t.tactic.exitBigView : t.tactic.bigView}
              </Button>
              {draft.id !== undefined && (
                <Button variant="destructive" size="icon" onClick={remove} title={t.common.delete} aria-label={t.common.delete}>
                  <Trash2Icon />
                </Button>
              )}
              <Button onClick={save} disabled={!dirty}><SaveIcon />{dirty ? t.common.save : t.common.saved}</Button>
            </>
          }>
          <Select value={draft.id !== undefined ? String(draft.id) : NEW_TACTIC} onValueChange={select}>
            <SelectTrigger size="sm" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {tactics.map((tc) => <SelectItem key={tc.id} value={String(tc.id)}>{tc.name}</SelectItem>)}
              {draft.id === undefined && <SelectItem value={NEW_TACTIC}>{draft.name || t.tactic.defaultName}</SelectItem>}
              {draft.id !== undefined && <SelectItem value={NEW_TACTIC}>{t.tactic.newTactic}</SelectItem>}
            </SelectContent>
          </Select>
          <Input className="h-8 w-48" value={draft.name} aria-label={t.tactic.name} onChange={(e) => update({ name: e.target.value })} />
          <Select value={layout.presetId} onValueChange={(v) => { const f = getFormation(v); update({ formation: f.id, slots: remapSlots(draft.slots, f, roles) }) }}>
            <SelectTrigger size="sm" className="w-44" title={t.tactic.formationTitle}><SelectValue /></SelectTrigger>
            <SelectContent>
              {layout.presetId === CUSTOM_FORMATION_ID && (
                <SelectItem value={CUSTOM_FORMATION_ID} disabled>{t.customFormation(layout.shape)}</SelectItem>
              )}
              {FORMATIONS.map((f) => <SelectItem key={f.id} value={f.id}>{t.formations[f.id] ?? f.id}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={resetXi} title={t.tactic.resetTitle}><RotateCcwIcon />{t.tactic.reset}</Button>
        </PageHeader>

        <div className={cn('relative flex min-h-0 flex-1 gap-4 overflow-hidden', big ? 'p-3' : 'p-4', stacked && 'flex-col')}>
          {/* Le terrain occupe la plus grande place possible en gardant ses proportions. */}
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center" style={{ containerType: 'size' }}>
            <div className="relative overflow-hidden rounded-xl shadow-2xl ring-1 ring-emerald-800"
              style={{
                width: `min(100cqw, ${(rotated ? LANDSCAPE_RATIO : PITCH_RATIO) * 100}cqh)`,
                aspectRatio: `${rotated ? LANDSCAPE_RATIO : PITCH_RATIO}`,
                background: `radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.35)), repeating-linear-gradient(${rotated ? 90 : 180}deg, #166534 0 ${rotated ? 6.25 : 10}%, #15803d ${rotated ? 6.25 : 10}% ${rotated ? 12.5 : 20}%)`,
              }}>
              <PitchLines big={rotated} />
              {dragged?.kind === 'card' && <CellGrid slots={draft.slots} movingId={dragged.slot.slot.id} big={rotated} />}
              {lineup.slots.map((s) => (
                <SlotCard key={s.slot.id} slot={s} roles={roles} big={big} rotated={rotated} acceptsPlayers={dragged?.kind !== 'card'}
                  onRole={(roleId) => updateSlot(s.slot.id, { roleId })}
                  onDuty={(duty) => updateSlot(s.slot.id, { duty })}
                  onToggleLock={() => updateSlot(s.slot.id, { lockedPlayerId: s.locked ? null : (s.starter?.player.id ?? null) })}
                  onOpen={setOpenId} />
              ))}
            </div>
          </div>

          {showPanel && (
            <aside className={cn(
              'flex min-h-0 shrink-0 flex-col gap-3',
              stacked ? 'h-[40%] w-full' : 'w-[370px]',
              big && 'absolute top-3 right-3 bottom-3 z-30 rounded-xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur animate-in slide-in-from-right-8 fade-in-0',
            )}>
              <SummaryPanel summary={summary} />
              <Tabs value={tab} onValueChange={(v) => setTab(v as PanelTab)} className="min-h-0 flex-1 gap-0 rounded-lg border border-border bg-card">
                <TabsList variant="line" className="w-full shrink-0 justify-start border-b border-border px-2">
                  <TabsTrigger value="squad" className="flex-none px-2.5">{t.tactic.squad}</TabsTrigger>
                  <TabsTrigger value="backups" className="flex-none px-2.5">{t.tactic.backups}</TabsTrigger>
                  <TabsTrigger value="instructions" className="flex-none px-2.5">{t.tactic.instructions}</TabsTrigger>
                </TabsList>
                {/* forceMount : la zone « effectif » reste une cible de dépôt même quand l'onglet est caché. */}
                <TabsContent value="squad" forceMount className="min-h-0 overflow-y-auto data-[state=inactive]:hidden">
                  <SquadList players={players} roles={roles} excludedIds={draft.excludedPlayerIds}
                    starterIds={starterIds} dropActive={dragged?.kind === 'player' && starterIds.has(dragged.player.id)}
                    onOpen={setOpenId}
                    onRestore={(id) => update({ excludedPlayerIds: draft.excludedPlayerIds.filter((x) => x !== id) })} />
                </TabsContent>
                <TabsContent value="backups" className="min-h-0 overflow-y-auto p-2">
                  <BackupsList lineup={lineup} onOpen={setOpenId} />
                </TabsContent>
                <TabsContent value="instructions" className="p-3">
                  <Textarea rows={8} placeholder={t.tactic.instructionsPlaceholder} value={draft.notes}
                    onChange={(e) => update({ notes: e.target.value })} />
                </TabsContent>
              </Tabs>
            </aside>
          )}
        </div>

        {openId !== null && <PlayerSheet playerId={openId} onClose={() => setOpenId(null)} />}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragged?.kind === 'player' && (
          <div className="pointer-events-none flex items-center gap-2 rounded-lg border border-amber-400/80 bg-popover px-2.5 py-1.5 text-sm font-semibold shadow-2xl">
            <PlayerAvatar player={dragged.player} size={28} />
            {dragged.player.name}
          </div>
        )}
        {dragged?.kind === 'card' && (
          <div className="pointer-events-none flex items-center gap-2 rounded-lg border border-sky-400/80 bg-popover px-2.5 py-1.5 text-sm shadow-2xl">
            <PositionChip position={dragged.slot.slot.position} />
            <span>{roleName(dragged.slot.role)}</span>
            {dragged.slot.starter && (
              <>
                <PlayerAvatar player={dragged.slot.starter.player} size={20} />
                <span className="text-muted-foreground">{dragged.slot.starter.player.name}</span>
              </>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

const LINES: PitchLine[] = ['defence', 'midfield', 'attack']

function SummaryPanel({ summary }: { summary: LineupSummary }) {
  const { t } = useI18n()
  return (
    <section className="flex shrink-0 items-stretch gap-2 rounded-lg border border-border bg-card p-2.5">
      <div className={cn('flex w-20 shrink-0 flex-col items-center justify-center rounded-md ring-1', scoreColor(summary.average))}>
        <span className="text-2xl leading-none font-bold tabular-nums">{summary.average.toFixed(0)}</span>
        <span className="mt-1 text-[10px] tracking-wide uppercase opacity-80">{t.tactic.xiRating.replace(':', '')}</span>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-1.5">
        {LINES.map((line) => {
          const v = summary.lines[line]
          return (
            <StatTile key={line} label={t.tactic.lines[line]} value={v === null ? '—' : v.toFixed(0)}
              className={cn('border-t-2', LINE_COLORS[line].accent)}
              valueClassName={v === null ? 'text-slate-600' : scoreText(v)} />
          )
        })}
        <StatTile label={t.tactic.avgAge} value={summary.averageAge === null ? '—' : summary.averageAge.toFixed(1)} />
        <StatTile label={t.tactic.outOfPosition} value={summary.outOfPosition} title={t.tactic.outOfPositionTitle}
          valueClassName={summary.outOfPosition > 0 ? 'text-amber-300' : undefined} />
        <StatTile label={t.tactic.emptySlots} value={summary.emptySlots}
          valueClassName={summary.emptySlots > 0 ? 'text-amber-300' : undefined} />
      </div>
    </section>
  )
}

function SquadList({ players, roles, excludedIds, starterIds, dropActive, onOpen, onRestore }: {
  players: Player[]
  roles: RoleDefinition[]
  excludedIds: number[]
  starterIds: Set<number>
  dropActive: boolean
  onOpen: (id: number) => void
  onRestore: (id: number) => void
}) {
  const { t, roleName } = useI18n()
  const { setNodeRef, isOver } = useDroppable({ id: BENCH_ID })
  const excluded = new Set(excludedIds)
  const pool = players
    .map((p) => ({ player: p, best: bestRole(p, roles) }))
    .sort((a, b) => (b.best?.rating.score ?? 0) - (a.best?.rating.score ?? 0))

  return (
    <div ref={setNodeRef}
      className={cn('min-h-full p-2 transition-colors', dropActive && 'bg-amber-500/5 outline-2 -outline-offset-4 outline-dashed outline-amber-500/50', dropActive && isOver && 'bg-amber-500/10 outline-amber-400')}>
      <p className="mb-2 px-1 text-[11px] leading-snug text-muted-foreground">{t.tactic.squadHint}</p>
      <ul className="space-y-0.5">
        {pool.map(({ player, best }) => {
          const available = isAvailable(player)
          const row = (
            <div onClick={() => onOpen(player.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-secondary/60',
                starterIds.has(player.id) && 'bg-emerald-500/10',
                available ? 'cursor-grab' : 'cursor-not-allowed opacity-40',
              )}>
              <PlayerAvatar player={player} size={30} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-slate-100">{player.name}</span>
                  {starterIds.has(player.id) && <span className="text-[10px] font-semibold text-emerald-400">{t.tactic.inXi}</span>}
                  {excluded.has(player.id) && <span className="text-[10px] font-semibold text-amber-400">{t.tactic.dropped}</span>}
                  {!available && <span className="text-[10px] font-semibold text-rose-400">{t.tactic.unavailable}</span>}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {t.player.ageValue(player.age)} · {POSITIONS.filter((p) => (player.positions[p] ?? 0) >= 17).map((p) => t.positions[p]).join(' / ')}
                  {best?.rating.rated && <> · {roleName(best.role)}</>}
                </span>
              </span>
              {excluded.has(player.id) && (
                <Button variant="ghost" size="icon-xs" title={t.tactic.restore} aria-label={t.tactic.restore}
                  className="text-amber-400 hover:text-amber-200"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onRestore(player.id) }}>
                  <Undo2Icon />
                </Button>
              )}
              {best && <RatingBadge rating={best.rating} size="sm" />}
            </div>
          )
          return (
            <li key={player.id}>
              {available ? <DraggablePlayer id={`pool-${player.id}`} playerId={player.id}>{row}</DraggablePlayer> : row}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function BackupsList({ lineup, onOpen }: { lineup: Lineup; onOpen: (id: number) => void }) {
  return (
    <div className="divide-y divide-border/70">
      {lineup.slots.map((s) => (
        <div key={s.slot.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5 py-1">
          <PositionChip position={s.slot.position} className="justify-center" />
          {s.backups.length === 0 && <span className="col-span-2 text-xs text-slate-600">—</span>}
          {s.backups.map((b) => (
            <DraggablePlayer key={b.player.id} id={`backup-${s.slot.id}-${b.player.id}`} playerId={b.player.id}>
              <button onClick={() => onOpen(b.player.id)} title={b.player.name}
                className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-secondary/60">
                <PlayerAvatar player={b.player} size={22} />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{b.player.name}</span>
                <RatingBadge rating={b.rating} size="sm" />
              </button>
            </DraggablePlayer>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Cases de dépôt affichées pendant le déplacement d'une carte de poste. */
function CellGrid({ slots, movingId, big }: { slots: TacticSlot[]; movingId: string; big: boolean }) {
  const cells: { row: number; col: number }[] = []
  for (let row = 0; row < PITCH_ROWS; row++) {
    for (let col = 0; col < PITCH_COLS; col++) if (isFieldCell(row, col)) cells.push({ row, col })
  }
  return (
    <>
      {cells.map(({ row, col }) => {
        const occupant = slots.find((s) => s.row === row && s.col === col)
        return <DropCell key={`${row}:${col}`} row={row} col={col} big={big} occupied={!!occupant && occupant.slotId !== movingId} />
      })}
    </>
  )
}

function DropCell({ row, col, occupied, big }: { row: number; col: number; occupied: boolean; big: boolean }) {
  const { t } = useI18n()
  const { setNodeRef, isOver } = useDroppable({ id: `${CELL_PREFIX}${row}:${col}` })
  const { x, y } = cellCenter(row, col)
  return (
    <div ref={setNodeRef} style={pitchPoint(x, y, big)}
      className={cn(
        'absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-start justify-center rounded-lg border-2 border-dashed pt-1 text-[11px] font-bold transition',
        big ? 'h-[17%] w-[15%]' : 'h-[14%] w-[18%]',
        isOver ? 'border-sky-300 bg-sky-400/25 text-sky-100' : 'border-white/20 bg-white/5 text-white/50',
      )}>
      {t.positions[positionAt(row, col)!]}
      {isOver && occupied && <span className="ml-1 font-normal">{t.tactic.swap}</span>}
    </div>
  )
}

function DraggablePlayer({ id, playerId, children }: { id: string; playerId: number; children: ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, data: { kind: 'player', playerId } satisfies DragData })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn('min-w-0 touch-none', isDragging && 'opacity-30')}>
      {children}
    </div>
  )
}

function SlotCard({ slot, roles, big, rotated, acceptsPlayers, onRole, onDuty, onToggleLock, onOpen }: {
  slot: LineupSlot
  roles: RoleDefinition[]
  /** Grande vue : cartes agrandies. */
  big: boolean
  /** Terrain horizontal (grande vue sur écran paysage). */
  rotated: boolean
  /** Faux pendant le déplacement d'une carte : seules les cases de la grille sont des cibles. */
  acceptsPlayers: boolean
  onRole: (id: string) => void
  onDuty: (d: Duty) => void
  onToggleLock: () => void
  onOpen: (playerId: number) => void
}) {
  const { t } = useI18n()
  const { setNodeRef, isOver } = useDroppable({ id: SLOT_PREFIX + slot.slot.id, disabled: !acceptsPlayers })
  const position = slot.slot.position
  const isGk = position === 'GK'
  const {
    setNodeRef: setHandleRef, listeners: handleListeners, attributes: handleAttributes, isDragging: cardDragging,
  } = useDraggable({ id: `card-${slot.slot.id}`, data: { kind: 'card', slotId: slot.slot.id } satisfies DragData, disabled: isGk })

  const starter = slot.starter
  const fam = starter?.player.positions[position]
  const backup = slot.backups[0]
  const line = LINE_COLORS[lineColorOf(position)]
  const rated = starter?.rating.rated ? starter.rating.score : null
  const s = big
    ? { width: rotated ? 'w-[15%]' : 'w-[19%]', bar: 'text-xs', avatar: 64, name: 'text-[15px]', meta: 'text-xs', body: 'gap-3 p-2.5 pb-3', rating: 'md' as const }
    : { width: 'w-[19%]', bar: 'text-[11px]', avatar: 50, name: 'text-[13px]', meta: 'text-[11px]', body: 'gap-2.5 p-2 pb-2.5', rating: 'sm' as const }

  return (
    <div ref={setNodeRef} style={pitchPoint(slot.slot.x, slot.slot.y, rotated)}
      className={cn(
        'absolute z-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border bg-linear-to-b from-slate-900/95 to-slate-950/95 shadow-xl shadow-black/40 backdrop-blur-sm transition',
        s.width,
        isOver ? 'scale-105 border-amber-300 ring-2 ring-amber-300/60' : slot.locked ? 'border-amber-400/70' : 'border-white/10',
        cardDragging && 'opacity-30',
      )}>
      {/* Barre colorée selon la ligne : poste (poignée de déplacement), rôle, devoir */}
      <div className={cn('flex items-center gap-1 px-1 py-0.5', line.bar, s.bar)}>
        <span ref={setHandleRef} {...handleListeners} {...handleAttributes}
          title={isGk ? undefined : t.tactic.dragCard}
          className={cn('flex shrink-0 touch-none items-center rounded bg-black/25 px-1 font-bold', !isGk && 'cursor-grab hover:bg-black/40')}>
          {!isGk && <GripVerticalIcon className="-ml-0.5 size-3 opacity-70" />}
          {t.positions[position]}
        </span>
        <RolePicker roles={roles} value={slot.tacticSlot.roleId} current={slot.role} position={position} onChange={onRole}
          className="h-5 flex-1 font-medium text-current hover:bg-black/20" />
        <Select value={slot.tacticSlot.duty} onValueChange={(v) => onDuty(v as Duty)}>
          <SelectTrigger size="sm" title={t.tactic.duty}
            className="h-5! w-auto shrink-0 gap-0.5 border-0 bg-black/25 px-1 text-[inherit] font-semibold text-current shadow-none hover:bg-black/40 [&_svg]:size-3 [&_svg]:text-current!">
            <SelectValue>{t.dutyShort[slot.tacticSlot.duty]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DUTIES.map((k) => <SelectItem key={k} value={k}>{t.duty[k]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {starter ? (
        <DraggablePlayer id={`xi-${slot.slot.id}`} playerId={starter.player.id}>
          <div className={cn('relative flex cursor-grab items-center', s.body)} onClick={() => onOpen(starter.player.id)}>
            <div className="relative shrink-0">
              <PlayerAvatar player={starter.player} size={s.avatar}
                className={cn('ring-2', rated !== null ? scoreRing(rated) : 'ring-slate-600')} />
              <RatingBadge rating={starter.rating} size={s.rating} solid className="absolute -right-2 -bottom-1" />
            </div>
            <div className="min-w-0 flex-1 pr-3 pl-1">
              <div className={cn('line-clamp-2 leading-tight font-semibold text-white hover:underline', s.name)}>{starter.player.name}</div>
              <div className={cn('mt-0.5 truncate text-slate-400', s.meta)}>
                {t.player.ageValue(starter.player.age)}{starter.player.nationality && <> · {starter.player.nationality}</>}
              </div>
              <div className={cn('truncate', s.meta)} title={t.tactic.familiarityAt(t.positions[position])}>
                <FamiliarityTag value={fam} />
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={(e) => { e.stopPropagation(); onToggleLock() }} onPointerDown={(e) => e.stopPropagation()}
                  aria-label={slot.locked ? t.tactic.unlock : t.tactic.lock}
                  className={cn('absolute top-1.5 right-1.5 rounded p-0.5 transition-colors', slot.locked ? 'text-amber-400' : 'text-slate-600 hover:text-slate-200')}>
                  {slot.locked ? <LockIcon className="size-3.5" /> : <LockOpenIcon className="size-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{slot.locked ? t.tactic.unlock : t.tactic.lock}</TooltipContent>
            </Tooltip>
          </div>
        </DraggablePlayer>
      ) : (
        <div className={cn('flex items-center text-muted-foreground', s.body, s.meta)}>
          <PlayerAvatar player={{ name: '', photo: null, photoLookup: '' }} size={s.avatar} className="opacity-60" />
          <span>{t.tactic.dropHere}</span>
        </div>
      )}

      {backup && (
        <div className={cn('flex items-center gap-1.5 border-t border-white/5 bg-black/20 px-2 py-0.5 text-slate-400', s.meta)} title={t.tactic.nextBackup}>
          <span className="text-slate-600">↳</span>
          <span className="min-w-0 flex-1 truncate">{backup.player.name}</span>
          <span className={cn('font-semibold tabular-nums', backup.rating.rated ? scoreText(backup.rating.score) : 'text-slate-600')}>
            {backup.rating.rated ? backup.rating.score.toFixed(0) : '—'}
          </span>
        </div>
      )}
    </div>
  )
}
/** Marquages du terrain, dans les proportions du terrain affiché (vertical ou horizontal en grande vue). */
function PitchLines({ big }: { big: boolean }) {
  if (big) return <LandscapeLines />
  const w = PITCH_RATIO * 100
  const mid = w / 2
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${w} 100`}>
      <g fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.35">
        <rect x="2" y="2" width={w - 4} height="96" />
        <line x1="2" y1="50" x2={w - 2} y2="50" />
        <circle cx={mid} cy="50" r="9" />
        <rect x={mid - 22} y="2" width="44" height="15" />
        <rect x={mid - 10} y="2" width="20" height="5.5" />
        <path d={`M ${mid - 7.5} 17 A 9 9 0 0 0 ${mid + 7.5} 17`} />
        <rect x={mid - 22} y="83" width="44" height="15" />
        <rect x={mid - 10} y="92.5" width="20" height="5.5" />
        <path d={`M ${mid - 7.5} 83 A 9 9 0 0 1 ${mid + 7.5} 83`} />
      </g>
      <g fill="rgba(255,255,255,0.32)">
        <circle cx={mid} cy="50" r="0.6" />
        <circle cx={mid} cy="12" r="0.5" />
        <circle cx={mid} cy="88" r="0.5" />
      </g>
    </svg>
  )
}

/** Terrain horizontal aux proportions réelles (105 × 68 m), but de l'équipe à gauche. */
function LandscapeLines() {
  const w = LANDSCAPE_RATIO * 100
  const mid = w / 2
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${w} 100`}>
      <g fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.35">
        <rect x="2" y="2" width={w - 4} height="96" />
        <line x1={mid} y1="2" x2={mid} y2="98" />
        <circle cx={mid} cy="50" r="13.5" />
        <rect x="2" y="20.5" width="24" height="59" />
        <rect x="2" y="36.5" width="8" height="27" />
        <path d="M 26 39.1 A 13.5 13.5 0 0 1 26 60.9" />
        <rect x={w - 26} y="20.5" width="24" height="59" />
        <rect x={w - 10} y="36.5" width="8" height="27" />
        <path d={`M ${w - 26} 39.1 A 13.5 13.5 0 0 0 ${w - 26} 60.9`} />
      </g>
      <g fill="rgba(255,255,255,0.32)">
        <circle cx={mid} cy="50" r="0.7" />
        <circle cx="18" cy="50" r="0.6" />
        <circle cx={w - 18} cy="50" r="0.6" />
      </g>
    </svg>
  )
}
