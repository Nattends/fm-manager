import { PlusIcon, RotateCcwIcon, SaveIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { askConfirm } from '@/lib/confirm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EmptyState, PageHeader, SectionTitle } from '@/components/layout'
import { weightStyle } from '@/components/styles'
import { ATTRIBUTE_GROUP_IDS, attributesOf, type AttributeKey } from '@/domain/attributes'
import { NOTEBOOK_ROLES } from '@/domain/defaultRoles'
import { FM_ROLE_PREFIX } from '@/domain/fmRoles'
import { POSITIONS, type Position } from '@/domain/positions'
import { nextWeight } from '@/domain/rating'
import type { RoleDefinition } from '@/domain/types'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'

const ALL = 'all'

type RoleLine = 'goalkeeper' | 'defence' | 'midfield' | 'attack'
const ROLE_LINES: RoleLine[] = ['goalkeeper', 'defence', 'midfield', 'attack']

/** Ligne d'un rôle, d'après son premier poste (pour regrouper la liste). */
function lineOf(role: RoleDefinition): RoleLine {
  const p = role.positions[0]
  if (p === 'GK') return 'goalkeeper'
  if (!p || (p.startsWith('D') && p !== 'DM') || p.startsWith('WB')) return 'defence'
  if (p === 'DM' || p.startsWith('M')) return 'midfield'
  return 'attack'
}

type RoleSource = 'notebook' | 'fm' | 'custom'
function sourceOf(role: RoleDefinition): RoleSource {
  if (role.id.startsWith(FM_ROLE_PREFIX)) return 'fm'
  return NOTEBOOK_ROLES.some((r) => r.id === role.id) ? 'notebook' : 'custom'
}

const SOURCE_STYLES: Record<RoleSource, string> = {
  notebook: 'bg-violet-500/15 text-violet-300',
  fm: 'bg-sky-500/15 text-sky-300',
  custom: 'bg-amber-500/15 text-amber-300',
}

export function RolesPage() {
  const { roles, customRoles, saveRoles } = useStore()
  const { t, roleName } = useI18n()
  const [draft, setDraft] = useState<RoleDefinition[]>(roles)
  const [selectedId, setSelectedId] = useState(roles[0]?.id)
  const [dirty, setDirty] = useState(false)
  const [filter, setFilter] = useState<Position | typeof ALL>(ALL)
  const [search, setSearch] = useState('')

  const selected = draft.find((r) => r.id === selectedId)
  const totalWeight = selected ? Object.values(selected.weights).reduce<number>((a, b) => a + (b ?? 0), 0) : 0

  const updateSelected = (patch: Partial<RoleDefinition>) => {
    setDraft((list) => list.map((r) => (r.id === selectedId ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const cycleWeight = (a: AttributeKey) => {
    if (!selected) return
    const n = nextWeight(selected.weights[a] ?? 0)
    const next = { ...selected.weights }
    if (n === 0) delete next[a]
    else next[a] = n
    updateSelected({ weights: next })
  }

  const addRole = () => {
    const id = `custom-${Date.now()}`
    setDraft((list) => [...list, { id, name: t.roles.newRole, positions: filter !== ALL ? [filter] : ['MC'], weights: {} }])
    setSelectedId(id)
    setDirty(true)
  }

  const removeRole = async () => {
    if (!selected || !(await askConfirm(t.roles.deleteConfirm(roleName(selected))))) return
    const rest = draft.filter((r) => r.id !== selected.id)
    setDraft(rest)
    setSelectedId(rest[0]?.id)
    setDirty(true)
  }

  const save = async () => {
    await saveRoles(draft)
    setDirty(false)
  }

  const reset = async () => {
    if (!(await askConfirm(t.roles.defaultsConfirm))) return
    await saveRoles(null)
    location.reload()
  }

  const q = search.trim().toLowerCase()
  const visible = draft
    .filter((r) => filter === ALL || r.positions.includes(filter))
    .filter((r) => !q || roleName(r).toLowerCase().includes(q))

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t.roles.title} count={t.roles.count(draft.length)}
        actions={
          <>
            {customRoles && <Button variant="ghost" onClick={reset}><RotateCcwIcon />{t.roles.defaults}</Button>}
            <Button variant="outline" onClick={addRole}><PlusIcon />{t.roles.newRole}</Button>
            <Button onClick={save} disabled={!dirty}><SaveIcon />{dirty ? t.common.save : t.common.saved}</Button>
          </>
        }>
        <p className="max-w-xl text-xs text-muted-foreground">{t.roles.hint}</p>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-border">
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 pl-8" placeholder={t.roles.search} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as Position | typeof ALL)}>
              <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t.roles.allPositions}</SelectItem>
                {POSITIONS.map((p) => <SelectItem key={p} value={p}>{t.positions[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {ROLE_LINES.map((line) => {
              const items = visible.filter((r) => lineOf(r) === line)
              if (!items.length) return null
              return (
                <div key={line} className="mb-3">
                  <div className="px-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {t.roles.lines[line]} · {items.length}
                  </div>
                  {items.map((r) => {
                    const source = sourceOf(r)
                    return (
                      <button key={r.id} onClick={() => setSelectedId(r.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                          r.id === selectedId ? 'bg-secondary text-slate-50' : 'text-slate-300 hover:bg-secondary/50',
                        )}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">{roleName(r)}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">{r.positions.map((p) => t.positions[p]).join(' · ')}</span>
                        </span>
                        <span className={cn('shrink-0 rounded px-1 text-[9px] font-semibold uppercase', SOURCE_STYLES[source])}>
                          {t.roles.source[source]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {visible.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{t.tactic.noRole}</p>}
          </div>
        </aside>

        {selected ? (
          <section className="min-h-0 space-y-6 overflow-y-auto p-6">
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t.roles.roleName}</Label>
                <Input value={roleName(selected)} onChange={(e) => updateSelected({ name: e.target.value })} />
              </div>
              <div className="pb-2 text-right">
                <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{t.roles.totalWeightLabel}</div>
                <div className="text-lg leading-none font-semibold tabular-nums text-slate-100">{totalWeight}</div>
              </div>
              <Button variant="destructive" onClick={removeRole}><Trash2Icon />{t.common.delete}</Button>
            </div>

            <div>
              <SectionTitle>{t.roles.positions}</SectionTitle>
              <ToggleGroup type="multiple" variant="outline" size="sm" spacing={1} className="flex-wrap"
                value={selected.positions}
                onValueChange={(v) => updateSelected({ positions: POSITIONS.filter((p) => v.includes(p)) })}>
                {POSITIONS.map((p) => (
                  <ToggleGroupItem key={p} value={p}
                    className="min-w-11 text-xs data-[state=on]:border-emerald-500 data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-100">
                    {t.positions[p]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="grid grid-cols-4 gap-6">
              {ATTRIBUTE_GROUP_IDS.map((g) => (
                <div key={g}>
                  <SectionTitle>{t.attributeGroups[g]}</SectionTitle>
                  <div className="flex flex-col gap-1">
                    {attributesOf(g).map((a) => {
                      const w = selected.weights[a] ?? 0
                      return (
                        <button key={a} onClick={() => cycleWeight(a)} title={t.roles.weightTitle}
                          className={cn('flex h-8 items-center justify-between gap-2 rounded-md border px-2.5 text-left text-[13px] transition-colors', weightStyle(w))}>
                          <span className="truncate">{t.attributes[a]}</span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums">×{w}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState message={t.roles.select} />
        )}
      </div>
    </div>
  )
}
