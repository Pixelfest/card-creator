import { describe, expect, it } from 'vitest'
import {
  BACK_BLEED_MM,
  backRectMm,
  flipEdge,
  isDoubleSided,
  exportFileName,
  expandCopies,
  gridGeometry,
  pageCount,
  paginate,
  parseCardWidth,
  printLayout,
  slotOriginMm,
} from './layout'

const standard = printLayout()

describe('printLayout', () => {
  it('defaults to 44 × 72 mm Cards, 4 × 3 on A4 portrait', () => {
    expect(standard).toMatchObject({
      cardMm: { width: 44, height: 72 },
      printMm: { width: 48, height: 76 },
      columns: 4,
      rows: 3,
      perPage: 12,
      orientation: 'portrait',
      pageMm: { width: 210, height: 297 },
    })
  })

  it('keeps the Card Format ratio', () => {
    expect(printLayout(88).cardMm).toEqual({ width: 88, height: 144 })
  })

  it('turns the page to landscape when more cards fit that way', () => {
    // 61 mm printed: 3 × 2 portrait, 4 × 2 landscape.
    expect(printLayout(57)).toMatchObject({ columns: 4, rows: 2, perPage: 8, orientation: 'landscape' })
    expect(printLayout(57).pageMm).toEqual({ width: 297, height: 210 })
  })

  it('stays portrait on a tie', () => {
    // 67.5 mm printed: 2 × 2 either way.
    expect(printLayout(63.5)).toMatchObject({ columns: 2, rows: 2, orientation: 'portrait' })
  })

  it('fits more small cards', () => {
    expect(printLayout(30)).toMatchObject({ columns: 5, rows: 5, perPage: 25, orientation: 'portrait' })
  })

  it('fits at least one card at the largest width', () => {
    expect(printLayout(120).perPage).toBe(1)
  })

  it('keeps every grid inside the 5 mm minimum margins', () => {
    for (let width = 25; width <= 120; width += 0.5) {
      const layout = printLayout(width)
      const { marginX, marginY } = gridGeometry(layout)
      expect(layout.perPage).toBeGreaterThan(0)
      expect(marginX).toBeGreaterThanOrEqual(5 - 1e-9)
      expect(marginY).toBeGreaterThanOrEqual(5 - 1e-9)
    }
  })
})

describe('parseCardWidth', () => {
  it('accepts widths from 25 to 120 mm, with a comma as decimal separator too', () => {
    expect(parseCardWidth('44')).toBe(44)
    expect(parseCardWidth(' 63,5 ')).toBe(63.5)
    expect(parseCardWidth('25')).toBe(25)
    expect(parseCardWidth('120')).toBe(120)
  })

  it('refuses anything else', () => {
    expect(['', 'abc', '24.9', '120.1', 'Infinity'].map(parseCardWidth)).toEqual(Array(5).fill(undefined))
  })
})

describe('grid', () => {
  it('is 4 × 3 printed cards of 48 × 76 mm (card plus 2 mm cut border) with 2 mm gaps, centred on A4', () => {
    expect(gridGeometry(standard)).toEqual({ width: 198, height: 232, marginX: 6, marginY: 32.5 })
  })

  it('places slots row by row, 50 mm apart across and 78 mm down', () => {
    expect(slotOriginMm(standard, 0)).toEqual({ x: 6, y: 32.5 })
    expect(slotOriginMm(standard, 3)).toEqual({ x: 156, y: 32.5 })
    expect(slotOriginMm(standard, 4)).toEqual({ x: 6, y: 110.5 })
    expect(slotOriginMm(standard, 11)).toEqual({ x: 156, y: 188.5 })
  })

  it('centres a landscape grid on the turned page', () => {
    const layout = printLayout(57)
    expect(layout.pageMm).toEqual({ width: 297, height: 210 })
    const { width, marginX, marginY } = gridGeometry(layout)
    expect(width).toBe(250)
    expect(marginX).toBe(23.5)
    expect(marginY).toBeCloseTo(6.73, 2)
    // Slot 5 is the second column of the second row.
    const slot = slotOriginMm(layout, 5)
    expect(slot.x).toBe(86.5)
    expect(slot.y).toBeCloseTo(marginY + layout.printMm.height + 2, 9)
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
    const pages = paginate(Array.from({ length: 30 }, (_, i) => i), 12)
    expect(pages.map((p) => p.length)).toEqual([12, 12, 6])
    expect(pages[1][0]).toBe(12)
  })

  it('fills exactly whole pages', () => {
    expect(paginate(Array.from({ length: 24 }, (_, i) => i), 12).map((p) => p.length)).toEqual([12, 12])
  })

  it('uses the layout’s cards per page', () => {
    expect(paginate(Array.from({ length: 9 }, (_, i) => i), 4).map((p) => p.length)).toEqual([4, 4, 1])
  })

  it('has no pages without cards', () => {
    expect(paginate([], 12)).toEqual([])
  })

  it('counts pages', () => {
    expect([0, 1, 12, 13, 24, 25].map((n) => pageCount(n, 12))).toEqual([0, 1, 1, 2, 2, 3])
    expect(pageCount(9, 4)).toBe(3)
  })
})

describe('Backs', () => {
  it('bleed 2 mm past the Card, exactly filling the front slot', () => {
    expect(BACK_BLEED_MM).toBe(2)
    const back = backRectMm(standard, 0)
    expect({ width: back.width, height: back.height }).toEqual(standard.printMm)
  })

  it('sit in the mirrored column of the same row', () => {
    // Slot 0 is top-left on the front, so its Back is top-right on the back page.
    expect(backRectMm(standard, 0)).toEqual({ ...slotOriginMm(standard, 3), width: 48, height: 76 })
    expect(backRectMm(standard, 3)).toEqual({ ...slotOriginMm(standard, 0), width: 48, height: 76 })
    expect(backRectMm(standard, 5)).toEqual({ ...slotOriginMm(standard, 6), width: 48, height: 76 })
  })

  it('line up with their front when the sheet is turned over its vertical axis', () => {
    for (const layout of [standard, printLayout(57)]) {
      for (let slot = 0; slot < layout.perPage; slot++) {
        const front = slotOriginMm(layout, slot)
        const back = backRectMm(layout, slot)
        // Turned over, x becomes page width − x; the centres must coincide.
        expect(layout.pageMm.width - (back.x + back.width / 2)).toBeCloseTo(front.x + layout.printMm.width / 2, 9)
        expect(back.y + back.height / 2).toBeCloseTo(front.y + layout.printMm.height / 2, 9)
      }
    }
  })

  it('need flip on long edge in portrait and short edge in landscape', () => {
    expect(flipEdge(standard)).toBe('long')
    expect(flipEdge(printLayout(57))).toBe('short')
  })

  it('make the PDF double-sided only when a printed Card has a Back the library has', () => {
    const backs = [{ path: 'backs/navy.png' }]
    const card = (id: string, back: string | null, copies = 1) => ({ id, copies, design: { back } })
    expect(isDoubleSided([card('a', null), card('b', 'backs/navy.png')], backs)).toBe(true)
    expect(isDoubleSided([card('a', null), card('b', 'backs/navy.png', 0)], backs)).toBe(false)
    expect(isDoubleSided([card('a', null), card('b', 'backs/navy.png')], backs, new Set(['a']))).toBe(false)
    expect(isDoubleSided([card('a', 'backs/deleted.png')], backs)).toBe(false)
    expect(isDoubleSided([{ id: 'a', copies: 1, design: {} }], backs)).toBe(false)
    expect(isDoubleSided([card('b', 'backs/navy.png')], undefined)).toBe(false)
  })
})

describe('exportFileName', () => {
  it('uses the Set name', () => {
    expect(exportFileName('Dragon Deck')).toBe('Dragon Deck.pdf')
  })

  it('replaces characters that are invalid in file names', () => {
    expect(exportFileName('A/B\\C:D*E?F"G<H>I|J')).toBe('A_B_C_D_E_F_G_H_I_J.pdf')
    expect(exportFileName('tab\there')).toBe('tab_here.pdf')
  })

  it('drops trailing dots and spaces and guards reserved names', () => {
    expect(exportFileName('Deck... ')).toBe('Deck.pdf')
    expect(exportFileName('CON')).toBe('_CON.pdf')
  })

  it('falls back when nothing is left', () => {
    expect(exportFileName('   ')).toBe('cards.pdf')
    expect(exportFileName('...')).toBe('cards.pdf')
  })

  it('keeps Unicode', () => {
    expect(exportFileName('Draken & Ridders 🐉')).toBe('Draken & Ridders 🐉.pdf')
  })
})
