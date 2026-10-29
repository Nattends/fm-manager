/** Image RGBA (même disposition que `ImageData`) : indépendante du navigateur pour rester testable. */
export interface Bitmap {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Rectangle en pixels : [x0, y0, x1, y1[ */
export type Region = readonly [x0: number, y0: number, x1: number, y1: number]

/** Boîte englobante d'une tache de pixels clairs (un chiffre, ou une lettre). */
export interface Blob {
  x: number
  y: number
  w: number
  h: number
}

/** Luminosité d'un pixel (0-255) : le plus grand des canaux, pour traiter pareil le jaune, le vert et le blanc. */
export function brightness(bmp: Bitmap, x: number, y: number): number {
  const i = (y * bmp.width + x) * 4
  return Math.max(bmp.data[i], bmp.data[i + 1], bmp.data[i + 2])
}

/** Taches de pixels clairs (8-connexité) dans une zone, triées de haut en bas puis de gauche à droite. */
export function findBlobs(bmp: Bitmap, region: Region, threshold = 110): Blob[] {
  const x0 = Math.max(0, Math.round(region[0]))
  const y0 = Math.max(0, Math.round(region[1]))
  const x1 = Math.min(bmp.width, Math.round(region[2]))
  const y1 = Math.min(bmp.height, Math.round(region[3]))
  const w = x1 - x0
  const h = y1 - y0
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (brightness(bmp, x + x0, y + y0) > threshold) mask[y * w + x] = 1
  }
  const blobs: Blob[] = []
  const stack: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1) continue
    let minX = w, maxX = 0, minY = h, maxY = 0
    mask[start] = 2
    stack.push(start)
    while (stack.length) {
      const p = stack.pop() as number
      const px = p % w
      const py = (p - px) / w
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx
          if (nx < 0 || nx >= w) continue
          const q = ny * w + nx
          if (mask[q] === 1) {
            mask[q] = 2
            stack.push(q)
          }
        }
      }
    }
    blobs.push({ x: minX + x0, y: minY + y0, w: maxX - minX + 1, h: maxY - minY + 1 })
  }
  return blobs.sort((a, b) => a.y - b.y || a.x - b.x)
}
