import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import { useCallback, useState, type ComponentProps, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { ColumnWidths } from '@/lib/useColumnWidths'
import { cn } from '@/lib/utils'

/**
 * Glisser-déposer des en-têtes d'un tableau pour réorganiser ses colonnes. À placer autour du tableau ;
 * chaque en-tête réorganisable est un `ReorderableTh`. Un simple clic reste un clic (tri) : le déplacement ne
 * démarre qu'après quelques pixels de glissement.
 */
export function ColumnDnd({ onMove, labelOf, children }: {
  /** La colonne `from` est lâchée sur la colonne `to`. */
  onMove: (from: string, to: string) => void
  /** Libellé de la colonne glissée, affiché sous le pointeur. */
  labelOf: (id: string) => ReactNode
  children: ReactNode
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [active, setActive] = useState<string | null>(null)
  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={(e) => setActive(String(e.active.id))}
      onDragCancel={() => setActive(null)}
      onDragEnd={(e) => {
        setActive(null)
        const to = e.over?.id
        if (to !== undefined && to !== e.active.id) onMove(String(e.active.id), String(to))
      }}>
      {children}
      <DragOverlay dropAnimation={null}>
        {active !== null && (
          <div className="pointer-events-none w-max rounded-md border border-sky-400/80 bg-popover px-2.5 py-1 text-xs font-semibold shadow-2xl">
            {labelOf(active)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

/** En-tête de colonne qu'on peut glisser sur une autre pour changer l'ordre, et redimensionner par son bord droit. */
export function ReorderableTh({ columnId, className, children, colWidths, ...props }: {
  columnId: string
  colWidths?: ColumnWidths
} & ComponentProps<'th'>) {
  const drag = useDraggable({ id: columnId })
  const drop = useDroppable({ id: columnId })
  const { setNodeRef: setDrag } = drag
  const { setNodeRef: setDrop } = drop
  const ref = useCallback((el: HTMLTableCellElement | null) => {
    setDrag(el)
    setDrop(el)
  }, [setDrag, setDrop])
  const startResize = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!colWidths) return
    e.preventDefault()
    e.stopPropagation()
    const th = e.currentTarget.parentElement!
    // largeurs affichées de toutes les colonnes, figées au premier redimensionnement
    const snapshot: Record<string, number> = {}
    th.parentElement!.querySelectorAll<HTMLElement>('th[data-col]').forEach((el) => { snapshot[el.dataset.col!] = el.offsetWidth })
    const startX = e.clientX
    const startW = th.offsetWidth
    const move = (ev: PointerEvent) => colWidths.set(columnId, startW + ev.clientX - startX, snapshot)
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }
  const width = colWidths?.widthOf(columnId)
  return (
    <th ref={ref} data-col={columnId} {...drag.listeners} {...props} style={width ? { ...props.style, width } : props.style}
      className={cn(
        'relative touch-none select-none',
        width && 'overflow-hidden text-ellipsis',
        drag.isDragging && 'opacity-40',
        drop.isOver && !drag.isDragging && 'bg-sky-500/15 shadow-[inset_2px_0_0_var(--color-sky-400)]',
        className,
      )}>
      {children}
      {colWidths && (
        <span onPointerDown={startResize} onClick={(e) => e.stopPropagation()}
          className="absolute inset-y-0 right-0 z-10 w-1.5cursor-col-resize hover:bg-sky-400/50" />
      )}
    </th>
  )
}
