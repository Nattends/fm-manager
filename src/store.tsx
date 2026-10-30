import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Backup, DataSource } from './data/dataSource'
import { ManualSource } from './data/manualSource'
import { findClubLogo, findTransfermarktPhoto } from './data/transfermarkt'
import { clubLogoKey } from './domain/clubMatch'
import { photoCacheKey } from './domain/photoMatch'
import { cleanStoredRoles, DEFAULT_ROLES } from './domain/defaultRoles'
import type { Club, NewPlayer, NewTactic, Player, RoleDefinition, Tactic } from './domain/types'

interface Store {
  loading: boolean
  error: string | null
  /** Clubs gérés (une partie par club). */
  clubs: Club[]
  activeClub: Club
  setActiveClub(id: number): void
  createClub(name: string): Promise<Club>
  renameClub(id: number, name: string): Promise<void>
  /** Supprime le club avec ses joueurs et ses tactiques (impossible pour le dernier club). */
  deleteClub(id: number): Promise<void>
  /** Logo d'un club d'après son nom : undefined = pas encore cherché, null = introuvable. */
  clubLogo(name: string): string | null | undefined
  /** Relance la recherche du logo d'un club. */
  refreshClubLogo(name: string): void
  /** Vrai pendant une recherche de logo sur Transfermarkt. */
  logoSearching: boolean
  /** Joueurs du club actif. */
  players: Player[]
  /** Tactiques du club actif. */
  tactics: Tactic[]
  roles: RoleDefinition[]
  customRoles: boolean
  /** Vrai pendant une recherche de photo sur Transfermarkt. */
  photoSearching: boolean
  savePlayer(p: NewPlayer): Promise<Player>
  deletePlayer(id: number): Promise<void>
  /** Relance la recherche de photo ("wrong" : la photo trouvée n'est pas la bonne → avatar inconnu). */
  resetPhoto(id: number, mode: 'search' | 'wrong'): Promise<void>
  saveTactic(t: NewTactic): Promise<Tactic>
  deleteTactic(id: number): Promise<void>
  saveRoles(roles: RoleDefinition[] | null): Promise<void>
  exportAll(): Promise<Backup>
  importAll(b: Backup): Promise<void>
}

const StoreContext = createContext<Store | null>(null)

const source: DataSource = new ManualSource()
const ACTIVE_CLUB_KEY = 'app.club'

function loadActiveClub(): number | null {
  try {
    const v = Number(localStorage.getItem(ACTIVE_CLUB_KEY))
    return Number.isInteger(v) && v > 0 ? v : null
  } catch { return null }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clubs, setClubs] = useState<Club[]>([])
  const [activeClubId, setActiveClubId] = useState<number | null>(loadActiveClub)
  const [logos, setLogos] = useState<Map<string, string | null>>(new Map())
  const [allPlayers, setPlayers] = useState<Player[]>([])
  const [allTactics, setTactics] = useState<Tactic[]>([])
  const [custom, setCustom] = useState<RoleDefinition[] | null>(null)

  const reload = useCallback(async () => {
    try {
      const [c, l, p, t, r] = await Promise.all([
        source.listClubs(), source.listClubLogos(), source.listPlayers(), source.listTactics(), source.getRoles(),
      ])
      setClubs(c)
      setLogos(l)
      setPlayers(p)
      setTactics(t)
      // Photos déjà trouvées avant l'arrivée du cache : on les y range (sans écraser).
      try {
        for (const player of p) {
          if (player.photoLookup === player.name) await source.cachePhoto(photoCacheKey(player), player.photo, false)
        }
      } catch (e) {
        console.warn('Remplissage du cache de photos impossible', e)
      }
      // Rôles disparus (profils du notebook, rôles FM24) retirés de la liste enregistrée ; vide → rôles par défaut.
      const cleaned = r && cleanStoredRoles(r)
      if (r && cleaned !== r) await source.saveRoles(cleaned)
      setCustom(cleaned)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Recherche automatique des photos, un joueur à la fois. Le cache (nom + nationalité) est
  // consulté d'abord ; sinon Transfermarkt est interrogé, avec une pause entre deux requêtes.
  // Un joueur est cherché quand son nom diffère de la dernière recherche.
  const attempted = useRef(new Set<string>())
  const searching = useRef(false)
  const [photoTick, setPhotoTick] = useState(0)
  const [photoSearching, setPhotoSearching] = useState(false)
  useEffect(() => {
    if (loading || searching.current) return
    const next = allPlayers.find((p) => p.photoLookup !== p.name && !attempted.current.has(`${p.id}:${p.name}`))
    if (!next) return
    searching.current = true
    attempted.current.add(`${next.id}:${next.name}`)
    void (async () => {
      let fromNetwork = false
      try {
        const key = photoCacheKey(next)
        let photo = await source.getCachedPhoto(key)
        if (photo === undefined) {
          fromNetwork = true
          setPhotoSearching(true)
          photo = await findTransfermarktPhoto(next)
          await source.cachePhoto(key, photo)
        }
        await source.setPlayerPhoto(next.id, photo, next.name)
        setPlayers((list) =>
          list.map((x) => (x.id === next.id && x.name === next.name ? { ...x, photo, photoLookup: next.name } : x)),
        )
      } catch (e) {
        // Site injoignable ou bloqué : nouvel essai au prochain lancement.
        console.warn('Recherche de photo impossible', next.name, e)
      } finally {
        setPhotoSearching(false)
        if (fromNetwork) await new Promise((r) => setTimeout(r, 1500))
        searching.current = false
        setPhotoTick((n) => n + 1)
      }
    })()
  }, [allPlayers, loading, photoTick])

  // Logos des clubs (clubs gérés et clubs de prêt), même principe : un à la fois, avec une pause.
  const logoAttempted = useRef(new Set<string>())
  const logoBusy = useRef(false)
  const [logoTick, setLogoTick] = useState(0)
  const [logoSearching, setLogoSearching] = useState(false)
  useEffect(() => {
    if (loading || logoBusy.current) return
    const names = [...clubs.map((c) => c.name), ...allPlayers.filter((p) => p.onLoan).map((p) => p.club)]
    const name = names.find((n) => {
      const key = clubLogoKey(n)
      return key !== '' && !logos.has(key) && !logoAttempted.current.has(key)
    })
    if (!name) return
    const key = clubLogoKey(name)
    logoBusy.current = true
    logoAttempted.current.add(key)
    setLogoSearching(true)
    void (async () => {
      try {
        const logo = await findClubLogo(name)
        await source.cacheClubLogo(key, logo)
        setLogos((m) => new Map(m).set(key, logo))
      } catch (e) {
        console.warn('Recherche de logo impossible', name, e)
      } finally {
        setLogoSearching(false)
        await new Promise((r) => setTimeout(r, 1500))
        logoBusy.current = false
        setLogoTick((n) => n + 1)
      }
    })()
  }, [clubs, allPlayers, logos, loading, logoTick])

  // Club actif : celui mémorisé s'il existe encore, sinon le premier.
  const activeClub = useMemo(
    () => clubs.find((c) => c.id === activeClubId) ?? clubs[0] ?? { id: 0, name: '' },
    [clubs, activeClubId],
  )
  const players = useMemo(() => allPlayers.filter((p) => p.clubId === activeClub.id), [allPlayers, activeClub.id])
  const tactics = useMemo(() => allTactics.filter((t) => t.clubId === activeClub.id), [allTactics, activeClub.id])

  const store = useMemo<Store>(
    () => ({
      loading,
      error,
      clubs,
      activeClub,
      setActiveClub(id) {
        setActiveClubId(id)
        try { localStorage.setItem(ACTIVE_CLUB_KEY, String(id)) } catch { /* ignoré */ }
      },
      async createClub(name) {
        const club = await source.saveClub({ name })
        setClubs((list) => [...list, club])
        return club
      },
      async renameClub(id, name) {
        await source.saveClub({ id, name })
        setClubs((list) => list.map((c) => (c.id === id ? { ...c, name } : c)))
      },
      async deleteClub(id) {
        if (clubs.length <= 1) return
        await source.deleteClub(id)
        setClubs((list) => list.filter((c) => c.id !== id))
        setPlayers((list) => list.filter((p) => p.clubId !== id))
        setTactics((list) => list.filter((t) => t.clubId !== id))
      },
      clubLogo: (name) => logos.get(clubLogoKey(name)),
      refreshClubLogo(name) {
        const key = clubLogoKey(name)
        logoAttempted.current.delete(key)
        setLogos((m) => {
          const next = new Map(m)
          next.delete(key)
          return next
        })
      },
      logoSearching,
      players,
      tactics,
      roles: custom ?? DEFAULT_ROLES,
      customRoles: custom !== null,
      photoSearching,
      async savePlayer(p) {
        const saved = await source.savePlayer({ ...p, clubId: p.clubId ?? activeClub.id })
        setPlayers((list) => {
          const others = list.filter((x) => x.id !== saved.id)
          return [...others, saved].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        })
        return saved
      },
      async deletePlayer(id) {
        await source.deletePlayer(id)
        setPlayers((list) => list.filter((x) => x.id !== id))
      },
      async resetPhoto(id, mode) {
        const player = allPlayers.find((x) => x.id === id)
        if (!player) return
        const lookup = mode === 'wrong' ? player.name : null
        // « Rechercher à nouveau » ignore le cache ; « Mauvaise photo » y mémorise l'absence de photo.
        if (mode === 'search') await source.uncachePhoto(photoCacheKey(player))
        else await source.cachePhoto(photoCacheKey(player), null)
        await source.setPlayerPhoto(id, null, lookup)
        attempted.current.delete(`${id}:${player.name}`)
        setPlayers((list) => list.map((x) => (x.id === id ? { ...x, photo: null, photoLookup: lookup } : x)))
      },
      async saveTactic(t) {
        const saved = await source.saveTactic({ ...t, clubId: t.clubId ?? activeClub.id })
        setTactics((list) => {
          const i = list.findIndex((x) => x.id === saved.id)
          return i === -1 ? [...list, saved] : list.map((x) => (x.id === saved.id ? saved : x))
        })
        return saved
      },
      async deleteTactic(id) {
        await source.deleteTactic(id)
        setTactics((list) => list.filter((x) => x.id !== id))
      },
      async saveRoles(roles) {
        await source.saveRoles(roles)
        setCustom(roles)
      },
      exportAll: () => source.exportAll(),
      async importAll(b) {
        await source.importAll(b)
        await reload()
      },
    }),
    [loading, error, clubs, activeClub, logos, logoSearching, players, tactics, allPlayers, custom, reload, photoSearching],
  )

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore doit être utilisé dans <StoreProvider>')
  return s
}