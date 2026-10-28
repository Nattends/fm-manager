import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Backup, DataSource } from './data/dataSource'
import { ManualSource } from './data/manualSource'
import { findTransfermarktPhoto } from './data/transfermarkt'
import { photoCacheKey } from './domain/photoMatch'
import { DEFAULT_ROLES } from './domain/defaultRoles'
import type { NewPlayer, NewTactic, Player, RoleDefinition, Tactic } from './domain/types'

interface Store {
  loading: boolean
  error: string | null
  players: Player[]
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [tactics, setTactics] = useState<Tactic[]>([])
  const [custom, setCustom] = useState<RoleDefinition[] | null>(null)

  const reload = useCallback(async () => {
    try {
      const [p, t, r] = await Promise.all([source.listPlayers(), source.listTactics(), source.getRoles()])
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
      setCustom(r)
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
    const next = players.find((p) => p.photoLookup !== p.name && !attempted.current.has(`${p.id}:${p.name}`))
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
  }, [players, loading, photoTick])

  const store = useMemo<Store>(
    () => ({
      loading,
      error,
      players,
      tactics,
      roles: custom ?? DEFAULT_ROLES,
      customRoles: custom !== null,
      photoSearching,
      async savePlayer(p) {
        const saved = await source.savePlayer(p)
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
        const player = players.find((x) => x.id === id)
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
        const saved = await source.saveTactic(t)
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
    [loading, error, players, tactics, custom, reload, photoSearching],
  )

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore doit être utilisé dans <StoreProvider>')
  return s
}
