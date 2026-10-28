import {
  LogicalSize, PhysicalPosition, PhysicalSize, availableMonitors, currentMonitor, getCurrentWindow, primaryMonitor,
  type Monitor,
} from '@tauri-apps/api/window'
import { useSyncExternalStore } from 'react'

/** Taille de fenêtre : standard (écran principal) ou portrait 1080×1920 (écran secondaire vertical). */
export type WindowMode = 'standard' | 'portrait'

/** Fenêtre standard : 1500 de large, hauteur réglable entre 950 et 1300 (comme dans tauri.conf.json). */
export const STANDARD_SIZE = { width: 1500, height: 950 }
export const STANDARD_MAX_HEIGHT = 1300
export const PORTRAIT_SIZE = { width: 1080, height: 1920 }
const MODE_KEY = 'window.mode'

export function loadWindowMode(): WindowMode {
  try { return localStorage.getItem(MODE_KEY) === 'portrait' ? 'portrait' : 'standard' } catch { return 'standard' }
}

function saveWindowMode(mode: WindowMode) {
  try { localStorage.setItem(MODE_KEY, mode) } catch { /* ignoré */ }
}

const LOCK_KEY = 'window.sizeLocked'

/** Taille verrouillée (par défaut) : en mode standard, 1500 de large et 950 à 1300 de haut, pas d'agrandissement. */
export function loadSizeLock(): boolean {
  try { return localStorage.getItem(LOCK_KEY) !== '0' } catch { return true }
}

/** Applique les limites du mode standard selon le verrouillage (sans effet en mode portrait). */
async function applyStandardLimits(locked: boolean) {
  const win = getCurrentWindow()
  await win.setResizable(true)
  if (locked) {
    await win.unmaximize()
    await win.setMaximizable(false)
    await win.setMinSize(new LogicalSize(STANDARD_SIZE.width, STANDARD_SIZE.height))
    await win.setMaxSize(new LogicalSize(STANDARD_SIZE.width, STANDARD_MAX_HEIGHT))
  } else {
    await win.setMinSize(null)
    await win.setMaxSize(null)
    await win.setMaximizable(true)
  }
}

/** Verrouille ou libère la taille de la fenêtre ; libérée, elle peut être agrandie en plein écran. */
export async function setSizeLock(locked: boolean): Promise<void> {
  try { localStorage.setItem(LOCK_KEY, locked ? '1' : '0') } catch { /* ignoré */ }
  if (loadWindowMode() !== 'standard') return
  await applyStandardLimits(locked)
  // En reverrouillant, on revient à la taille standard (la fenêtre pouvait être bien plus grande).
  if (locked) await placeStandard()
}

/** Taille des bordures et de la barre de titre (différence entre taille extérieure et intérieure). */
async function frameSize() {
  const win = getCurrentWindow()
  const [outer, inner] = await Promise.all([win.outerSize(), win.innerSize()])
  return { width: outer.width - inner.width, height: outer.height - inner.height }
}

/** Centre la fenêtre (taille intérieure donnée, en pixels physiques) dans la zone utile d'un écran. */
async function placeOn(monitor: Monitor, inner: { width: number; height: number }) {
  const win = getCurrentWindow()
  const area = monitor.workArea
  // On déplace d'abord la fenêtre sur l'écran visé : elle prend son facteur d'échelle avant d'être redimensionnée.
  await win.setPosition(new PhysicalPosition(area.position.x, area.position.y))
  const frame = await frameSize()
  const width = Math.min(inner.width, area.size.width - frame.width)
  const height = Math.min(inner.height, area.size.height - frame.height)
  await win.setSize(new PhysicalSize(width, height))
  const x = area.position.x + Math.max(0, Math.round((area.size.width - width - frame.width) / 2))
  const y = area.position.y + Math.max(0, Math.round((area.size.height - height - frame.height) / 2))
  await win.setPosition(new PhysicalPosition(x, y))
}

/**
 * Applique un mode de fenêtre. Le mode portrait cherche un écran vertical (plus haut que large) ;
 * s'il n'y en a pas, il utilise l'écran courant. La fenêtre est ensuite ajustée à la zone utile de l'écran.
 */
export async function applyWindowMode(mode: WindowMode): Promise<void> {
  saveWindowMode(mode)
  const win = getCurrentWindow()
  // Les limites de taille du mode standard empêcheraient le passage en 1080×1920 : on les lève d'abord.
  await win.setMinSize(null)
  await win.setMaxSize(null)
  if (mode === 'standard') {
    await win.setResizable(true)
    await win.setMaximizable(true)
    await win.unmaximize()
    try {
      await placeStandard()
    } finally {
      await applyStandardLimits(loadSizeLock())
    }
    return
  }
  const monitors = await availableMonitors()
  const monitor = monitors.find((m) => m.size.height > m.size.width) ?? (await currentMonitor())
  if (!monitor) return
  // 1080×1920 pixels réels : l'écran vertical entier (moins la barre de titre et la barre des tâches).
  await win.unmaximize()
  await placeOn(monitor, PORTRAIT_SIZE)
  await win.setMaximizable(false)
  await win.setResizable(false)
}

/** Taille standard (1500×950), centrée sur l'écran principal. */
async function placeStandard() {
  const monitor = (await primaryMonitor()) ?? (await currentMonitor())
  if (!monitor) {
    await getCurrentWindow().setSize(new LogicalSize(STANDARD_SIZE.width, STANDARD_SIZE.height))
    return
  }
  const s = monitor.scaleFactor
  await placeOn(monitor, { width: Math.round(STANDARD_SIZE.width * s), height: Math.round(STANDARD_SIZE.height * s) })
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia('(orientation: portrait)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** Vrai quand la fenêtre est plus haute que large (mode portrait). */
export function useIsPortrait(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia('(orientation: portrait)').matches)
}
