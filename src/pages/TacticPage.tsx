import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  CheckIcon, ColumnsIcon, CopyIcon, EraserIcon, GripVerticalIcon, Maximize2Icon, Minimize2Icon,
  PanelBottomCloseIcon, PanelBottomOpenIcon, PanelRightCloseIcon, PanelRightOpenIcon,
  Loader2Icon, SparklesIcon, Trash2Icon, Undo2Icon, WandIcon, XIcon,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { askConfirm } from '@/lib/confirm'
import { cn } from '@/lib/utils'
import { useIsPortrait } from '@/lib/windowMode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FamiliarityTag, PositionChip } from '@/components/chips'
import { PageHeader, StatTile } from '@/components/layout'
import { Nationality } from '@/components/Nationality'
import { RolePicker } from '@/components/RolePicker'
import { RatingBadge } from '@/components/ui'
import { LINE_COLORS, attrColor, lineColorOf, scoreColor, scoreText } from '@/components/styles'
import { CUSTOM_FORMATION_ID, FORMATIONS, getFormation, type Formation } from '@/domain/formations'
import {
  bestEleven, benchPlayer, canPlace, clearEleven, computeLineup, fillEmptySlots, copyInPossession, keyAttributesAt, rateAtSlot, defaultTacticSlots, isAvailable, layoutName, mergePhase, moveSlot,
  patchShape, phaseSlots, placePlayer, summarizeLineup,
  type Assignment, type Lineup, type LineupSlot, type LineupSummary, type PitchLine,
} from '@/domain/lineup'
import { PITCH_COLS, PITCH_ROWS, cellCenter, positionAt } from '@/domain/pitch'
import { POSITIONS } from '@/domain/positions'
import { bestRole, type RoleRating } from '@/domain/rating'
import type { NewTactic, Phase, Player, RoleDefinition, TacticSlot } from '@/domain/types'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import { PlayerSheet } from './PlayerSheet'

const BENCH_ID = 'bench'
const SLOT_PREFIX = 'slot:'
const CELL_PREFIX = 'cell:'
const NEW_TACTIC = 'new'

/** Ce qui est glissé : un joueur, ou une carte de poste (changement de formation). */
type DragData = { kind: 'player'; playerId: number } | { kind: 'card'; slotId: string; phase: Phase }

type Dragged = { kind: 'player'; player: Player } | { kind: 'card'; slot: LineupSlot; phase: Phase }

/** Terrain affiché : une phase, ou les deux côte à côte. */
type PhaseView = Phase | 'both'
const PHASES: Phase[] = ['ip', 'oop']

type PanelTab = 'backups' | 'squad' | 'instructions'


/**
 * Largeur / hauteur maximale du terrain (plus large que réel, pour des cartes lisibles). Le terrain est
 * toujours vertical (but adverse en haut) et prend toute la hauteur disponible ; il n'est moins large
 * que si sa zone l'est.
 */
const PITCH_RATIO = 1.25
const BIG_VIEW_KEY = 'tactic.bigView'

/**
 * Libellé d'un bouton de la barre d'outils : masqué (icône seule, détail au survol) sous 1536 px de large,
 * pour que la barre tienne sur une ligne et laisse la hauteur au terrain.
 */
const TOOL_LABEL = 'max-2xl:sr-only'

/** Position d'un point du terrain (en %) à l'écran. */
function pitchPoint(x: number, y: number): { left: string; top: string } {
  return { left: `${x}%`, top: `${y}%` }
}

const PANEL_KEY = 'tactic.squadPanel'

function loadPanelShown(): boolean {
  try { return localStorage.getItem(PANEL_KEY) !== '0' } catch { return true }
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
    return { ...fresh, lockedPlayerId: old.lockedPlayerId, ...(keepRole ? { roleId: old.roleId } : {}) }
  })
}

export function TacticPage() {
  const { players: allPlayers, roles, tactics, saveTactic, deleteTactic } = useStore()
  const { t, roleName } = useI18n()
  // Les joueurs prêtés ne font pas partie de l'effectif : ni titulaires, ni doublures, ni liste.
  const players = useMemo(() => allPlayers.filter((p) => !p.onLoan), [allPlayers])
  const [draft, setDraft] = useState<NewTactic>(() => tactics[0] ?? newTactic(t.tactic.defaultName))
  const [dirty, setDirty] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [dragged, setDragged] = useState<Dragged | null>(null)
  /** Poste survolé par le joueur glissé (comparaison avec le titulaire). */
  const [overSlot, setOverSlot] = useState<{ phase: Phase; slotId: string } | null>(null)
  const [tab, setTab] = useState<PanelTab>('squad')
  const [big, setBigState] = useState(loadBigView)
  /** Panneau de l'effectif en grande vue (par-dessus le terrain), fermé par défaut. */
  const [panelOpen, setPanelOpen] = useState(false)
  /** Panneau de l'effectif hors grande vue, à côté ou sous le terrain : masquable, retenu d'une session à l'autre. */
  const [panelShown, setPanelShownState] = useState(loadPanelShown)
  const setPanelShown = (value: boolean) => {
    setPanelShownState(value)
    try { localStorage.setItem(PANEL_KEY, value ? '1' : '0') } catch { /* ignoré */ }
  }
  /** Phase affichée sur le terrain (avec ou sans ballon), ou les deux terrains côte à côte. */
  const [phaseView, setPhaseView] = useState<PhaseView>('both')
  const both = phaseView === 'both'
  /** Phase des réglages de la barre (formation) et du panneau : avec ballon quand les deux sont affichées. */
  const phase: Phase = both ? 'ip' : phaseView
  // Fenêtre en portrait (écran vertical) : panneau sous le terrain.
  const portrait = useIsPortrait()
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

  // Postes vus dans la phase affichée : déplacements et formations s'appliquent à cette phase.
  const views: Record<Phase, TacticSlot[]> = { ip: phaseSlots(draft.slots, 'ip'), oop: phaseSlots(draft.slots, 'oop') }
  const view = views[phase]
  const layout = layoutName(view)
  const lineups = useMemo(() => ({
    // Seuls les joueurs placés sont titulaires : les postes vides se comblent avec les boutons de la barre.
    ip: computeLineup(draft.slots, players, roles, draft.excludedPlayerIds, 'ip', false),
    oop: computeLineup(draft.slots, players, roles, draft.excludedPlayerIds, 'oop', false),
  }), [draft.slots, draft.excludedPlayerIds, players, roles])
  const lineup = lineups[phase]
  const summary = summarizeLineup(lineup)
  const starterIds = new Set(lineup.slots.flatMap((s) => (s.starter ? [s.starter.player.id] : [])))

  const update = (patch: Partial<NewTactic>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }
  const apply = (a: Assignment) => update(a)
  const updateSlot = (slotId: string, patch: Partial<TacticSlot>) =>
    update({ slots: draft.slots.map((s) => (s.slotId === slotId ? { ...s, ...patch } : s)) })
  const updateShape = (ph: Phase, slotId: string, patch: { roleId?: string }) =>
    update({ slots: patchShape(draft.slots, ph, slotId, patch) })
  const updateView = (ph: Phase, next: TacticSlot[]) => update({ slots: mergePhase(draft.slots, ph, next) })

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData
    if (data.kind === 'player') {
      const player = players.find((p) => p.id === data.playerId)
      setDragged(player ? { kind: 'player', player } : null)
      // Un titulaire glissé peut être déposé dans l'effectif : on affiche cette zone.
      if (player && starterIds.has(player.id)) setTab('squad')
    } else {
      const slot = lineups[data.phase].slots.find((s) => s.slot.id === data.slotId)
      setDragged(slot ? { kind: 'card', slot, phase: data.phase } : null)
    }
  }

  const onDragOver = (e: DragOverEvent) => {
    const id = e.over?.id
    const data = e.active.data.current as DragData
    if (data.kind !== 'player' || typeof id !== 'string' || !id.startsWith(SLOT_PREFIX)) return setOverSlot(null)
    const [ph, slotId] = id.slice(SLOT_PREFIX.length).split(':')
    setOverSlot({ phase: ph as Phase, slotId })
  }

  const endDrag = () => {
    setDragged(null)
    setOverSlot(null)
  }

  const onDragEnd = (e: DragEndEvent) => {
    endDrag()
    const overId = e.over?.id
    if (typeof overId !== 'string') return
    const data = e.active.data.current as DragData
    if (data.kind === 'card') {
      if (!overId.startsWith(CELL_PREFIX)) return
      const [ph, row, col] = overId.slice(CELL_PREFIX.length).split(':')
      if (ph !== data.phase) return
      updateView(data.phase, moveSlot(views[data.phase], data.slotId, Number(row), Number(col), roles))
    } else if (overId === BENCH_ID) {
      if (starterIds.has(data.playerId)) apply(benchPlayer(lineup, draft.excludedPlayerIds, data.playerId))
    } else if (overId.startsWith(SLOT_PREFIX)) {
      // Identifiant « slot:<phase>:<poste> » : le poste est le même dans les deux phases.
      apply(placePlayer(lineup, draft.excludedPlayerIds, data.playerId, overId.slice(SLOT_PREFIX.length).split(':')[1]))
    }
  }

  // Sauvegarde automatique : peu après la dernière modification, avant de changer de tactique et en quittant la page.
  // Les écritures passent l'une après l'autre (une nouvelle tactique n'est créée qu'une fois).
  const draftRef = useRef(draft)
  const dirtyRef = useRef(dirty)
  const savedId = useRef(draft.id)
  const queue = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    draftRef.current = draft
    dirtyRef.current = dirty
  })
  const persist = () => {
    queue.current = queue.current.then(async () => {
      const snapshot = draftRef.current
      // La formation enregistrée est celle avec ballon.
      const saved = await saveTactic({ ...snapshot, id: snapshot.id ?? savedId.current, formation: layoutName(snapshot.slots).presetId })
      savedId.current = saved.id
      setDraft((d) => (d === snapshot ? saved : { ...d, id: saved.id }))
      if (draftRef.current === snapshot) setDirty(false)
    }).catch((e) => { toast.error(String(e)) })
    return queue.current
  }
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => void persist(), 800)
    return () => clearTimeout(timer)
  })
  useEffect(() => () => { if (dirtyRef.current) void persist() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const select = async (value: string) => {
    if (dirty) await persist()
    const next = value === NEW_TACTIC ? newTactic(t.tactic.defaultName, layout.presetId) : tactics.find((tc) => tc.id === Number(value))!
    savedId.current = next.id
    setDirty(value === NEW_TACTIC)
    setDraft(next)
  }

  const remove = async () => {
    if (draft.id === undefined || !(await askConfirm(t.tactic.deleteConfirm(draft.name)))) return
    await queue.current
    await deleteTactic(draft.id)
    const next = tactics.find((tc) => tc.id !== draft.id) ?? newTactic(t.tactic.defaultName)
    savedId.current = next.id
    setDraft(next)
    setDirty(false)
  }

  const clearXi = () => update({ slots: clearEleven(draft.slots), excludedPlayerIds: [] })
  const fillXi = () => update({ slots: fillEmptySlots(draft.slots, players, roles, draft.excludedPlayerIds) })
  const bestXi = () => update(bestEleven(draft.slots, players, roles))
  const emptySlots = lineup.slots.filter((s) => !s.starter).length
  const showPanel = big ? panelOpen : panelShown
  const togglePanel = () => (big ? setPanelOpen((v) => !v) : setPanelShown(!panelShown))

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={endDrag}>
      <div className={big ? 'fixed inset-0 z-40 flex flex-col bg-background' : 'flex h-full flex-col'}>
        <PageHeader title={t.tactic.title}
          actions={
            <>
              {/* panneau masqué : la note du XI reste visible dans la barre */}
              {!showPanel && (
                <span className={cn('inline-flex h-8 items-center rounded-md px-2.5 text-sm font-semibold tabular-nums ring-1', scoreColor(summary.average))}>
                  {t.tactic.xiRating} {summary.average.toFixed(0)}
                </span>
              )}
              {/* afficher / masquer l'effectif : dans toutes les vues (normale, grande, portrait) */}
              <Button variant="outline" onClick={togglePanel} title={showPanel ? t.tactic.hideSquad : t.tactic.showSquad}>
                {showPanel ? (stacked ? <PanelBottomCloseIcon /> : <PanelRightCloseIcon />) : (stacked ? <PanelBottomOpenIcon /> : <PanelRightOpenIcon />)}
                <span className={TOOL_LABEL}>{showPanel ? t.tactic.hideSquad : t.tactic.showSquad}</span>
              </Button>
              <Button variant="outline" onClick={() => setBig(!big)} title={big ? t.tactic.exitBigViewTitle : t.tactic.bigViewTitle}>
                {big ? <Minimize2Icon /> : <Maximize2Icon />}
                <span className={TOOL_LABEL}>{big ? t.tactic.exitBigView : t.tactic.bigView}</span>
              </Button>
              {draft.id !== undefined && (
                <Button variant="destructive" size="icon" onClick={remove} title={t.common.delete} aria-label={t.common.delete}>
                  <Trash2Icon />
                </Button>
              )}
              <span className="inline-flex h-8 items-center gap-1.5 px-1 text-xs text-muted-foreground" title={t.tactic.autoSaveTitle}>
                {dirty ? <Loader2Icon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5 text-emerald-400" />}
                <span className={TOOL_LABEL}>{dirty ? t.tactic.autoSaving : t.common.saved}</span>
              </span>
            </>
          }>
          <Select value={draft.id !== undefined ? String(draft.id) : NEW_TACTIC} onValueChange={select}>
            <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {tactics.map((tc) => <SelectItem key={tc.id} value={String(tc.id)}>{tc.name}</SelectItem>)}
              {draft.id === undefined && <SelectItem value={NEW_TACTIC}>{draft.name || t.tactic.defaultName}</SelectItem>}
              {draft.id !== undefined && <SelectItem value={NEW_TACTIC}>{t.tactic.newTactic}</SelectItem>}
            </SelectContent>
          </Select>
          <Input className="h-8 w-40" value={draft.name} aria-label={t.tactic.name} onChange={(e) => update({ name: e.target.value })} />
          <Select value={layout.presetId} onValueChange={(v) => updateView(phase, remapSlots(view, getFormation(v), roles))}>
            <SelectTrigger size="sm" className="w-36" title={both ? t.tactic.formationBothTitle : t.tactic.formationTitle}><SelectValue /></SelectTrigger>
            <SelectContent>
              {layout.presetId === CUSTOM_FORMATION_ID && (
                <SelectItem value={CUSTOM_FORMATION_ID} disabled>{t.customFormation(layout.shape)}</SelectItem>
              )}
              {FORMATIONS.map((f) => <SelectItem key={f.id} value={f.id}>{t.formations[f.id] ?? f.id}</SelectItem>)}
            </SelectContent>
          </Select>
          <ToggleGroup type="single" variant="outline" size="sm" value={phaseView} title={t.tactic.phaseTitle}
            onValueChange={(v) => v && setPhaseView(v as PhaseView)}>
            <ToggleGroupItem value="ip" className="px-3">{t.tactic.phase.ip}</ToggleGroupItem>
            <ToggleGroupItem value="oop" className="px-3">{t.tactic.phase.oop}</ToggleGroupItem>
            <ToggleGroupItem value="both" className="px-3" title={t.tactic.bothPhasesTitle}><ColumnsIcon />{t.tactic.bothPhases}</ToggleGroupItem>
          </ToggleGroup>
          {phaseView !== 'ip' && (
            <Button variant="ghost" size="sm" onClick={() => update({ slots: copyInPossession(draft.slots) })} title={t.tactic.copyFromIpTitle}>
              <CopyIcon /><span className={TOOL_LABEL}>{t.tactic.copyFromIp}</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fillXi} disabled={emptySlots === 0} title={t.tactic.fillTitle}><WandIcon /><span className={TOOL_LABEL}>{t.tactic.fill}</span></Button>
          <Button variant="outline" size="sm" onClick={bestXi} title={t.tactic.bestTitle}><SparklesIcon /><span className={TOOL_LABEL}>{t.tactic.best}</span></Button>
          <Button variant="ghost" size="sm" onClick={clearXi} title={t.tactic.resetTitle}><EraserIcon /><span className={TOOL_LABEL}>{t.tactic.reset}</span></Button>
        </PageHeader>

        <div className={cn('relative flex min-h-0 flex-1 gap-4 overflow-hidden', big ? 'p-3' : 'p-4', stacked && 'flex-col')}>
          {/* Les deux phases : terrains côte à côte, même sur un écran vertical. */}
          <div className="flex min-h-0 min-w-0 flex-1 gap-3">
            {(both ? PHASES : [phase]).map((ph) => (
              <PitchView key={ph} phase={ph} lineup={lineups[ph]} view={views[ph]} roles={roles} starterIds={starterIds}
                big={big}
                label={both ? `${t.tactic.phase[ph]} · ${summarizeLineup(lineups[ph]).phases[ph].toFixed(0)}` : null}
                movingId={dragged?.kind === 'card' && dragged.phase === ph ? dragged.slot.slot.id : null}
                acceptsPlayers={dragged?.kind !== 'card'}
                onRole={(slotId, roleId) => updateShape(ph, slotId, { roleId })}
                onRemove={(s) => updateSlot(s.slot.id, { lockedPlayerId: null })}
                onOpen={setOpenId} />
            ))}
          </div>

          {showPanel && (
            <aside className={cn(
              'flex min-h-0 shrink-0 flex-col gap-3',
              // écran vertical : le terrain garde la plus grande part de la hauteur
              stacked ? 'h-[34%] w-full' : 'w-[370px]',
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
          <div className="pointer-events-none flex w-max items-center gap-2 rounded-lg border border-amber-400/80 bg-popover px-2.5 py-1.5 text-sm font-semibold shadow-2xl">
            {dragged.player.name}
          </div>
        )}
        {dragged?.kind === 'card' && (
          <div className="pointer-events-none flex items-center gap-2 rounded-lg border border-sky-400/80 bg-popover px-2.5 py-1.5 text-sm shadow-2xl">
            <PositionChip position={dragged.slot.slot.position} />
            <span>{roleName(dragged.slot.role)}</span>
            {dragged.slot.starter && (
              <span className="text-muted-foreground">· {dragged.slot.starter.player.name}</span>
            )}
          </div>
        )}
      </DragOverlay>

      {/* Comparaison à côté de la carte survolée, toujours entièrement dans la fenêtre. */}
      {dragged?.kind === 'player' && overSlot && (() => {
        const shown = lineups[overSlot.phase].slots.find((s) => s.slot.id === overSlot.slotId)
        const ip = lineups.ip.slots.find((s) => s.slot.id === overSlot.slotId)
        const oop = lineups.oop.slots.find((s) => s.slot.id === overSlot.slotId)
        if (!shown?.starter || !ip || !oop || shown.starter.player.id === dragged.player.id) return null
        return (
          <FloatingNextTo anchor={`${overSlot.phase}:${overSlot.slotId}`}>
            <ReplaceCompare phase={overSlot.phase} shown={shown} ip={ip} oop={oop} incoming={dragged.player}
              swap={starterIds.has(dragged.player.id)} />
          </FloatingNextTo>
        )
      })()}
    </DndContext>
  )
}

const FLOAT_GAP = 12
const FLOAT_MARGIN = 8

/**
 * Panneau flottant placé à côté de la carte de poste `anchor` (attribut data-slot) :
 * à droite s'il y a la place, sinon à gauche, et décalé pour rester entièrement visible.
 */
function FloatingNextTo({ anchor, children }: { anchor: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const target = document.querySelector(`[data-slot="${anchor}"]`)
    const el = ref.current
    if (!target || !el) return
    const r = target.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const clamp = (v: number, max: number) => Math.max(FLOAT_MARGIN, Math.min(v, max - FLOAT_MARGIN))
    const right = r.right + FLOAT_GAP
    const left = right + w <= vw - FLOAT_MARGIN ? right : r.left - FLOAT_GAP - w
    setPos({ left: clamp(left, vw - w), top: clamp(r.top + r.height / 2 - h / 2, vh - h) })
  }, [anchor])
  return createPortal(
    <div ref={ref} className="pointer-events-none fixed z-[60]"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}>
      {children}
    </div>,
    document.body,
  )
}

/**
 * Comparaison affichée à côté du poste survolé par le joueur glissé quand il est occupé :
 * notes avec et sans ballon, note globale et attributs clés du poste, titulaire contre arrivant.
 */
function ReplaceCompare({ phase, shown, ip, oop, incoming, swap }: {
  phase: Phase
  /** Poste dans la phase survolée. */
  shown: LineupSlot
  ip: LineupSlot
  oop: LineupSlot
  incoming: Player
  /** L'arrivant est titulaire ailleurs : les deux joueurs échangent leur place. */
  swap: boolean
}) {
  const { t, roleName } = useI18n()
  const current = shown.starter!.player
  const a = rateAtSlot(current, ip, oop)
  const b = rateAtSlot(incoming, ip, oop)
  const delta = Math.round((b.overall - a.overall) * 10) / 10
  const position = shown.slot.position
  const phases: Phase[] = [phase, phase === 'ip' ? 'oop' : 'ip']
  const score = (r: RoleRating) => (r.rated ? r.score.toFixed(0) : '—')
  const better = (x: number, y: number) => (x > y ? 'font-bold text-emerald-300' : x < y ? 'text-slate-400' : 'text-slate-200')

  return (
    <div className="w-[22rem] overflow-hidden rounded-xl border border-border bg-popover text-[12px] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2">
        <PositionChip position={position} />
        <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{roleName(shown.role)}</span>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', swap ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-400/20 text-amber-300')}>
          {swap ? t.tactic.swap : t.tactic.compareReplace}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 px-3 pt-3">
        {[current, null, incoming].map((p, i) => p === null ? (
          <span key={i} className="self-center text-[11px] text-muted-foreground">{t.tactic.versus}</span>
        ) : (
          <div key={p.id} className={cn('flex min-w-0 flex-col items-center gap-1 text-center', i === 2 && 'text-amber-200')}>
            <span className="line-clamp-2 w-full font-semibold">{p.name}</span>
            <FamiliarityTag value={p.positions[position]} className="text-[11px]" />
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-0.5 px-3">
        {phases.map((ph) => (
          <CompareRow key={ph} label={t.tactic.phase[ph]} left={score(a[ph])} right={score(b[ph])}
            leftClass={better(a[ph].score, b[ph].score)} rightClass={better(b[ph].score, a[ph].score)} />
        ))}
        <CompareRow label={t.tactic.compareOverall} left={a.overall.toFixed(0)} right={b.overall.toFixed(0)} strong
          leftClass={better(a.overall, b.overall)} rightClass={better(b.overall, a.overall)} />
      </div>

      <div className="mt-2 border-t border-border px-3 pt-2 pb-1">
        <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{t.tactic.compareAttributes}</div>
        {keyAttributesAt(ip, oop).map((attr) => {
          const x = current.attributes[attr]
          const y = incoming.attributes[attr]
          return (
            <CompareRow key={attr} label={t.attributes[attr]} left={x ?? '–'} right={y ?? '–'}
              leftClass={cn(attrColor(x), x !== undefined && y !== undefined && x > y && 'font-bold')}
              rightClass={cn(attrColor(y), x !== undefined && y !== undefined && y > x && 'font-bold')} />
          )
        })}
      </div>

      <div className={cn('px-3 py-2 text-center text-[12px] font-semibold',
        delta > 0 ? 'bg-emerald-500/15 text-emerald-300' : delta < 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-secondary/40 text-slate-300')}>
        {t.tactic.compareDelta(delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1))}
      </div>
    </div>
  )
}

function CompareRow({ label, left, right, leftClass, rightClass, strong }: {
  label: string
  left: ReactNode
  right: ReactNode
  leftClass?: string
  rightClass?: string
  strong?: boolean
}) {
  return (
    <div className={cn('grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 py-0.5 tabular-nums', strong && 'mt-0.5 border-t border-border/60 pt-1 text-[13px]')}>
      <span className={cn('text-left', leftClass)}>{left}</span>
      <span className="truncate text-center text-muted-foreground">{label}</span>
      <span className={cn('text-right', rightClass)}>{right}</span>
    </div>
  )
}

const LINES: PitchLine[] = ['defence', 'midfield', 'attack']

function SummaryPanel({ summary }: { summary: LineupSummary }) {
  const { t } = useI18n()
  return (
    <section className="flex shrink-0 items-stretch gap-2 rounded-lg border border-border bg-card p-2.5">
      <div className={cn('flex w-24 shrink-0 flex-col items-center justify-center rounded-md py-1 ring-1', scoreColor(summary.average))}>
        <span className="text-2xl leading-none font-bold tabular-nums">{summary.average.toFixed(0)}</span>
        <span className="mt-1 text-[10px] tracking-wide uppercase opacity-80">{t.tactic.xiRating.replace(':', '')}</span>
        <span className="mt-1 px-1 text-center text-[9px] leading-tight opacity-70">
          {t.tactic.phaseRatings(Math.round(summary.phases.ip), Math.round(summary.phases.oop))}
        </span>
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

/** Un terrain (une phase de jeu) : marquages, cartes de poste et cases de dépôt pendant un déplacement. */
function PitchView({ phase, lineup, view, roles, starterIds, big, label, movingId, acceptsPlayers, onRole, onRemove, onOpen }: {
  phase: Phase
  lineup: Lineup
  /** Postes vus dans cette phase. */
  view: TacticSlot[]
  roles: RoleDefinition[]
  /** Titulaires (pour distinguer échange et remplacement au survol). */
  starterIds: Set<number>
  big: boolean
  label: string | null
  /** Carte de cette phase en cours de déplacement. */
  movingId: string | null
  acceptsPlayers: boolean
  onRole: (slotId: string, roleId: string) => void
  onRemove: (slot: LineupSlot) => void
  onOpen: (playerId: number) => void
}) {
  // Taille de la zone du terrain : le terrain prend toute sa hauteur, et sa largeur jusqu'à PITCH_RATIO.
  const areaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setArea({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const ratio = area && area.h > 0 ? Math.min(PITCH_RATIO, area.w / area.h) : PITCH_RATIO
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {label && (
        <div className={cn('shrink-0 self-center rounded-full px-3 py-0.5 text-xs font-semibold ring-1',
          phase === 'ip' ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' : 'bg-sky-500/15 text-sky-300 ring-sky-500/30')}>
          {label}
        </div>
      )}
      {/* Terrain vertical sur toute la hauteur de sa zone. */}
      <div ref={areaRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center" style={{ containerType: 'size' }}>
        <div className="relative overflow-hidden rounded-xl shadow-2xl ring-1 ring-emerald-800"
          style={{
            height: '100cqh',
            width: `min(100cqw, ${PITCH_RATIO * 100}cqh)`,
            background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.35)), repeating-linear-gradient(180deg, #166534 0 10%, #15803d 10% 20%)',
          }}>
          <PitchLines ratio={ratio} />
          {movingId && <CellGrid phase={phase} slots={view} movingId={movingId} />}
          {lineup.slots.map((s) => (
            <SlotCard key={s.slot.id} phase={phase} slot={s} roles={roles} starterIds={starterIds} big={big}
              acceptsPlayers={acceptsPlayers}
              onRole={(roleId) => onRole(s.slot.id, roleId)}
              onRemove={() => onRemove(s)}
              onOpen={onOpen} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Cases de dépôt affichées pendant le déplacement d'une carte de poste : 5 par ligne
 * (défense, milieu défensif, milieu, milieu offensif) et 3 en attaque, comme dans FM.
 */
function CellGrid({ phase, slots, movingId }: { phase: Phase; slots: TacticSlot[]; movingId: string }) {
  const cells: { row: number; col: number }[] = []
  for (let row = 0; row < PITCH_ROWS; row++) {
    for (let col = 0; col < PITCH_COLS; col++) if (canPlace(slots, movingId, row, col)) cells.push({ row, col })
  }
  return (
    <>
      {cells.map(({ row, col }) => {
        const occupant = slots.find((s) => s.row === row && s.col === col)
        return <DropCell key={`${row}:${col}`} phase={phase} row={row} col={col} occupied={!!occupant && occupant.slotId !== movingId} />
      })}
    </>
  )
}

function DropCell({ phase, row, col, occupied }: { phase: Phase; row: number; col: number; occupied: boolean }) {
  const { t } = useI18n()
  const { setNodeRef, isOver } = useDroppable({ id: `${CELL_PREFIX}${phase}:${row}:${col}` })
  const { x, y } = cellCenter(row, col)
  return (
    <div ref={setNodeRef} style={pitchPoint(x, y)}
      className={cn(
        'absolute z-20 flex h-[14%] w-[18.5%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-start rounded-lg border-2 border-dashed pt-1 text-[10px] leading-tight font-bold transition',
        isOver ? 'z-30 border-sky-300 bg-sky-400/25 text-sky-100' : 'border-white/20 bg-white/5 text-white/50',
      )}>
      {t.positions[positionAt(row, col)!]}
      {isOver && occupied && <span className="font-normal">{t.tactic.swap}</span>}
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

/**
 * Carte de poste de moins de 10rem de large (écran vertical, surtout avec les deux terrains côte à côte) :
 * le rôle passe sur sa propre ligne pour garder toute la largeur.
 */
const NARROW = {
  bar: '@max-[10rem]:flex-wrap @max-[10rem]:gap-y-0.5',
  role: '@max-[10rem]:order-last @max-[10rem]:basis-full',
}

/**
 * Taille du texte d'une carte, proportionnelle au terrain (cqh / cqw : zone du terrain) : l'écart entre deux lignes
 * du terrain vaut 16 % de sa hauteur et une carte fait environ 8 lignes de texte, elle tient donc toujours
 * dans sa ligne, en paysage comme en portrait ; la largeur (19 % du terrain) la limite aussi.
 * Tout le contenu de la carte est en em.
 */
function cardFont(big: boolean): string {
  return `clamp(9px, min(1.75cqh, 2.3cqw), ${big ? 17 : 14}px)`
}

function SlotCard({ phase, slot, roles, starterIds, big, acceptsPlayers, onRole, onRemove, onOpen }: {
  phase: Phase
  slot: LineupSlot
  roles: RoleDefinition[]
  starterIds: Set<number>
  /** Grande vue : cartes agrandies. */
  big: boolean
  /** Faux pendant le déplacement d'une carte : seules les cases de la grille sont des cibles. */
  acceptsPlayers: boolean
  onRole: (id: string) => void
  /** Retire le titulaire du poste (sans l'écarter). */
  onRemove: () => void
  onOpen: (playerId: number) => void
}) {
  const { t } = useI18n()
  const { setNodeRef, isOver, active } = useDroppable({ id: `${SLOT_PREFIX}${phase}:${slot.slot.id}`, disabled: !acceptsPlayers })
  const position = slot.slot.position
  const isGk = position === 'GK'
  const {
    setNodeRef: setHandleRef, listeners: handleListeners, attributes: handleAttributes, isDragging: cardDragging,
  } = useDraggable({ id: `card-${phase}-${slot.slot.id}`, data: { kind: 'card', slotId: slot.slot.id, phase } satisfies DragData, disabled: isGk })

  const starter = slot.starter
  // Survol par un joueur : échange s'il est titulaire, sinon il remplace le titulaire (qui sort du XI).
  const hovering = isOver ? (active?.data.current as DragData | undefined) : undefined
  const dropHint = hovering?.kind === 'player' && starter && hovering.playerId !== starter.player.id
    ? (starterIds.has(hovering.playerId) ? t.tactic.swap : t.tactic.replace(starter.player.name))
    : null
  const fam = starter?.player.positions[position]
  const backup = slot.backups[0]
  const line = LINE_COLORS[lineColorOf(position)]
  // Pas de photo dans l'écran Tactique : la note précède le nom, qui prend toute la largeur de la carte.
  const s = { bar: 'text-[0.85em]', name: 'text-[1em]', meta: 'text-[0.82em]', body: 'p-[0.5em]' }

  return (
    <div ref={setNodeRef} data-slot={`${phase}:${slot.slot.id}`} style={{ ...pitchPoint(slot.slot.x, slot.slot.y), fontSize: cardFont(big) }}
      className={cn(
        // 19 % de large : 5 cartes tiennent côte à côte sur une ligne ; @container : disposition selon la largeur de la carte
        '@container absolute z-10 w-[19%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border bg-linear-to-b from-slate-900/95 to-slate-950/95 shadow-xl shadow-black/40 backdrop-blur-sm transition',
        isOver ? 'scale-105 border-amber-300 ring-2 ring-amber-300/60' : 'border-white/10',
        cardDragging && 'opacity-30',
      )}>
      {/* Barre colorée selon la ligne : poste (poignée de déplacement) et rôle */}
      <div className={cn('flex items-center gap-[0.3em] px-[0.3em] py-[0.15em]', NARROW.bar, line.bar, s.bar)}>
        <span ref={setHandleRef} {...handleListeners} {...handleAttributes}
          title={isGk ? undefined : t.tactic.dragCard}
          className={cn('flex h-[1.7em] shrink-0 touch-none items-center rounded bg-black/25 px-[0.35em] font-bold', !isGk && 'cursor-grab hover:bg-black/40')}>
          {!isGk && <GripVerticalIcon className="-ml-0.5 size-[1.1em] opacity-70" />}
          {t.positions[position]}
        </span>
        <RolePicker roles={roles} value={slot.shape.roleId} current={slot.role} position={position} phase={phase} player={slot.starter?.player} onChange={onRole}
          className={cn('h-[1.7em] flex-1 font-medium text-current hover:bg-black/20', NARROW.role)} />
      </div>

      {starter ? (
        <DraggablePlayer id={`xi-${phase}-${slot.slot.id}`} playerId={starter.player.id}>
          <div className={cn('group/body relative cursor-grab', s.body)} onClick={() => onOpen(starter.player.id)}>
            <div className="flex items-start gap-[0.4em]">
              <RatingBadge rating={starter.rating} solid className="h-[1.6em] min-w-[2.3em] px-[0.3em] text-[0.9em]" />
              <div className={cn('line-clamp-2 min-w-0 leading-tight font-semibold [overflow-wrap:anywhere] text-white hover:underline', s.name)} title={starter.player.name}>
                {starter.player.name}
              </div>
            </div>
            <div className={cn('mt-[0.3em] truncate text-slate-400', s.meta)} title={t.tactic.familiarityAt(t.positions[position])}>
              {t.player.ageValue(starter.player.age)}
              {starter.player.nationality.trim() && <> · <Nationality value={starter.player.nationality} flagOnly /></>}
              {' · '}<FamiliarityTag value={fam} />
            </div>
            {/* « retirer du XI » au survol, pour laisser toute la place au nom */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={(e) => { e.stopPropagation(); onRemove() }} onPointerDown={(e) => e.stopPropagation()}
                  aria-label={t.tactic.removeFromXi}
                  className="absolute top-0.5 right-0.5 rounded bg-slate-950/90 p-0.5 text-slate-500 opacity-0 transition group-hover/body:opacity-100 hover:bg-rose-500/20 hover:text-rose-300 focus-visible:opacity-100">
                  <XIcon className="size-[1.1em]" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t.tactic.removeFromXi}</TooltipContent>
            </Tooltip>
          </div>
        </DraggablePlayer>
      ) : (
        <div className={cn('text-muted-foreground', s.body, s.meta)}>{t.tactic.dropHere}</div>
      )}

      {dropHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 truncate bg-amber-400 px-[0.5em] py-[0.15em] text-center text-[0.85em] font-semibold text-slate-950">
          {dropHint}
        </div>
      )}

      {/* Remplaçant du poste, dans toutes les vues */}
      {backup && (
        <div className={cn('flex items-center gap-[0.4em] border-t border-white/5 bg-black/20 px-[0.6em] py-[0.15em] text-slate-400', s.meta)}
          title={`${backup.player.name} — ${t.tactic.nextBackup}`}>
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
/** Marquages du terrain vertical, dans les proportions du terrain affiché. */
function PitchLines({ ratio }: { ratio: number }) {
  const w = ratio * 100
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
