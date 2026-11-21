import { describe, expect, it } from 'vitest'
import { cornerIconRects, cornerIconsOf, DEFAULT_CORNER_ICONS, type CornerIcons } from './cornerIcons'

const all: CornerIcons = { icon: 'icons/star.png', corners: ['bottomRight', 'topLeft', 'bottomLeft', 'topRight'], size: 10, insetY: 5, insetX: 4 }

describe('cornerIconRects', () => {
  it('sizes by width (a percentage of the card width), height following the aspect ratio', () => {
    const [first] = cornerIconRects(all, 2)
    expect(first.width).toBeCloseTo(52)
    expect(first.height).toBeCloseTo(26)
  })

  it('mirrors the offsets per corner and anchors each icon at its outer corner', () => {
    const rects = Object.fromEntries(cornerIconRects(all, 1).map((r) => [r.corner, r]))
    const w = 52
    const insetX = 20.8
    const insetY = 42.5
    expect(rects.topLeft).toMatchObject({ x: insetX, y: insetY })
    expect(rects.topRight.x).toBeCloseTo(520 - insetX - w)
    expect(rects.topRight.y).toBeCloseTo(insetY)
    expect(rects.bottomLeft.x).toBeCloseTo(insetX)
    expect(rects.bottomLeft.y).toBeCloseTo(850 - insetY - w)
    expect(rects.bottomRight.x).toBeCloseTo(520 - insetX - w)
    expect(rects.bottomRight.y).toBeCloseTo(850 - insetY - w)
  })

  it('keeps the distance to the edge when the size changes', () => {
    const small = cornerIconRects({ ...all, size: 4 }, 1).find((r) => r.corner === 'bottomRight')!
    const big = cornerIconRects({ ...all, size: 15 }, 1).find((r) => r.corner === 'bottomRight')!
    expect(520 - (small.x + small.width)).toBeCloseTo(520 - (big.x + big.width))
    expect(850 - (small.y + small.height)).toBeCloseTo(850 - (big.y + big.height))
  })

  it('draws only the ticked corners, in a fixed order', () => {
    expect(cornerIconRects({ ...all, corners: ['bottomRight', 'topLeft'] }, 1).map((r) => r.corner)).toEqual(['topLeft', 'bottomRight'])
    expect(cornerIconRects({ ...all, corners: [] }, 1)).toEqual([])
  })

  it('clamps size to 2–15% and offsets to 0–20%', () => {
    expect(cornerIconRects({ ...all, size: 99 }, 1)[0].width).toBeCloseTo(78)
    expect(cornerIconRects({ ...all, size: 0 }, 1)[0].width).toBeCloseTo(10.4)
    expect(cornerIconRects({ ...all, insetX: -5, insetY: -5 }, 1)[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('draws nothing for an image without a usable aspect ratio', () => {
    expect(cornerIconRects(all, 0)).toEqual([])
    expect(cornerIconRects(all, Number.NaN)).toEqual([])
  })
})

describe('cornerIconsOf', () => {
  it('gives an old Card (no field) the defaults: nothing drawn, 8% size, 4% offsets', () => {
    expect(cornerIconsOf({})).toBe(DEFAULT_CORNER_ICONS)
    expect(DEFAULT_CORNER_ICONS).toEqual({ icon: null, corners: [], size: 8, insetY: 4, insetX: 4 })
  })
})
