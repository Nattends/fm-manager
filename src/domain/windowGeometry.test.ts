import { describe, expect, it } from 'vitest'
import { isReachable, parseGeometry } from './windowGeometry'

const main = { x: 0, y: 0, width: 2560, height: 1440 }
const vertical = { x: 2560, y: -240, width: 1080, height: 1920 }

describe('géométrie de la fenêtre', () => {
  it('relit une géométrie enregistrée', () => {
    expect(parseGeometry('{"x":2560,"y":-240,"width":1080,"height":930,"maximized":false}'))
      .toEqual({ x: 2560, y: -240, width: 1080, height: 930, maximized: false })
    expect(parseGeometry(null)).toBeNull()
    expect(parseGeometry('pas du json')).toBeNull()
    expect(parseGeometry('{"x":0,"y":0,"width":50,"height":900}')).toBeNull()
  })

  it('refuse une fenêtre sur un écran débranché', () => {
    const onVertical = { x: 2560, y: -240, width: 1080, height: 930, maximized: false }
    expect(isReachable(onVertical, [main, vertical])).toBe(true)
    expect(isReachable(onVertical, [main])).toBe(false)
    // barre de titre au-dessus de l'écran
    expect(isReachable({ x: 100, y: -500, width: 800, height: 600, maximized: false }, [main])).toBe(false)
  })
})
