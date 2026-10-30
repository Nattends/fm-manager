import type { Club, NewPlayer, NewTactic, Player, RoleDefinition, Tactic } from '../domain/types'

/** Contenu complet d'une sauvegarde (export / import JSON). */
export interface Backup {
  app: 'fm27-manager'
  /**
   * 1 : un seul club (avant la v0.2), 2 : plusieurs clubs, 3 : grille avec demi-espaces (9 colonnes),
   * 4 : retour aux 5 couloirs de FM (même grille que les versions 1 et 2).
   */
  version: 1 | 2 | 3 | 4
  exportedAt: string
  /** Absent des sauvegardes version 1. */
  clubs?: Club[]
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
  listClubs(): Promise<Club[]>
  saveClub(club: Omit<Club, 'id'> & { id?: number }): Promise<Club>
  /** Supprime le club avec ses joueurs et ses tactiques. */
  deleteClub(id: number): Promise<void>
  /** Cache des logos de club : undefined = jamais cherché, null = aucun logo trouvé. */
  listClubLogos(): Promise<Map<string, string | null>>
  cacheClubLogo(key: string, logo: string | null): Promise<void>

  /** Joueurs de tous les clubs. */
  listPlayers(): Promise<Player[]>
  /** `clubId` est obligatoire pour un nouveau joueur. */
  savePlayer(player: NewPlayer): Promise<Player>
  deletePlayer(id: number): Promise<void>
  /** Enregistre la photo (null = avatar inconnu) et le nom pour lequel elle a été cherchée. */
  setPlayerPhoto(id: number, photo: string | null, lookup: string | null): Promise<void>
  /** Cache des photos : undefined = jamais cherchée, null = aucune photo trouvée. */
  getCachedPhoto(key: string): Promise<string | null | undefined>
  cachePhoto(key: string, photo: string | null, overwrite?: boolean): Promise<void>
  uncachePhoto(key: string): Promise<void>

  /** Tactiques de tous les clubs. */
  listTactics(): Promise<Tactic[]>
  saveTactic(tactic: NewTactic): Promise<Tactic>
  deleteTactic(id: number): Promise<void>

  /** Rôles personnalisés (communs à tous les clubs), ou null pour les rôles par défaut. */
  getRoles(): Promise<RoleDefinition[] | null>
  saveRoles(roles: RoleDefinition[] | null): Promise<void>

  exportAll(): Promise<Backup>
  /** Remplace toutes les données par celles de la sauvegarde. */
  importAll(backup: Backup): Promise<void>
}
