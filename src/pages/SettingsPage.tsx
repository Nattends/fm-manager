import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { DownloadIcon, Loader2Icon, UploadIcon, UsersIcon, UserMinusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { askConfirm } from '@/lib/confirm'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader, Panel } from '@/components/layout'
import type { Backup } from '@/data/dataSource'
import { INVALID_BACKUP } from '@/data/manualSource'
import { demoSquad, isDemoPlayer } from '@/domain/demoSquad'
import { useI18n } from '@/i18n'
import { LANGUAGES } from '@/i18n/languages'
import { useStore } from '@/store'

export function SettingsPage() {
  const { players, tactics, exportAll, importAll, savePlayer, deletePlayer } = useStore()
  const { t, lang, setLang } = useI18n()
  const [demoBusy, setDemoBusy] = useState(false)
  const demoCount = players.filter(isDemoPlayer).length

  const errorText = (e: unknown) => (e instanceof Error && e.message === INVALID_BACKUP ? t.settings.invalidBackup : String(e))

  const doExport = async () => {
    try {
      const day = new Date().toISOString().slice(0, 10)
      const path = await save({ defaultPath: `fm27-backup-${day}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
      if (!path) return
      await writeTextFile(path, JSON.stringify(await exportAll(), null, 2))
      toast.success(t.settings.exported(path))
    } catch (e) {
      toast.error(t.settings.exportFailed(errorText(e)))
    }
  }

  const doImport = async () => {
    try {
      const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] })
      if (!path) return
      const backup = JSON.parse(await readTextFile(path)) as Backup
      const summary = t.settings.summary(backup.players?.length ?? 0, backup.tactics?.length ?? 0)
      if (!(await askConfirm(t.settings.importConfirm(summary)))) return
      await importAll(backup)
      toast.success(t.settings.importDone(summary))
    } catch (e) {
      toast.error(t.settings.importFailed(errorText(e)))
    }
  }

  const loadDemo = async () => {
    setDemoBusy(true)
    try {
      const squad = demoSquad()
      for (const p of squad) await savePlayer(p)
      toast.success(t.settings.demoLoaded(squad.length))
    } catch (e) {
      toast.error(String(e))
    } finally {
      setDemoBusy(false)
    }
  }

  const removeDemo = async () => {
    if (!(await askConfirm(t.settings.demoRemoveConfirm(demoCount)))) return
    setDemoBusy(true)
    try {
      for (const p of players.filter(isDemoPlayer)) await deletePlayer(p.id)
      toast.success(t.settings.demoRemoved(demoCount))
    } catch (e) {
      toast.error(String(e))
    } finally {
      setDemoBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t.settings.title} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 p-6">
          <Panel title={t.settings.language}>
            <Select value={lang} onValueChange={(v) => setLang(v as typeof lang)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Panel>

          <Panel title={t.settings.dataSource}>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{t.settings.dataSourceText}</p>
          </Panel>

          <Panel title={t.settings.backup} className="col-span-2">
            <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">{t.settings.backupText(players.length, tactics.length)}</p>
            <div className="flex gap-2">
              <Button onClick={doExport}><DownloadIcon />{t.settings.export}</Button>
              <Button variant="outline" onClick={doImport}><UploadIcon />{t.settings.import}</Button>
            </div>
          </Panel>

          <Panel title={t.settings.demo} className="col-span-2">
            <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">{t.settings.demoText}</p>
            <div className="flex items-center gap-2">
              <Button onClick={loadDemo} disabled={demoBusy || demoCount > 0}><UsersIcon />{t.settings.demoLoad}</Button>
              <Button variant="destructive" onClick={removeDemo} disabled={demoBusy || demoCount === 0}>
                <UserMinusIcon />{t.settings.demoRemove(demoCount)}
              </Button>
              {demoBusy && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
