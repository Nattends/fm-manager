import { PhysicalPosition, PhysicalSize, availableMonitors, getCurrentWindow } from '@tauri-apps/api/window'
import { useSyncExternalStore } from 'react'
import { isReachable, parseGeometry, type WindowGeometry } from '@/domain/windowGeometry'

/**
 * Fenêtre libre : redimensionnable sur n'importe quel écran (la mise en page s'adapte à sa taille),
 * avec sa position et sa taille retenues d'une session à l'autre.
 */
const GEOMETRY_KEY = 'window.geometry'

function saveGeometry(g: WindowGeometry) {
  try { localStorage.setItem(GEOMETRY_KEY, JSON.stringify(g)) } catch { /* ignoré */ }
}

/** Remet la fenêtre où elle était à la dernière session, si cet endroit est encore sur un écran. */
export async function restoreWindow(): Promise<void> {
  let raw: string | null = null
  try { raw = localStorage.getItem(GEOMETRY_KEY) } catch { /* ignoré */ }
  const g = parseGeometry(raw)
  if (!g) return
  const screens = (await availableMonitors()).map((m) => ({
    x: m.workArea.position.x, y: m.workArea.position.y, width: m.workArea.size.width, height: m.workArea.size.height,
  }))
  if (!isReachable(g, screens)) return
  const win = getCurrentWindow()
  // position d'abord : la fenêtre prend le facteur d'échelle de l'écran visé avant d'être redimensionnée
  await win.setPosition(new PhysicalPosition(g.x, g.y))
  await win.setSize(new PhysicalSize(g.width, g.height))
  await win.setPosition(new PhysicalPosition(g.x, g.y))
  if (g.maximized) await win.maximize()
}

/** Enregistre la position et la taille à chaque déplacement ou redimensionnement ; renvoie la fonction d'arrêt. */
export async function trackWindow(): Promise<() => void> {
  const win = getCurrentWindow()
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      try {
        const [pos, size, maximized, minimized] = await Promise.all([win.outerPosition(), win.innerSize(), win.isMaximized(), win.isMinimized()])
        if (minimized) return
        // fenêtre agrandie : on garde la taille normale enregistrée avant, seul l'état change
        if (maximized) {
          const prev = parseGeometry(localStorage.getItem(GEOMETRY_KEY))
          saveGeometry({ ...(prev ?? { x: pos.x, y: pos.y, width: size.width, height: size.height }), maximized: true })
        } else {
          saveGeometry({ x: pos.x, y: pos.y, width: size.width, height: size.height, maximized: false })
        }
      } catch { /* fenêtre en cours de fermeture */ }
    }, 400)
  }
  const stops = await Promise.all([win.onMoved(save), win.onResized(save)])
  return () => {
    clearTimeout(timer)
    for (const stop of stops) stop()
  }
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia('(orientation: portrait)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** Vrai quand la fenêtre est plus haute que large. */
export function useIsPortrait(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia('(orientation: portrait)').matches)
}

/** Vrai quand la requête média est satisfaite (largeur de la fenêtre, par exemple). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}
