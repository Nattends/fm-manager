import type { Bitmap } from './bitmap'

/** Colonnes « or » par étoile pleine dans la vue Effectif (échelle 100 %) : 5 étoiles = 41 colonnes, 0,5 étoile = 5. */
const GOLD_COLUMNS_PER_STAR = 8

/** Une étoile blanche (potentiel maximal, pas encore atteint) occupe environ 18 colonnes : seuil prudent. */
const WHITE_STAR_MIN_COLUMNS = 10

function isGold(r: number, g: number, b: number): boolean {
  return r > 200 && g > 150 && b < 90
}

function isWhite(r: number, g: number, b: number): boolean {
  return r > 190 && g > 190 && b > 190
}

/**
 * Nombre d'étoiles (0 à 5, par demi-étoile) dans une bande horizontale de la ligne centrée en `cy`.
 * Les étoiles pleines sont dorées, les vides sont grises ; une étoile blanche compte pour une étoile.
 */
export function readStars(bmp: Bitmap, x0: number, x1: number, cy: number): number {
  let gold = 0
  let white = 0
  for (let x = Math.max(0, x0); x < Math.min(bmp.width, x1); x++) {
    let goldPixels = 0
    let whitePixels = 0
    for (let y = Math.max(0, cy - 9); y <= Math.min(bmp.height - 1, cy + 9); y++) {
      const i = (y * bmp.width + x) * 4
      const r = bmp.data[i], g = bmp.data[i + 1], b = bmp.data[i + 2]
      if (isGold(r, g, b)) goldPixels++
      else if (isWhite(r, g, b)) whitePixels++
    }
    // plus de 2 pixels : on ignore les franges de lissage entre deux étoiles
    if (goldPixels > 2) gold++
    else if (whitePixels > 2) white++
  }
  let stars = gold > 0 ? Math.round(((gold - 1) / GOLD_COLUMNS_PER_STAR) * 2) / 2 : 0
  if (white >= WHITE_STAR_MIN_COLUMNS) stars += 1
  return Math.min(5, stars)
}
