import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { DicesIcon, DownloadIcon, Loader2Icon, RefreshCwIcon, UploadIcon, UsersIcon, UserMinusIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { askConfirm } from '@/lib/confirm'
import { LOGO_STYLES, setLogoStyle, useLogoStyle } from '@/lib/logoStyle'
import { appVersion, checkForUpdate } from '@/lib/updates'
import { cn } from '@/lib/utils'
import { loadSizeLock, setSizeLock } from '@/lib/windowMode'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ClubLogo } from '@/components/ClubLogo'
import { offerUpdate } from '@/components/updateToast'
import { PageHeader, Panel } from '@/components/layout'
import type { Backup } from '@/data/dataSource'
import { INVALID_BACKUP } from '@/data/manualSource'
import { demoSquad, isDemoPlayer } from '@/domain/demoSquad'
import { randomTeam } from '@/domain/randomSquad'
import { useI18n } from '@/i18n'
import { LANGUAGES } from '@/i18n/languages'
import { useStore } from '@/store'

export function SettingsPage() {
  const { players, tactics, clubs, activeClub, createClub, setActiveClub, exportAll, importAll, savePlayer, deletePlayer } = useStore()
  const logoStyle = useLogoStyle()
  const { t, lang, setLang } = useI18n()
  const [demoBusy, setDemoBusy] = useState(false)
  const [sizeLocked, setSizeLocked] = useState(loadSizeLock)
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    appVersion().then(setVersion).catch(() => setVersion('?'))
  }, [])

  const checkUpdates = async () => {
    setChecking(true)
    try {
      const update = await checkForUpdate()
      if (update) offerUpdate(update, t)
      else toast.success(t.updates.upToDate(version))
    } catch (e) {
      toast.error(t.updates.failed(String(e)))
    } finally {
      setChecking(false)
    }
  }

  const toggleSizeLock = (locked: boolean) => {
    setSizeLocked(locked)
    setSizeLock(locked).catch((e) => toast.error(String(e)))
  }
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

  /** Nouveau club de test, avec une équipe aléatoire, puis bascule sur ce club. */
  const generateTeam = async () => {
    setDemoBusy(true)
    try {
      const team = randomTeam(Date.now() % 2_147_483_647, clubs.map((c) => c.name))
      const club = await createClub(team.clubName)
      for (const p of team.players) await savePlayer({ ...p, clubId: club.id })
      setActiveClub(club.id)
      toast.success(t.settings.randomTeamDone(team.clubName, team.players.length))
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

          <Panel title={t.settings.window} className="col-span-2">
            <div className="flex items-start gap-3">
              <Switch id="size-lock" checked={sizeLocked} onCheckedChange={toggleSizeLock} className="mt-0.5" />
              <div className="space-y-1">
                <Label htmlFor="size-lock" className="text-sm text-slate-200">{t.settings.sizeLock}</Label>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {sizeLocked ? t.settings.sizeLockOn : t.settings.sizeLockOff}
                </p>
              </div>
            </div>
          </Panel>

          <Panel title={t.settings.logoStyle} className="col-span-2">
            <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{t.settings.logoStyleText}</p>
            <div className="grid grid-cols-4 gap-2">
              {LOGO_STYLES.map((s) => (
                <button key={s} onClick={() => setLogoStyle(s)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors',
                    s === logoStyle ? 'border-emerald-500 bg-emerald-500/10 text-slate-100' : 'border-border text-slate-300 hover:bg-secondary/50',
                  )}>
                  <ClubLogo name={activeClub.name} size={40} variant={s} />
                  <span className="font-medium">{t.settings.logoStyles[s]}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title={t.updates.title}>
            <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{t.updates.text(version)}</p>
            <Button variant="outline" onClick={checkUpdates} disabled={checking}>
              {checking ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}{t.updates.check}
            </Button>
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
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{t.settings.randomTeamText}</p>
              <Button variant="outline" onClick={generateTeam} disabled={demoBusy}><DicesIcon />{t.settings.randomTeam}</Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
