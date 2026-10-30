/**
 * Sauvegarde FM27 associée à chaque club de l'application (chemin du fichier et club dans la sauvegarde),
 * retenue lors d'un import pour que « Rafraîchir les données » relise le bon fichier.
 */
export interface SaveLink {
  path: string
  /** Club dans la sauvegarde (null = club géré par le joueur). */
  saveClubId: number | null
}

const LAST_PATH_KEY = 'fmSave.path'
const linkKey = (clubId: number) => `fmSave.link.${clubId}`

/** Dernière sauvegarde choisie, tous clubs confondus. */
export function lastSavePath(): string | undefined {
  try {
    return localStorage.getItem(LAST_PATH_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function getSaveLink(clubId: number): SaveLink | null {
  try {
    const raw = localStorage.getItem(linkKey(clubId))
    const link = raw ? (JSON.parse(raw) as SaveLink) : null
    return link && typeof link.path === 'string' ? link : null
  } catch {
    return null
  }
}

export function setSaveLink(clubId: number, link: SaveLink): void {
  try {
    localStorage.setItem(linkKey(clubId), JSON.stringify(link))
    localStorage.setItem(LAST_PATH_KEY, link.path)
  } catch { /* stockage indisponible : il faudra rechoisir le fichier */ }
}
