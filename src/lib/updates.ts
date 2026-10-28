import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'

export type { Update }

/** Version installée (celle de tauri.conf.json). */
export const appVersion = (): Promise<string> => getVersion()

/**
 * Cherche une nouvelle version dans les releases GitHub (latest.json, signé).
 * Renvoie null si l'appli est à jour.
 */
export function checkForUpdate(): Promise<Update | null> {
  return check()
}

/**
 * Télécharge et installe la mise à jour, puis relance l'appli. Sur Windows, l'installateur
 * (mode « passive » : barre de progression seule) ferme l'appli pendant l'installation.
 */
export async function installUpdate(update: Update, onProgress?: (percent: number | null) => void): Promise<void> {
  let total = 0
  let received = 0
  await update.downloadAndInstall((e) => {
    if (e.event === 'Started') total = e.data.contentLength ?? 0
    if (e.event === 'Progress') {
      received += e.data.chunkLength
      onProgress?.(total ? Math.round((received / total) * 100) : null)
    }
  })
  await relaunch()
}
