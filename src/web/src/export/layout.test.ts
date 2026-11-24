import { describe, expect, it } from 'vitest'
import {
  BACK_BLEED_MM,
  backRectMm,
  backsTurned,
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

describe('double-sided layout', () => {
  it('puts cards 4 mm apart and keeps the Backs inside the margins: 5 × 2 landscape at 44 mm', () => {
    expect(printLayout(44, true)).toMatchObject({ gapMm: 4, columns: 5, rows: 2, perPage: 10, orientation: 'landscape' })
    expect(gridGeometry(printLayout(44, true))).toEqual({ width: 256, height: 156, marginX: 20.5, marginY: 27 })
  })

  it('keeps every Back inside the 5 mm minimum margins', () => {
    for (let width = 25; width <= 120; width += 0.5) {
      const layout = printLayout(width, true)
      expect(layout.perPage).toBeGreaterThan(0)
      for (let slot = 0; slot < layout.perPage; slot++) {
        const back = backRectMm(layout, slot)
        expect(back.x).toBeGreaterThanOrEqual(5 - 1e-9)
        expect(back.y).toBeGreaterThanOrEqual(5 - 1e-9)
        expect(back.x + back.width).toBeLessThanOrEqual(layout.pageMm.width - 5 + 1e-9)
        expect(back.y + back.height).toBeLessThanOrEqual(layout.pageMm.height - 5 + 1e-9)
      }
    }
  })
})

describe('Backs', () => {
  const portrait = printLayout(30, true)
  const landscape = printLayout(44, true)

  it('reach 2 mm past the front’s cut line on every side', () => {
    expect(BACK_BLEED_MM).toBe(4)
    const back = backRectMm(landscape, 0)
    expect({ width: back.width, height: back.height }).toEqual({ width: 52, height: 80 })
  })

  it('never overlap a neighbouring Back', () => {
    for (const layout of [portrait, landscape]) {
      const rects = Array.from({ length: layout.perPage }, (_, slot) => backRectMm(layout, slot))
      for (const [i, a] of rects.entries())
        for (const b of rects.slice(i + 1)) {
          const apart =
            a.x + a.width <= b.x + 1e-9 || b.x + b.width <= a.x + 1e-9 || a.y + a.height <= b.y + 1e-9 || b.y + b.height <= a.y + 1e-9
          expect(apart).toBe(true)
        }
    }
  })

  it('sit in the mirrored column of the same row in portrait', () => {
    expect(portrait.orientation).toBe('portrait')
    const last = portrait.columns - 1
    expect(backRectMm(portrait, 0)).toMatchObject({ x: slotOriginMm(portrait, last).x - 2, y: slotOriginMm(portrait, last).y - 2 })
  })

  it('sit in the mirrored row of the same column in landscape', () => {
    // Slot 0 is top-left on the front, so its Back is bottom-left on the back page.
    expect(backRectMm(landscape, 0)).toEqual({ x: 18.5, y: 105, width: 52, height: 80 })
    expect(backRectMm(landscape, 7)).toMatchObject({ x: slotOriginMm(landscape, 2).x - 2, y: slotOriginMm(landscape, 2).y - 2 })
  })

  it('flip on the long edge by default', () => {
    expect(portrait.flipEdge).toBe('long')
    expect(landscape.flipEdge).toBe('long')
  })

  it('are turned 180° only when the sheet turns top to bottom', () => {
    expect(backsTurned(portrait)).toBe(false)
    expect(backsTurned(landscape)).toBe(true)
    expect(backsTurned(printLayout(30, true, 'short'))).toBe(true)
    expect(backsTurned(printLayout(44, true, 'short'))).toBe(false)
  })

  it('sit in the mirrored row in portrait and the mirrored column in landscape on a short-edge flip', () => {
    const shortPortrait = printLayout(30, true, 'short')
    const shortLandscape = printLayout(44, true, 'short')
    const lastRow = (shortPortrait.rows - 1) * shortPortrait.columns
    expect(backRectMm(shortPortrait, 0)).toMatchObject({ x: slotOriginMm(shortPortrait, lastRow).x - 2, y: slotOriginMm(shortPortrait, lastRow).y - 2 })
    expect(backRectMm(shortLandscape, 0)).toMatchObject({ x: slotOriginMm(shortLandscape, 4).x - 2, y: slotOriginMm(shortLandscape, 4).y - 2 })
  })

  it('line up with their front when the sheet is turned over either edge', () => {
    const layouts = [standard, portrait, printLayout(57), landscape].flatMap((l) => [
      l,
      printLayout(l.cardMm.width, l.doubleSided, 'short'),
    ])
    for (const layout of layouts) {
      for (let slot = 0; slot < layout.perPage; slot++) {
        const front = slotOriginMm(layout, slot)
        const back = backRectMm(layout, slot)
        const frontCentre = { x: front.x + layout.printMm.width / 2, y: front.y + layout.printMm.height / 2 }
        const backCentre = { x: back.x + back.width / 2, y: back.y + back.height / 2 }
        // Turned side to side x mirrors, top to bottom y mirrors. The centres must coincide.
        const sideways = (layout.orientation === 'portrait') === (layout.flipEdge === 'long')
        if (sideways) {
          expect(layout.pageMm.width - backCentre.x).toBeCloseTo(frontCentre.x, 9)
          expect(backCentre.y).toBeCloseTo(frontCentre.y, 9)
        } else {
          expect(backCentre.x).toBeCloseTo(frontCentre.x, 9)
          expect(layout.pageMm.height - backCentre.y).toBeCloseTo(frontCentre.y, 9)
        }
      }
    }
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
