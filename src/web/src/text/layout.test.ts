import { describe, expect, it } from 'vitest'
import type { Snippet } from '../editor/model'
import { newSnippet } from '../editor/snippets'
import { ptToUnits } from '../render/units'
import { hitsBox, layoutSnippet, LINE_HEIGHT, OUTLINE_SHARE, PADDING_X, PADDING_Y, type Measurer } from './layout'
import { graphemes } from './wrap'

/** Every grapheme is half an em wide; ascent 0.8, descent 0.2. */
const measurer: Measurer = {
  width: (text, _family, size) => graphemes(text).length * size * 0.5,
  metrics: () => ({ ascent: 0.8, descent: 0.2 }),
}

const snippet = (overrides: Partial<Snippet> = {}): Snippet => ({ ...newSnippet('textbox', null), ...overrides })

describe('the box model', () => {
  it('is centred, card width × zoom wide, around its vertical centre', () => {
    const layout = layoutSnippet(snippet({ text: 'Hi', zoom: 50, position: 50, size: 12 }), 'f', measurer)
    const size = ptToUnits(12)

    expect(layout.box.width).toBe(260)
    expect(layout.box.x).toBe(130)
    expect(layout.box.y + layout.box.height / 2).toBeCloseTo(425)
    // Height fits the text: one line plus padding above and below.
    expect(layout.box.height).toBeCloseTo(size * LINE_HEIGHT + size * PADDING_Y * 2)
  })

  it('aligns lines left, centre and right inside 8% padding', () => {
    const base = { text: 'Hi', zoom: 100, position: 50, size: 10 }
    const width = measurer.width('Hi', 'f', ptToUnits(10))
    const pad = 520 * PADDING_X

    expect(layoutSnippet(snippet({ ...base, align: 'left' }), 'f', measurer).lines[0].x).toBeCloseTo(pad)
    expect(layoutSnippet(snippet({ ...base, align: 'center' }), 'f', measurer).lines[0].x).toBeCloseTo((520 - width) / 2)
    expect(layoutSnippet(snippet({ ...base, align: 'right' }), 'f', measurer).lines[0].x).toBeCloseTo(520 - pad - width)
  })

  it('stacks lines 1.2 × the size apart, vertically centred in the box', () => {
    const layout = layoutSnippet(snippet({ text: 'one\ntwo\nthree', size: 10, position: 50 }), 'f', measurer)
    const size = layout.fontSize
    const [a, b, c] = layout.lines.map((l) => l.baseline)

    expect(b - a).toBeCloseTo(size * LINE_HEIGHT)
    expect(c - b).toBeCloseTo(size * LINE_HEIGHT)
    // The block's middle is the box's middle (baselines sit 0.3 em below each line's middle here).
    const middleOfBlock = (a + c) / 2 - ((0.8 - 0.2) * size) / 2
    expect(middleOfBlock).toBeCloseTo(layout.box.y + layout.box.height / 2)
  })

  it('wraps at the padded box width', () => {
    // Inner width: 520 × 0.5 × 0.84 = 218.4 units; at 10 pt a character is 20.8 units → 10 per line.
    const layout = layoutSnippet(snippet({ text: 'aaaa bbbb cccc', zoom: 50, size: 10, position: 50 }), 'f', measurer)
    expect(layout.lines.map((l) => l.text)).toEqual(['aaaa bbbb', 'cccc'])
  })

  it('has an automatic outline of about 12% of the size, only when on', () => {
    const on = layoutSnippet(snippet({ outline: true, size: 10 }), 'f', measurer)
    const off = layoutSnippet(snippet({ outline: false, size: 10 }), 'f', measurer)
    expect(on.outlineWidth).toBeCloseTo(ptToUnits(10) * OUTLINE_SHARE)
    expect(off.outlineWidth).toBe(0)
  })

  it('hit-tests its box', () => {
    const layout = layoutSnippet(snippet({ text: 'Hi', zoom: 50, position: 50 }), 'f', measurer)
    expect(hitsBox(layout, 260, 425)).toBe(true)
    expect(hitsBox(layout, 100, 425)).toBe(false)
  })
})

describe('auto-shrink', () => {
  it('leaves text that fits at its size', () => {
    const layout = layoutSnippet(snippet({ text: 'Short', size: 12 }), 'f', measurer)
    expect(layout.fontSize).toBeCloseTo(ptToUnits(12))
    expect(layout.shrunk).toBe(false)
    expect(layout.fits).toBe(true)
  })

  it('shrinks a word that is too wide until it fits', () => {
    // 6 characters at 36 pt are 450 units, wider than the 262-unit inner box; at ~57% they fit.
    const layout = layoutSnippet(snippet({ text: 'Dragon', size: 36, zoom: 60, position: 50 }), 'f', measurer)
    expect(layout.shrunk).toBe(true)
    expect(layout.fits).toBe(true)
    expect(layout.lines).toHaveLength(1)
    expect(layout.fontSize).toBeLessThan(ptToUnits(36))
    expect(layout.fontSize).toBeGreaterThanOrEqual(ptToUnits(36) * 0.5)
  })

  it('shrinks text that would run off the card (header near the top)', () => {
    const header = snippet({ text: 'Two\nlines', size: 12, position: 6, zoom: 80 })
    const layout = layoutSnippet(header, 'f', measurer)
    expect(layout.shrunk).toBe(true)
    expect(layout.fits).toBe(true)
    expect(layout.box.y).toBeGreaterThanOrEqual(-1e-6)
  })

  it('stops at 50% and reports that the text does not fit', () => {
    const essay = snippet({ text: Array(80).fill('word').join(' '), size: 20, position: 90, zoom: 50 })
    const layout = layoutSnippet(essay, 'f', measurer)
    expect(layout.fits).toBe(false)
    expect(layout.fontSize).toBeCloseTo(ptToUnits(20) * 0.5)
  })

  it('with a background, the box takes its proportions and the text must fit inside', () => {
    const layout = layoutSnippet(snippet({ text: 'Fits', zoom: 100, size: 10 }), 'f', measurer, 4)
    expect(layout.box.height).toBeCloseTo(520 / 4)
    const crowded = layoutSnippet(snippet({ text: 'a\nb\nc\nd\ne\nf\ng', zoom: 100, size: 20 }), 'f', measurer, 4)
    expect(crowded.box.height).toBeCloseTo(130)
    expect(crowded.fits).toBe(false)
  })
})
