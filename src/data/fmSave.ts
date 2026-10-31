import { invoke } from '@tauri-apps/api/core'
import type { SavePlayer, SaveSummary, YouthPlayer } from '../domain/fmSave'
import { decodeScouting, type ScoutDb } from '../domain/scouting'

/** Lit une sauvegarde FM27 (quelques secondes) : manager, club géré, date du jeu et liste des clubs. */
export function scanSave(path: string): Promise<SaveSummary> {
  return invoke<SaveSummary>('fm_save_scan', { path })
}

/** Équipe première et joueurs prêtés d'un club de la sauvegarde (relue depuis la mémoire si possible). */
export function savePlayers(path: string, clubId: number): Promise<SavePlayer[]> {
  return invoke<SavePlayer[]>('fm_save_players', { path, clubId })
}

/** Joueurs des équipes de jeunes et affiliées (U19, B, C…) d'un club de la sauvegarde. */
export function saveYouth(path: string, clubId: number): Promise<YouthPlayer[]> {
  return invoke<YouthPlayer[]>('fm_save_youth', { path, clubId })
}

let scouting: Promise<ScoutDb | null> | null = null

/** Enregistre tous les joueurs de la sauvegarde comme base de scouting ; renvoie leur nombre. */
export async function refreshScouting(path: string): Promise<number> {
  const n = await invoke<number>('fm_scout_refresh', { path })
  scouting = null
  return n
}

/** Base de scouting enregistrée (null si elle n'a jamais été créée), gardée en mémoire entre les pages. */
export function loadScouting(): Promise<ScoutDb | null> {
  scouting ??= invoke<ArrayBuffer>('fm_scout_data').then((buf) => decodeScouting(new Uint8Array(buf)))
  scouting.catch(() => { scouting = null })
  return scouting
}
