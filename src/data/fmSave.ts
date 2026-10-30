import { invoke } from '@tauri-apps/api/core'
import type { SavePlayer, SaveSummary } from '../domain/fmSave'

/** Lit une sauvegarde FM27 (quelques secondes) : manager, club géré, date du jeu et liste des clubs. */
export function scanSave(path: string): Promise<SaveSummary> {
  return invoke<SaveSummary>('fm_save_scan', { path })
}

/** Équipe première et joueurs prêtés d'un club de la sauvegarde (relue depuis la mémoire si possible). */
export function savePlayers(path: string, clubId: number): Promise<SavePlayer[]> {
  return invoke<SavePlayer[]>('fm_save_players', { path, clubId })
}
