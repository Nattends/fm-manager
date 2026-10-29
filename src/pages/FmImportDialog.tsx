import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { AlertTriangleIcon, ImageIcon, Loader2Icon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { bytesToBase64, CAPTURE_SHORTCUT_LABEL, decodePng, ocrPng, onScreenCapture, setCaptureHotkey } from '@/data/fmScreen'
import { readAttributeCapture, type AttributeRow } from '@/domain/screen/attributes'
import { isIdentityCapture, readIdentityCapture, type IdentityRow, type OcrWord } from '@/domain/screen/identity'
import { buildSquad, clubsRead, managedClubName, planImport } from '@/domain/screen/squadImport'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'

type Kind = 'identity' | 'attributes' | 'unknown'

interface Shot {
  id: number
  label: string
  kind: Kind
  identity: IdentityRow[]
  attributes: AttributeRow[]
}

let nextId = 1

/** Lit une capture (pixels + textes) et la range selon ce qu'elle montre. */
async function analyse(label: string, pngBase64: string, words?: OcrWord[]): Promise<Shot> {
  const bitmap = await decodePng(pngBase64)
  const text = words ?? (await ocrPng(pngBase64))
  if (isIdentityCapture(text)) {
    const r = readIdentityCapture(bitmap, text)
    return { id: nextId++, label, kind: r.rows.length ? 'identity' : 'unknown', identity: r.rows, attributes: [] }
  }
  const rows = readAttributeCapture(bitmap)
  return { id: nextId++, label, kind: rows.length ? 'attributes' : 'unknown', identity: [], attributes: rows }
}

export function FmImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { players, activeClub, savePlayer } = useStore()
  const [shots, setShots] = useState<Shot[]>([])
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [club, setClub] = useState<string | null>(null)
  const counter = useRef(1)

  const add = useCallback(async (label: string, png: string, words?: OcrWord[]) => {
    setBusy(true)
    try {
      const shot = await analyse(label, png, words)
      if (shot.kind === 'unknown') toast.warning(`${label} : ${t.fmImport.unknownHint}`)
      setShots((s) => [...s, shot])
    } catch (e) {
      toast.error(t.fmImport.readError(String(e)))
    } finally {
      setBusy(false)
    }
  }, [t])

  // Raccourci global : actif seulement pendant que la boîte est ouverte.
  useEffect(() => {
    let off: (() => void) | undefined
    let cancelled = false
    onScreenCapture(
      (c) => void add(`FM27 #${counter.current++}`, c.png, c.words),
      (m) => toast.error(t.fmImport.captureError(m)),
    )
      .then((un) => {
        if (cancelled) un()
        else off = un
      })
      .catch((e) => toast.error(String(e)))
    setCaptureHotkey(true).catch((e) => toast.error(t.fmImport.captureError(String(e))))
    return () => {
      cancelled = true
      off?.()
      setCaptureHotkey(false).catch(() => {})
    }
  }, [add, t])

  const addFiles = async () => {
    const picked = await open({ multiple: true, title: t.fmImport.pickTitle, filters: [{ name: 'PNG', extensions: ['png'] }] })
    if (!picked) return
    for (const path of Array.isArray(picked) ? picked : [picked]) {
      const bytes = await readFile(path)
      await add(path.split(/[\\/]/).pop() ?? path, bytesToBase64(bytes))
    }
  }

  const read = useMemo(
    () => buildSquad(shots.flatMap((s) => s.identity), shots.flatMap((s) => s.attributes)),
    [shots],
  )
  const clubs = useMemo(() => clubsRead(read.players), [read])
  const chosenClub = club ?? managedClubName(read.players)
  const plan = useMemo(() => planImport(read, players, activeClub, chosenClub), [read, players, activeClub, chosenClub])

  const apply = async () => {
    setApplying(true)
    try {
      let created = 0
      let updated = 0
      for (const a of plan.actions) {
        await savePlayer(a.player)
        if (a.kind === 'create') created++
        else updated++
      }
      toast.success(t.fmImport.done(created, updated))
      onClose()
    } catch (e) {
      toast.error(String(e))
      setApplying(false)
    }
  }

  const withAttrs = read.players.filter((p) => p.attributes).length

  return (
    <Dialog open onOpenChange={(o) => !o && !applying && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="border-b border-border px-5 py-3.5">
          <DialogTitle className="text-lg font-semibold">{t.fmImport.title}</DialogTitle>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-sm text-slate-300">{t.fmImport.intro}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">{t.fmImport.shortcut}</span>
            <kbd className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-xs">{CAPTURE_SHORTCUT_LABEL}</kbd>
            <Button variant="outline" size="sm" onClick={() => void addFiles()} disabled={busy}>
              <ImageIcon />{t.fmImport.addFiles}
            </Button>
            {busy && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
          </div>

          {shots.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t.fmImport.noCaptures}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {shots.map((s) => (
                <li key={s.id}
                  className={cn('flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs',
                    s.kind === 'unknown' ? 'border-amber-500/50 text-amber-300' : 'border-border text-slate-300')}>
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground">
                    {t.fmImport.kind[s.kind]}{s.kind !== 'unknown' && ` · ${t.fmImport.rows(Math.max(s.identity.length, s.attributes.length))}`}
                  </span>
                  <button type="button" aria-label={t.fmImport.remove} title={t.fmImport.remove}
                    className="text-muted-foreground hover:text-slate-100"
                    onClick={() => setShots((all) => all.filter((x) => x.id !== s.id))}>
                    <XIcon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {read.players.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{t.fmImport.summary(read.players.length, withAttrs)}</span>
                {clubs.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t.fmImport.club}</span>
                    <Select value={chosenClub} onValueChange={setClub}>
                      <SelectTrigger size="sm" className="h-8 w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {clubs.map((c) => <SelectItem key={c.name} value={c.name}>{c.name} ({c.count})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-[13px]">
                  <thead className="bg-secondary/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5"></th>
                      <th className="px-2 py-1.5">{t.fmImport.nameCol}</th>
                      <th className="px-2 py-1.5">{t.squad.col.age}</th>
                      <th className="px-2 py-1.5">{t.player.foot}</th>
                      <th className="px-2 py-1.5">{t.player.wage}</th>
                      <th className="px-2 py-1.5">{t.player.value}</th>
                      <th className="px-2 py-1.5">{t.player.contractEnd}</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.actions.map((a, i) => {
                      const p = a.player
                      return (
                        <tr key={i} className="odd:bg-secondary/20">
                          <td className="px-2 py-1">
                            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium',
                              a.kind === 'create' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300')}>
                              {t.fmImport.state[a.kind]}
                            </span>
                          </td>
                          <td className="px-2 py-1 font-medium">{p.name}</td>
                          <td className="px-2 py-1 tabular-nums">{p.age}</td>
                          <td className="px-2 py-1">{t.foot[p.foot]}</td>
                          <td className="px-2 py-1 tabular-nums">{p.wage?.toLocaleString() ?? '–'}</td>
                          <td className="px-2 py-1 tabular-nums">{p.value?.toLocaleString() ?? '–'}</td>
                          <td className="px-2 py-1 tabular-nums">{p.contractEnd ?? '–'}</td>
                          <td className="px-2 py-1">
                            {a.read.warnings.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-amber-300"
                                title={a.read.warnings.map((w) => t.fmImport.warn[w as keyof typeof t.fmImport.warn] ?? w).join('\n')}>
                                <AlertTriangleIcon className="size-3.5" />{a.read.warnings.length}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                {plan.missing.length > 0 && <p>{t.fmImport.missing(plan.missing.length)}</p>}
                {plan.skipped > 0 && <p>{t.fmImport.skipped(plan.skipped)}</p>}
                {read.orphanAttributeRows > 0 && <p className="text-amber-300">{t.fmImport.orphans(read.orphanAttributeRows)}</p>}
                <p>{t.fmImport.positionsHint}</p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={applying}>{t.common.cancel}</Button>
          <Button onClick={() => void apply()} disabled={applying || plan.actions.length === 0}>
            {applying ? t.fmImport.applying : t.fmImport.apply(plan.actions.length)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
