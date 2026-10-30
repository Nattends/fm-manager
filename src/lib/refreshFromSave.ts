import { refreshScouting, savePlayers, scanSave } from '@/data/fmSave'
import { planSaveImport, todayGameDate } from '@/domain/fmSave'
import type { Club, NewPlayer, Player } from '@/domain/types'
import { getSaveLink, lastSavePath, setSaveLink } from './saveLink'

export interface RefreshResult {
  path: string
  clubName: string
  created: number
  updated: number
  /** Joueurs de l'application qui ne sont plus dans l'effectif de la sauvegarde (laissés tels quels). */
  missing: number
  /** Joueurs de la base de scouting. */
  scouted: number
}

/**
 * Relit la sauvegarde associée au club actif : met à jour son effectif (nouveaux joueurs créés,
 * joueurs connus mis à jour) puis la base de scouting. `pick` demande le fichier s'il n'est pas connu.
 */
export async function refreshFromSave(
  club: Club,
  players: Player[],
  savePlayer: (p: NewPlayer) => Promise<unknown>,
  pick: (defaultPath?: string) => Promise<string | null>,
): Promise<RefreshResult | null> {
  const link = getSaveLink(club.id)
  const path = link?.path ?? (await pick(lastSavePath()))
  if (!path) return null
  const summary = await scanSave(path)
  const saveClub = summary.clubs.find((c) => c.id === link?.saveClubId) ?? summary.clubs.find((c) => c.id === summary.managedClubId)
  if (!saveClub) throw new Error('club introuvable dans la sauvegarde')
  const plan = planSaveImport(await savePlayers(path, saveClub.id), players, club, summary.gameDate ?? todayGameDate())
  for (const a of plan.actions) await savePlayer(a.player)
  setSaveLink(club.id, { path, saveClubId: saveClub.id })
  const scouted = await refreshScouting(path)
  return {
    path,
    clubName: saveClub.shortName || saveClub.name,
    created: plan.actions.filter((a) => a.kind === 'create').length,
    updated: plan.actions.filter((a) => a.kind === 'update').length,
    missing: plan.missing.length,
    scouted,
  }
}
