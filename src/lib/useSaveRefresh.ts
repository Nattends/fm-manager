import { open } from '@tauri-apps/plugin-dialog'
import { useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import { askConfirm } from './confirm'
import { refreshFromSave } from './refreshFromSave'
import { lastSavePath, setSaveLink, getSaveLink } from './saveLink'

/**
 * Rafraîchissement depuis la sauvegarde liée au club actif (bouton de l'en-tête et Réglages) :
 * effectif puis base de scouting, résultat en notification. Renvoie vrai si le rafraîchissement a abouti.
 */
export function useSaveRefresh() {
  const { players, activeClub, savePlayer, deletePlayer } = useStore()
  const { t } = useI18n()
  const [refreshing, setRefreshing] = useState(false)

  const pickSave = async (defaultPath?: string) => {
    const picked = await open({ title: t.fmSave.pickTitle, defaultPath, filters: [{ name: 'Football Manager', extensions: ['fm'] }] })
    return typeof picked === 'string' ? picked : null
  }

  /** Avec `choose`, demande d'abord une autre sauvegarde, qui devient celle du club. */
  const refresh = async (choose = false): Promise<boolean> => {
    if (refreshing) return false
    setRefreshing(true)
    try {
      if (choose) {
        const path = await pickSave(getSaveLink(activeClub.id)?.path ?? lastSavePath())
        if (!path) return false
        setSaveLink(activeClub.id, { path, saveClubId: null })
      }
      const r = await refreshFromSave(activeClub, players, savePlayer, pickSave, deletePlayer,
        (gone) => askConfirm(t.settings.refreshRemoveConfirm(gone.map((p) => p.name).join('\n'), gone.length)))
      if (!r) return false
      const notes = [r.removed > 0 && t.settings.refreshRemoved(r.removed), r.missing > 0 && t.settings.refreshMissing(r.missing)]
        .filter(Boolean).join(' ')
      toast.success(t.settings.refreshDone(r.clubName, r.created, r.updated, r.scouted), notes ? { description: notes } : undefined)
      return true
    } catch (e) {
      toast.error(t.settings.refreshFailed(String(e)))
      return false
    } finally {
      setRefreshing(false)
    }
  }

  return { refreshing, refresh }
}
