import Database from '@tauri-apps/plugin-sql'
import { isAttributeKey } from '../domain/attributes'
import { isRoleList } from '../domain/defaultRoles'
import { narrowHalfSpaceGrid, normalizeTacticSlots } from '../domain/lineup'
import { HALF_SPACE_GRID, PITCH_COLS } from '../domain/pitch'
import type { Attributes, Club, NewPlayer, NewTactic, Player, RoleDefinition, Tactic, TacticSlot } from '../domain/types'
import type { Backup, DataSource } from './dataSource'

const DB_URL = 'sqlite:fm27.db'
/** Message d'erreur (traduit par l'interface) quand un fichier importé n'est pas une sauvegarde. */
export const INVALID_BACKUP = 'INVALID_BACKUP'
/** Nom du club créé pour les données d'une sauvegarde version 1 (un seul club). */
const IMPORTED_CLUB = 'My club'

interface PlayerRow {
  id: number
  club_id: number
  name: string
  age: number
  nationality: string
  club: string
  on_loan: number
  foot: Player['foot']
  positions: string
  ca_stars: number
  pa_stars: number
  contract_end: string | null
  wage: number | null
  value: number | null
  status: Player['status']
  notes: string
  photo: string | null
  photo_lookup: string | null
}

interface AttributeRow {
  player_id: number
  attr: string
  value: number
}

interface TacticRow {
  id: number
  club_id: number
  name: string
  formation: string
  slots: string
  excluded: string
  notes: string
  /** Nombre de colonnes de la grille des slots enregistrés : 5 couloirs, ou 9 avec les demi-espaces. */
  grid: number
}

/** Slots enregistrés avec la grille à demi-espaces (9 colonnes) : ramenés sur les 5 couloirs. */
function slotsOnGrid(slots: Partial<TacticSlot>[], grid: number): Partial<TacticSlot>[] {
  return grid === HALF_SPACE_GRID ? narrowHalfSpaceGrid(slots) : slots
}

let dbPromise: Promise<Database> | null = null
function db(): Promise<Database> {
  dbPromise ??= Database.load(DB_URL)
  return dbPromise
}

function rowToPlayer(row: PlayerRow, attributes: Attributes): Player {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    age: row.age,
    nationality: row.nationality,
    club: row.club,
    onLoan: row.on_loan === 1,
    foot: row.foot,
    positions: JSON.parse(row.positions),
    caStars: row.ca_stars,
    paStars: row.pa_stars,
    contractEnd: row.contract_end,
    wage: row.wage,
    value: row.value,
    status: row.status,
    notes: row.notes,
    attributes,
    photo: row.photo,
    photoLookup: row.photo_lookup,
  }
}

export class ManualSource implements DataSource {
  async listClubs(): Promise<Club[]> {
    const d = await db()
    return d.select<Club[]>('SELECT id, name FROM clubs ORDER BY id')
  }

  async saveClub(club: Omit<Club, 'id'> & { id?: number }): Promise<Club> {
    const d = await db()
    if (club.id === undefined) {
      const res = await d.execute('INSERT INTO clubs (name) VALUES ($1)', [club.name])
      return { id: res.lastInsertId as number, name: club.name }
    }
    await d.execute('UPDATE clubs SET name = $1 WHERE id = $2', [club.name, club.id])
    return { id: club.id, name: club.name }
  }

  async deleteClub(id: number): Promise<void> {
    const d = await db()
    await d.execute('DELETE FROM player_attributes WHERE player_id IN (SELECT id FROM players WHERE club_id = $1)', [id])
    await d.execute('DELETE FROM players WHERE club_id = $1', [id])
    await d.execute('DELETE FROM tactics WHERE club_id = $1', [id])
    await d.execute('DELETE FROM clubs WHERE id = $1', [id])
  }

  async listClubLogos(): Promise<Map<string, string | null>> {
    const d = await db()
    const rows = await d.select<{ key: string; logo: string | null }[]>('SELECT key, logo FROM club_logo_cache')
    return new Map(rows.map((r) => [r.key, r.logo]))
  }

  async cacheClubLogo(key: string, logo: string | null): Promise<void> {
    const d = await db()
    await d.execute(
      `INSERT INTO club_logo_cache (key, logo) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET logo = excluded.logo, fetched_at = datetime('now')`,
      [key, logo],
    )
  }

  async listPlayers(): Promise<Player[]> {
    const d = await db()
    const rows = await d.select<PlayerRow[]>('SELECT * FROM players ORDER BY name COLLATE NOCASE')
    const attrRows = await d.select<AttributeRow[]>('SELECT player_id, attr, value FROM player_attributes')
    const attrs = new Map<number, Attributes>()
    for (const a of attrRows) {
      if (!isAttributeKey(a.attr)) continue
      const m = attrs.get(a.player_id) ?? {}
      m[a.attr] = a.value
      attrs.set(a.player_id, m)
    }
    return rows.map((r) => rowToPlayer(r, attrs.get(r.id) ?? {}))
  }

  async savePlayer(p: NewPlayer): Promise<Player> {
    const d = await db()
    const params = [
      p.name, p.age, p.nationality, p.foot, JSON.stringify(p.positions), p.caStars, p.paStars,
      p.contractEnd, p.wage, p.value, p.status, p.notes,
      // Absents des sauvegardes antérieures à la version 0.2.
      p.club ?? '', p.onLoan ? 1 : 0,
    ]
    let id = p.id
    let clubId = p.clubId
    if (id === undefined) {
      if (clubId === undefined) throw new Error('clubId manquant pour un nouveau joueur')
      const res = await d.execute(
        `INSERT INTO players (name, age, nationality, foot, positions, ca_stars, pa_stars,
           contract_end, wage, value, status, notes, club, on_loan, club_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [...params, clubId],
      )
      id = res.lastInsertId as number
    } else {
      await d.execute(
        `UPDATE players SET name = $1, age = $2, nationality = $3, foot = $4, positions = $5,
           ca_stars = $6, pa_stars = $7, contract_end = $8, wage = $9, value = $10, status = $11,
           notes = $12, club = $13, on_loan = $14, updated_at = datetime('now')
         WHERE id = $15`,
        [...params, id],
      )
    }
    await this.writeAttributes(d, id, p.attributes)
    // La photo et le club ne sont jamais modifiés ici : on relit l'état en base.
    const [row] = await d.select<Pick<PlayerRow, 'photo' | 'photo_lookup' | 'club_id'>[]>(
      'SELECT photo, photo_lookup, club_id FROM players WHERE id = $1', [id],
    )
    clubId = row?.club_id ?? clubId!
    return {
      ...p, id, clubId, club: p.club ?? '', onLoan: !!p.onLoan,
      photo: row?.photo ?? null, photoLookup: row?.photo_lookup ?? null,
    }
  }

  async setPlayerPhoto(id: number, photo: string | null, lookup: string | null): Promise<void> {
    const d = await db()
    await d.execute('UPDATE players SET photo = $1, photo_lookup = $2 WHERE id = $3', [photo, lookup, id])
  }

  private async writeAttributes(d: Database, playerId: number, attributes: Attributes) {
    await d.execute('DELETE FROM player_attributes WHERE player_id = $1', [playerId])
    for (const [attr, value] of Object.entries(attributes)) {
      if (value === undefined) continue
      await d.execute('INSERT INTO player_attributes (player_id, attr, value) VALUES ($1, $2, $3)', [
        playerId, attr, value,
      ])
    }
  }

  async getCachedPhoto(key: string): Promise<string | null | undefined> {
    const d = await db()
    const rows = await d.select<{ photo: string | null }[]>('SELECT photo FROM photo_cache WHERE key = $1', [key])
    return rows.length ? rows[0].photo : undefined
  }

  async cachePhoto(key: string, photo: string | null, overwrite = true): Promise<void> {
    const d = await db()
    await d.execute(
      overwrite
        ? `INSERT INTO photo_cache (key, photo) VALUES ($1, $2)
           ON CONFLICT(key) DO UPDATE SET photo = excluded.photo, fetched_at = datetime('now')`
        : 'INSERT OR IGNORE INTO photo_cache (key, photo) VALUES ($1, $2)',
      [key, photo],
    )
  }

  async uncachePhoto(key: string): Promise<void> {
    const d = await db()
    await d.execute('DELETE FROM photo_cache WHERE key = $1', [key])
  }

  async deletePlayer(id: number): Promise<void> {
    const d = await db()
    await d.execute('DELETE FROM player_attributes WHERE player_id = $1', [id])
    await d.execute('DELETE FROM players WHERE id = $1', [id])
  }

  async listTactics(): Promise<Tactic[]> {
    const d = await db()
    const rows = await d.select<TacticRow[]>('SELECT id, club_id, name, formation, slots, excluded, notes, grid FROM tactics ORDER BY id')
    return rows.map(({ excluded, club_id, grid, ...r }) => ({
      ...r,
      clubId: club_id,
      slots: normalizeTacticSlots(slotsOnGrid(JSON.parse(r.slots), grid), r.formation),
      excludedPlayerIds: JSON.parse(excluded),
    }))
  }

  async saveTactic(t: NewTactic): Promise<Tactic> {
    const d = await db()
    const params = [t.name, t.formation, JSON.stringify(t.slots), JSON.stringify(t.excludedPlayerIds), t.notes]
    if (t.id === undefined) {
      if (t.clubId === undefined) throw new Error('clubId manquant pour une nouvelle tactique')
      const res = await d.execute(
        'INSERT INTO tactics (name, formation, slots, excluded, notes, club_id, grid) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [...params, t.clubId, PITCH_COLS],
      )
      return { ...t, id: res.lastInsertId as number, clubId: t.clubId }
    }
    await d.execute(
      `UPDATE tactics SET name = $1, formation = $2, slots = $3, excluded = $4, notes = $5,
         grid = $7, updated_at = datetime('now')
       WHERE id = $6`,
      [...params, t.id, PITCH_COLS],
    )
    const [row] = await d.select<{ club_id: number }[]>('SELECT club_id FROM tactics WHERE id = $1', [t.id])
    return { ...t, id: t.id, clubId: row?.club_id ?? t.clubId! }
  }

  async deleteTactic(id: number): Promise<void> {
    const d = await db()
    await d.execute('DELETE FROM tactics WHERE id = $1', [id])
  }

  async getRoles(): Promise<RoleDefinition[] | null> {
    const d = await db()
    const rows = await d.select<{ value: string }[]>("SELECT value FROM settings WHERE key = 'roles'")
    if (!rows.length) return null
    // Les rôles enregistrés à l'ancien format (attributs clés / secondaires) sont ignorés :
    // les profils par défaut (poids par attribut) s'appliquent jusqu'au prochain enregistrement.
    const stored: unknown = JSON.parse(rows[0].value)
    return isRoleList(stored) ? stored : null
  }

  async saveRoles(roles: RoleDefinition[] | null): Promise<void> {
    const d = await db()
    if (roles === null) {
      await d.execute("DELETE FROM settings WHERE key = 'roles'")
    } else {
      await d.execute(
        "INSERT INTO settings (key, value) VALUES ('roles', $1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [JSON.stringify(roles)],
      )
    }
  }

  async exportAll(): Promise<Backup> {
    return {
      app: 'fm27-manager',
      version: 4,
      exportedAt: new Date().toISOString(),
      clubs: await this.listClubs(),
      players: await this.listPlayers(),
      tactics: await this.listTactics(),
      roles: await this.getRoles(),
    }
  }

  async importAll(backup: Backup): Promise<void> {
    if (backup.app !== 'fm27-manager' || ![1, 2, 3, 4].includes(backup.version)) {
      throw new Error(INVALID_BACKUP)
    }
    const d = await db()
    await d.execute('DELETE FROM player_attributes')
    await d.execute('DELETE FROM players')
    await d.execute('DELETE FROM tactics')
    await d.execute('DELETE FROM clubs')

    // Version 1 : un seul club. Les identifiants changent : on remappe clubs, joueurs et verrous.
    const clubs = backup.clubs?.length ? backup.clubs : [{ id: 0, name: IMPORTED_CLUB }]
    const clubMap = new Map<number, number>()
    for (const c of clubs) clubMap.set(c.id, (await this.saveClub({ name: c.name })).id)
    const clubOf = (id: number | undefined) => clubMap.get(id ?? clubs[0].id) ?? clubMap.get(clubs[0].id)!

    const idMap = new Map<number, number>()
    for (const p of backup.players) {
      const saved = await this.savePlayer({ ...p, id: undefined, clubId: clubOf(p.clubId) })
      if (p.photoLookup) await this.setPlayerPhoto(saved.id, p.photo ?? null, p.photoLookup)
      idMap.set(p.id, saved.id)
    }
    for (const t of backup.tactics) {
      await this.saveTactic({
        ...t,
        id: undefined,
        clubId: clubOf(t.clubId),
        // Sauvegardes version 3 : grille à demi-espaces ; les autres : 5 couloirs.
        slots: normalizeTacticSlots(slotsOnGrid(t.slots, backup.version === 3 ? HALF_SPACE_GRID : PITCH_COLS), t.formation).map((s) => ({
          ...s,
          lockedPlayerId: s.lockedPlayerId !== null ? (idMap.get(s.lockedPlayerId) ?? null) : null,
        })),
        excludedPlayerIds: (t.excludedPlayerIds ?? []).flatMap((id) => idMap.get(id) ?? []),
      })
    }
    await this.saveRoles(isRoleList(backup.roles) ? backup.roles : null)
  }
}
