import { describe, expect, it } from 'vitest'
import { printImage } from './exportCard'

describe('printImage', () => {
  it('is 520×850 plus a 24 px cut border at the standard 44 mm', () => {
    expect(printImage()).toEqual({
      target: { width: 520, height: 850, scale: 1 },
      border: 24,
      width: 568,
      height: 898,
    })
  })

  it('scales up for larger Cards so they stay at 300 DPI, with the border still 2 mm', () => {
    const image = printImage(88)
    expect(image.target).toEqual({ width: 1040, height: 1700, scale: 2 })
    expect(image.border).toBe(24) // 2 mm at 1040 px per 88 mm
  })

  it('never renders smaller than 520×850, so small Cards print sharper', () => {
    const image = printImage(30)
    expect(image.target).toEqual({ width: 520, height: 850, scale: 1 })
    expect(image.border).toBe(35) // 2 mm at 520 px per 30 mm
  })
})
