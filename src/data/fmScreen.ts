import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { Bitmap } from '../domain/screen/bitmap'
import type { OcrWord } from '../domain/screen/identity'

/** Capture de la fenêtre de FM27 faite par le programme (raccourci global). */
export interface ScreenCapture {
  png: string
  width: number
  height: number
  words: OcrWord[]
}

/** Raccourci qui déclenche une capture pendant que la boîte d'import est ouverte. */
export const CAPTURE_SHORTCUT_LABEL = 'Ctrl+Shift+F'

/** OCR Windows d'une image PNG (base64) : mots et rectangles. */
export function ocrPng(pngBase64: string): Promise<OcrWord[]> {
  return invoke<OcrWord[]>('fm_ocr', { pngBase64 })
}

/** Active ou désactive le raccourci global de capture. */
export function setCaptureHotkey(enabled: boolean): Promise<void> {
  return invoke('fm_hotkey', { enabled })
}

/** Écoute les captures (et les erreurs) déclenchées par le raccourci. */
export async function onScreenCapture(onCapture: (c: ScreenCapture) => void, onError: (message: string) => void): Promise<UnlistenFn> {
  const a = await listen<ScreenCapture>('fm-capture', (e) => onCapture(e.payload))
  const b = await listen<string>('fm-capture-error', (e) => onError(e.payload))
  return () => {
    a()
    b()
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(s)
}

/** Décode un PNG (base64) en pixels RGBA, sans conversion de couleur. */
export async function decodePng(pngBase64: string): Promise<Bitmap> {
  const bytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0))
  const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { colorSpaceConversion: 'none' })
  const canvas = new OffscreenCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponible')
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, image.width, image.height)
  image.close()
  return { width: data.width, height: data.height, data: data.data }
}
