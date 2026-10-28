/**
 * Algorithme hongrois (Kuhn-Munkres), O(n²m).
 * Minimise le coût total d'affectation pour une matrice n×m avec n ≤ m.
 * Retourne pour chaque ligne l'indice de colonne affecté.
 */
export function hungarianMin(cost: number[][]): number[] {
  const n = cost.length
  if (n === 0) return []
  const m = cost[0].length
  if (m < n) throw new Error('hungarianMin: il faut au moins autant de colonnes que de lignes')

  const INF = Number.POSITIVE_INFINITY
  const u = new Array<number>(n + 1).fill(0)
  const v = new Array<number>(m + 1).fill(0)
  const p = new Array<number>(m + 1).fill(0) // p[j] = ligne affectée à la colonne j (1-indexé)
  const way = new Array<number>(m + 1).fill(0)

  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(m + 1).fill(INF)
    const used = new Array<boolean>(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = INF
      let j1 = 0
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0 !== 0)
  }

  const result = new Array<number>(n).fill(-1)
  for (let j = 1; j <= m; j++) {
    if (p[j] !== 0) result[p[j] - 1] = j - 1
  }
  return result
}

/** Variante maximisation (scores ≥ 0). */
export function hungarianMax(score: number[][]): number[] {
  let max = 0
  for (const row of score) for (const s of row) if (s > max) max = s
  return hungarianMin(score.map((row) => row.map((s) => max - s)))
}
