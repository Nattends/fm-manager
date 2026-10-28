import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** En-tête de page : titre, compteur facultatif, contenu libre (filtres) et actions à droite. */
export function PageHeader({ title, count, children, actions, className }: {
  title: string
  count?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-2.5', className)}>
      <h1 className="mr-2 flex items-baseline gap-2 text-lg font-semibold tracking-tight text-slate-100">
        {title}
        {count !== undefined && <span className="text-sm font-normal text-muted-foreground">{count}</span>}
      </h1>
      {children}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Bloc titré (carte) utilisé dans tous les écrans. */
export function Panel({ title, actions, children, className, bodyClassName }: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('min-w-0 rounded-lg border border-border bg-card', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2">
          {title && <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={cn('p-3.5', bodyClassName)}>{children}</div>
    </section>
  )
}

/** Petite statistique : libellé en petites capitales, valeur dessous. */
export function StatTile({ label, value, title, valueClassName, className }: {
  label: string
  value: ReactNode
  title?: string
  valueClassName?: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0 rounded-md bg-secondary/60 px-2 py-1.5 text-center', className)} title={title}>
      <div className="truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={cn('text-sm font-semibold tabular-nums text-slate-100', valueClassName)}>{value}</div>
    </div>
  )
}

/** Libellé de section dans un formulaire ou une fiche. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase', className)}>{children}</h3>
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground">
      <p>{message}</p>
      {action}
    </div>
  )
}
