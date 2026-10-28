import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SectionTitle } from '@/components/layout'
import { NationalityPicker } from '@/components/Nationality'
import { attrColor, familiarityFill } from '@/components/styles'
import { ATTRIBUTE_GROUP_IDS, attributesOf, type AttributeKey } from '@/domain/attributes'
import { FAMILIARITY_LEVELS, POSITION_GRID, type Position } from '@/domain/positions'
import type { Foot, NewPlayer, Player, PlayerStatus } from '@/domain/types'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'

const EMPTY: NewPlayer = {
  name: '', age: 20, nationality: '', club: '', onLoan: false, foot: 'right', positions: {},
  caStars: 2.5, paStars: 3, contractEnd: null, wage: null, value: null,
  status: 'rotation', notes: '', attributes: {},
}

const STAR_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const STATUSES: PlayerStatus[] = ['key', 'rotation', 'prospect', 'for_sale', 'unavailable']
const FEET: Foot[] = ['right', 'left', 'both']

function parseOptionalInt(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s.replace(/\s/g, ''))
  return Number.isFinite(n) ? Math.round(n) : null
}

export function PlayerForm({ player, onClose, onSaved }: { player?: Player; onClose: () => void; onSaved?: (p: Player) => void }) {
  const { savePlayer } = useStore()
  const { t } = useI18n()
  const [draft, setDraft] = useState<NewPlayer>(player ?? EMPTY)
  const [showAttrs, setShowAttrs] = useState(player ? Object.keys(player.attributes).length > 0 : false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof NewPlayer>(k: K, v: NewPlayer[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const setPosition = (pos: Position, value: number | null) => {
    const positions = { ...draft.positions }
    if (value === null) delete positions[pos]
    else positions[pos] = value
    set('positions', positions)
  }

  const setAttr = (attr: AttributeKey, value: string) => {
    const attributes = { ...draft.attributes }
    const n = parseOptionalInt(value)
    if (n === null) delete attributes[attr]
    else attributes[attr] = Math.min(20, Math.max(1, n))
    set('attributes', attributes)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft.name.trim()) return setError(t.player.nameRequired)
    if (Object.keys(draft.positions).length === 0) return setError(t.player.positionRequired)
    setSaving(true)
    try {
      const saved = await savePlayer({ ...draft, name: draft.name.trim() })
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(String(err))
      setSaving(false)
    }
  }

  const filled = Object.keys(draft.attributes).length

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="border-b border-border px-5 py-3.5">
          <DialogTitle className="text-lg font-semibold">{player ? t.player.editTitle(player.name) : t.player.newTitle}</DialogTitle>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-8">
              <div className="space-y-6">
                <section>
                  <SectionTitle>{t.player.sectionIdentity}</SectionTitle>
                  <div className="grid grid-cols-4 gap-3">
                    <Field label={t.player.name} className="col-span-2">
                      <Input autoFocus value={draft.name} onChange={(e) => set('name', e.target.value)} />
                    </Field>
                    <Field label={t.player.age}>
                      <Input type="number" min={14} max={45} value={draft.age} onChange={(e) => set('age', Number(e.target.value))} />
                    </Field>
                    <Field label={t.player.nationality}>
                      <NationalityPicker value={draft.nationality} onChange={(code) => set('nationality', code)} />
                    </Field>
                    <Field label={t.player.foot}>
                      <Select value={draft.foot} onValueChange={(v) => set('foot', v as Foot)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{FEET.map((k) => <SelectItem key={k} value={k}>{t.foot[k]}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    <Field label={t.player.status}>
                      <Select value={draft.status} onValueChange={(v) => set('status', v as PlayerStatus)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUSES.map((k) => <SelectItem key={k} value={k}>{t.status[k]}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    <Field label={t.player.ca} title={t.player.starsHint}>
                      <StarSelect value={draft.caStars} onChange={(v) => set('caStars', v)} />
                    </Field>
                    <Field label={t.player.pa} title={t.player.starsHint}>
                      <StarSelect value={draft.paStars} onChange={(v) => set('paStars', v)} />
                    </Field>
                    <Field label={t.player.onLoan} title={t.player.onLoanHint} className="col-span-2">
                      <label className="flex h-9 items-center gap-2 text-[13px] text-slate-300">
                        <Switch checked={draft.onLoan} onCheckedChange={(v) => set('onLoan', v)} />
                        {t.player.onLoanHint}
                      </label>
                    </Field>
                    {draft.onLoan && (
                      <Field label={t.player.loanClub} className="col-span-2">
                        <Input value={draft.club} placeholder={t.clubs.namePlaceholder} onChange={(e) => set('club', e.target.value)} />
                      </Field>
                    )}
                  </div>
                </section>

                <section>
                  <SectionTitle>{t.player.sectionContract}</SectionTitle>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label={t.player.contractEnd}>
                      <Input type="date" value={draft.contractEnd ?? ''} onChange={(e) => set('contractEnd', e.target.value || null)} />
                    </Field>
                    <Field label={t.player.wage}>
                      <Input inputMode="numeric" value={draft.wage ?? ''} onChange={(e) => set('wage', parseOptionalInt(e.target.value))} />
                    </Field>
                    <Field label={t.player.value}>
                      <Input inputMode="numeric" value={draft.value ?? ''} onChange={(e) => set('value', parseOptionalInt(e.target.value))} />
                    </Field>
                    <Field label={t.player.notes} className="col-span-3">
                      <Textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
                    </Field>
                  </div>
                </section>
              </div>

              <section>
                <SectionTitle>{t.player.positions}</SectionTitle>
                <div className="grid grid-cols-[repeat(5,auto)] justify-items-center gap-x-1 gap-y-2 rounded-lg bg-emerald-950/50 p-3 ring-1 ring-emerald-900/70">
                  {POSITION_GRID.flat().map((pos, i) =>
                    pos === null ? <div key={i} /> : (
                      <PositionCell key={pos} position={pos} value={draft.positions[pos]} onChange={(v) => setPosition(pos, v)} />
                    ),
                  )}
                </div>
                <p className="mt-2 max-w-80 text-[11px] text-muted-foreground">{t.player.positionsHint}</p>
              </section>
            </div>

            <section className="rounded-lg border border-border">
              <button type="button" onClick={() => setShowAttrs((s) => !s)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium hover:bg-secondary/40">
                {showAttrs ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                {t.player.attributes}
                <span className="font-normal text-muted-foreground">{t.player.attributesCount(filled)}</span>
              </button>
              {showAttrs && (
                <div className="grid grid-cols-4 gap-6 border-t border-border p-4">
                  {ATTRIBUTE_GROUP_IDS.map((g) => (
                    <div key={g}>
                      <SectionTitle>{t.attributeGroups[g]}</SectionTitle>
                      <div className="space-y-1">
                        {attributesOf(g).map((a) => (
                          <label key={a} className="flex items-center justify-between gap-2 text-[13px]">
                            <span className="truncate text-slate-300">{t.attributes[a]}</span>
                            <Input inputMode="numeric"
                              className={cn('h-7 w-12 px-1 text-center font-semibold', attrColor(draft.attributes[a]))}
                              value={draft.attributes[a] ?? ''}
                              onChange={(e) => setAttr(a, e.target.value)}
                              onFocus={(e) => e.target.select()} />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            {error && <p className="mr-auto text-sm text-rose-400">{error}</p>}
            <Button type="button" variant="ghost" onClick={onClose}>{t.common.cancel}</Button>
            <Button type="submit" disabled={saving}>{t.common.save}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, title, className, children }: { label: string; title?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)} title={title}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function StarSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{STAR_OPTIONS.map((s) => <SelectItem key={s} value={String(s)}>{s} ★</SelectItem>)}</SelectContent>
    </Select>
  )
}

const NOT_PLAYED = 'none'

/** Case du mini-terrain : nom du poste et menu de familiarité directement dans la case. */
function PositionCell({ position, value, onChange }: { position: Position; value: number | undefined; onChange: (v: number | null) => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn('text-[11px] font-bold', value ? 'text-slate-100' : 'text-slate-400')}>{t.positions[position]}</span>
      <Select value={value ? String(value) : NOT_PLAYED} onValueChange={(v) => onChange(v === NOT_PLAYED ? null : Number(v))}>
        <SelectTrigger size="sm" className={cn('h-7! w-28 px-1.5 text-[11px] shadow-none', familiarityFill(value))}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_PLAYED} className="text-muted-foreground">—</SelectItem>
          {FAMILIARITY_LEVELS.map((l) => <SelectItem key={l} value={String(l)}>{t.familiarity[l]}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}