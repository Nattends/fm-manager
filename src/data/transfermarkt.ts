import { invoke } from '@tauri-apps/api/core'
import { pickCandidate, type PhotoCandidate } from '../domain/photoMatch'
import type { Player } from '../domain/types'

const SEARCH_URL = 'https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query='

/** Téléchargement via le backend Rust (le webview est bloqué par le CORS). */
async function get(url: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>('transfermarkt_get', { url })
}

/** Lit le tableau « Search results for players » de la page de recherche. */
export function parseSearchResults(html: string): PhotoCandidate[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const box = [...doc.querySelectorAll('.box')].find((b) =>
    b.querySelector('h2')?.textContent?.trim().startsWith('Search results for players'),
  )
  if (!box) return []
  return [...box.querySelectorAll('table.items > tbody > tr')].flatMap((row) => {
    const cells = row.querySelectorAll(':scope > td')
    const name = row.querySelector('td.hauptlink a')?.getAttribute('title')?.trim()
    if (!name || cells.length < 5) return []
    const img = row.querySelector('img.bilderrahmen-fixed')?.getAttribute('src') ?? ''
    const age = Number.parseInt(cells[3].textContent ?? '', 10)
    return [{
      name,
      age: Number.isFinite(age) ? age : null,
      nationalities: [...cells[4].querySelectorAll('img.flaggenrahmen')].map((f) => f.getAttribute('title') ?? ''),
      photoUrl: img.includes('/portrait/') && !img.includes('default') ? img : null,
    }]
  })
}

function toDataUrl(bytes: ArrayBuffer, url: string): string {
  const mime = /\.png(\?|$)/i.test(url) ? 'image/png' : 'image/jpeg'
  const arr = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < arr.length; i += 0x8000) {
    binary += String.fromCharCode(...arr.subarray(i, i + 0x8000))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

/**
 * Cherche la photo du joueur sur Transfermarkt. Renvoie null si aucun joueur réel ne
 * correspond ou s'il n'a pas de photo ; lève une erreur si le site est injoignable.
 */
export async function findTransfermarktPhoto(player: Pick<Player, 'name' | 'age' | 'nationality'>): Promise<string | null> {
  const html = new TextDecoder().decode(await get(SEARCH_URL + encodeURIComponent(player.name.trim())))
  const match = pickCandidate(player, parseSearchResults(html))
  if (!match?.photoUrl) return null
  // Plus grande version de la même photo ; repli sur la petite si elle n'existe pas.
  const large = match.photoUrl.replace('/portrait/small/', '/portrait/header/')
  try {
    return toDataUrl(await get(large), large)
  } catch {
    return toDataUrl(await get(match.photoUrl), match.photoUrl)
  }
}
