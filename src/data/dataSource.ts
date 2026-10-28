import type { NewPlayer, NewTactic, Player, RoleDefinition, Tactic } from '../domain/types'

/** Contenu complet d'une sauvegarde (export / import JSON). */
export interface Backup {
  app: 'fm27-manager'
  version: 1
  exportedAt: string
  players: Player[]
  tactics: Tactic[]
  roles: RoleDefinition[] | null
}

/**
 * Source de données de l'application. La v1 utilise une saisie manuelle stockée en SQLite
 * (`ManualSource`). Une future `MemorySource` (lecture mémoire de FM27) pourra alimenter
 * les joueurs via la même interface.
 */
export interface DataSource {
  listPlayers(): Promise<Player[]>
  savePlayer(player: NewPlayer): Promise<Player>
  deletePlayer(id: number): Promise<void>
  /** Enregistre la photo (null = avatar inconnu) et le nom pour lequel elle a été cherchée. */
  setPlayerPhoto(id: number, photo: string | null, lookup: string | null): Promise<void>
  /** Cache des photos : undefined = jamais cherchée, null = aucune photo trouvée. */
  getCachedPhoto(key: string): Promise<string | null | undefined>
  cachePhoto(key: string, photo: string | null, overwrite?: boolean): Promise<void>
  uncachePhoto(key: string): Promise<void>

  listTactics(): Promise<Tactic[]>
  saveTactic(tactic: NewTactic): Promise<Tactic>
  deleteTactic(id: number): Promise<void>

  /** Rôles personnalisés, ou null si l'utilisateur utilise les rôles par défaut. */
  getRoles(): Promise<RoleDefinition[] | null>
  saveRoles(roles: RoleDefinition[] | null): Promise<void>

  exportAll(): Promise<Backup>
  /** Remplace toutes les données par celles de la sauvegarde. */
  importAll(backup: Backup): Promise<void>
}
