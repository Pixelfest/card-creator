import { describe, expect, it } from 'vitest'
import {
  columnWidthsTwips,
  docxFileName,
  expandCopies,
  gridGeometry,
  mmToEmu,
  mmToPx96,
  mmToTwips,
  pageCount,
  pageMarginsTwips,
  paginate,
  rowHeightsTwips,
} from './layout'

describe('unit conversions', () => {
  it('converts mm to unrounded px at 96 dpi, which docx turns into exact EMU', () => {
    expect(mmToPx96(25.4)).toBe(96)
    expect(mmToPx96(44)).toBeCloseTo(166.299, 3)
    expect(Number.isInteger(mmToPx96(44))).toBe(false)
    // docx computes EMU as round(px × 9525).
    expect(Math.round(mmToPx96(44) * 9525)).toBe(1584000)
    expect(Math.round(mmToPx96(72) * 9525)).toBe(2592000)
  })

  it('converts mm to twips, rounding up', () => {
    expect(mmToTwips(25.4)).toBe(1440)
    expect(mmToTwips(44)).toBe(2495) // 2494.49
    expect(mmToTwips(72)).toBe(4082) // 4081.89
    expect(mmToTwips(4)).toBe(227) // 226.77
    expect(mmToTwips(0)).toBe(0)
  })

  it('converts mm to EMU', () => {
    expect(mmToEmu(44)).toBe(1584000)
    expect(mmToEmu(72)).toBe(2592000)
  })
})

describe('grid', () => {
  it('is 4 × 3 cards with 4 mm gaps, centred on A4', () => {
    expect(gridGeometry()).toEqual({ width: 188, height: 224, marginX: 11, marginY: 36.5 })
  })

  it('has card and gap columns alternating', () => {
    expect(columnWidthsTwips()).toEqual([2495, 227, 2495, 227, 2495, 227, 2495])
    expect(rowHeightsTwips()).toEqual([4082, 227, 4082, 227, 4082])
  })

  it('centres the grid with page margins in twips (about 11 mm and 36.5 mm)', () => {
    // Width 10661 of 11906, height 12700 of 16838.
    expect(pageMarginsTwips()).toEqual({ top: 2069, left: 622 })
  })
})

describe('expandCopies', () => {
  const a = { id: 'a', copies: 2 }
  const b = { id: 'b', copies: 0 }
  const c = { id: 'c', copies: 3 }

  it('keeps card-list order with each Card’s Copies consecutive, skipping Copies 0', () => {
    expect(expandCopies([a, b, c]).map((x) => x.id)).toEqual(['a', 'a', 'c', 'c', 'c'])
  })

  it('returns the same object for every Copy, so its image is shared', () => {
    const [first, second] = expandCopies([a])
    expect(first).toBe(second)
  })

  it('leaves out Cards that are not selected', () => {
    expect(expandCopies([a, b, c], new Set(['c', 'b'])).map((x) => x.id)).toEqual(['c', 'c', 'c'])
  })

  it('is empty without Cards', () => {
    expect(expandCopies([])).toEqual([])
  })
})

describe('paginate', () => {
  it('puts 12 on a page with the rest on the last page', () => {
    const pages = paginate(Array.from({ length: 30 }, (_, i) => i))
    expect(pages.map((p) => p.length)).toEqual([12, 12, 6])
    expect(pages[1][0]).toBe(12)
  })

  it('fills exactly whole pages', () => {
    expect(paginate(Array.from({ length: 24 }, (_, i) => i)).map((p) => p.length)).toEqual([12, 12])
  })

  it('has no pages without cards', () => {
    expect(paginate([])).toEqual([])
  })

  it('counts pages', () => {
    expect([0, 1, 12, 13, 24, 25].map(pageCount)).toEqual([0, 1, 1, 2, 2, 3])
  })
})

describe('docxFileName', () => {
  it('uses the Set name', () => {
    expect(docxFileName('Dragon Deck')).toBe('Dragon Deck.docx')
  })

  it('replaces characters that are invalid in file names', () => {
    expect(docxFileName('A/B\\C:D*E?F"G<H>I|J')).toBe('A_B_C_D_E_F_G_H_I_J.docx')
    expect(docxFileName('tab\there')).toBe('tab_here.docx')
  })

  it('drops trailing dots and spaces and guards reserved names', () => {
    expect(docxFileName('Deck... ')).toBe('Deck.docx')
    expect(docxFileName('CON')).toBe('_CON.docx')
  })

  it('falls back when nothing is left', () => {
    expect(docxFileName('   ')).toBe('cards.docx')
    expect(docxFileName('...')).toBe('cards.docx')
  })

  it('keeps Unicode', () => {
    expect(docxFileName('Draken & Ridders 🐉')).toBe('Draken & Ridders 🐉.docx')
  })
})
