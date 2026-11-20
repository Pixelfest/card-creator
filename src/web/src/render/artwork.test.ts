import { describe, expect, it } from 'vitest'
import {
  artworkRect,
  clampZoom,
  coverPlacement,
  coverScale,
  coversCard,
  MAX_ZOOM,
  MIN_ZOOM,
  pan,
  toCardUnits,
  wheelFactor,
  withZoom,
  zoomAt,
  type ArtworkRef,
} from './artwork'

const landscape = coverPlacement({ id: 'a', width: 2000, height: 1000 })
const portrait = coverPlacement({ id: 'b', width: 1000, height: 3000 })

const close = (actual: object, expected: Record<string, number>) => {
  for (const key of Object.keys(expected)) expect((actual as Record<string, number>)[key]).toBeCloseTo(expected[key], 6)
}

describe('cover', () => {
  it('scales a wide image to the Card height and centres it', () => {
    expect(coverScale(2000, 1000)).toBeCloseTo(0.85) // 850 / 1000
    close(artworkRect(landscape), { x: (520 - 1700) / 2, y: 0, width: 1700, height: 850 })
    expect(coversCard(landscape)).toBe(true)
  })

  it('scales a tall image to the Card width', () => {
    expect(coverScale(1000, 3000)).toBeCloseTo(0.52)
    close(artworkRect(portrait), { x: 0, y: (850 - 1560) / 2, width: 520, height: 1560 })
  })

  it('works for an image smaller than the Card (scaled up)', () => {
    const small = coverPlacement({ id: 'c', width: 52, height: 85 })
    close(artworkRect(small), { x: 0, y: 0, width: 520, height: 850 })
  })
})

describe('pan and zoom', () => {
  it('pans in card units', () => {
    close(artworkRect(pan(landscape, 30, -10)), { x: (520 - 1700) / 2 + 30, y: -10 })
  })

  it('zooming out leaves Card uncovered, where the fill colour shows', () => {
    expect(coversCard(withZoom(landscape, 0.5))).toBe(false)
  })

  it('the wheel zooms the part under the pointer: that point stays put', () => {
    const at = { x: 100, y: 200 }
    const before = artworkRect(landscape)
    // The image point under the pointer, as a fraction of the image.
    const u = (at.x - before.x) / before.width
    const v = (at.y - before.y) / before.height

    const after = artworkRect(zoomAt(landscape, 1.5, at))

    expect(after.x + u * after.width).toBeCloseTo(at.x)
    expect(after.y + v * after.height).toBeCloseTo(at.y)
    expect(after.width).toBeCloseTo(before.width * 1.5)
  })

  it('the slider zooms about the Card centre', () => {
    const zoomed = withZoom(landscape, 2)
    expect(zoomed.zoom).toBe(2)
    close(zoomed, { x: 0, y: 0 })
  })

  it(`clamps zoom to ${MIN_ZOOM}–${MAX_ZOOM} and keeps the anchor honest when clamped`, () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(100)).toBe(MAX_ZOOM)
    const maxed: ArtworkRef = { ...landscape, zoom: MAX_ZOOM }
    expect(zoomAt(maxed, 2, { x: 10, y: 10 })).toEqual(maxed)
  })

  it('Reset to cover restores the initial fit', () => {
    const moved = zoomAt(pan(landscape, 50, 50), 2.3, { x: 0, y: 0 })
    expect(coverPlacement(moved)).toEqual(landscape)
  })

  it('wheel up zooms in, wheel down zooms out, and they cancel out', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1)
    expect(wheelFactor(100)).toBeLessThan(1)
    expect(wheelFactor(-100) * wheelFactor(100)).toBeCloseTo(1)
  })

  it('converts preview CSS pixels to card units', () => {
    expect(toCardUnits({ x: 130, y: 212.5 }, 260)).toEqual({ x: 260, y: 425 })
  })
})
