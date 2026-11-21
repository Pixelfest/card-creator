import { describe, expect, it } from 'vitest'
import { CARD_HEIGHT, CARD_WIDTH, CUT_BORDER_PX, EXPORT_TARGET, fitCard, previewTarget, ptToUnits } from './units'

describe('card units', () => {
  it('are the 300 DPI size of 44×72 mm, rounded to whole pixels', () => {
    expect((44 / 25.4) * 300).toBeCloseTo(519.7, 1)
    expect((72 / 25.4) * 300).toBeCloseTo(850.4, 1)
    expect([CARD_WIDTH, CARD_HEIGHT]).toEqual([520, 850])
  })

  it('give a 2 mm cut border of 24 px at 300 DPI', () => {
    expect((2 / 25.4) * 300).toBeCloseTo(23.6, 1)
    expect(CUT_BORDER_PX).toBe(24)
  })

  it('convert points at 300 DPI', () => {
    expect(ptToUnits(72)).toBe(300)
    expect(ptToUnits(9)).toBeCloseTo(37.5)
  })
})

describe('render targets', () => {
  it('export at exactly 520×850, scale 1, whatever the screen', () => {
    expect(EXPORT_TARGET).toEqual({ width: 520, height: 850, scale: 1 })
  })

  it('preview at cssSize × devicePixelRatio', () => {
    expect(previewTarget(260, 1)).toEqual({ width: 260, height: 425, scale: 0.5 })
    expect(previewTarget(260, 2)).toEqual({ width: 520, height: 850, scale: 1 })
    const zoomed = previewTarget(300, 1.25)
    expect(zoomed.width).toBe(375)
    expect(zoomed.scale).toBeCloseTo(375 / 520)
    expect(zoomed.height).toBe(Math.round(850 * (375 / 520)))
  })

  it('treat a missing devicePixelRatio as 1', () => {
    expect(previewTarget(260, 0)).toEqual(previewTarget(260, 1))
  })
})

describe('fitCard', () => {
  it('fits the height in a wide box and the width in a tall one, keeping 44:72', () => {
    const wide = fitCard(1000, 850)
    expect(wide.width).toBeCloseTo(520)
    expect(wide.height).toBeCloseTo(850)
    const tall = fitCard(260, 1000)
    expect(tall.width).toBeCloseTo(260)
    expect(tall.height).toBeCloseTo(425)
  })
})
