import { confirm } from '@tauri-apps/plugin-dialog'

/**
 * Demande une confirmation et attend la réponse.
 *
 * Ne pas utiliser `window.confirm` : le plugin de dialogue Tauri le remplace par une version
 * asynchrone qui renvoie une Promise — toujours « vraie » dans un `if` — si bien qu'annuler
 * n'empêchait pas l'action.
 */
export async function askConfirm(message: string): Promise<boolean> {
  try {
    return await confirm(message, { title: 'FM27 Manager', kind: 'warning' })
  } catch {
    // Hors de Tauri (navigateur) : confirmation classique, éventuellement asynchrone.
    return Boolean(await Promise.resolve(window.confirm(message)))
  }
}
