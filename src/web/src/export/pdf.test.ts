/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { printLayout } from './layout'
import { buildPdf, hexToRgb, mmToPt } from './pdf'

// A valid 1×1 PNG; two that differ in one byte of pixel data (and so in their CRC).
const PNG_A = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)
const PNG_B = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

async function load(images: Uint8Array[]) {
  const pdf = await PDFDocument.load(await buildPdf(images.map((png) => ({ png, text: [] }))))
  // The distinct images the pages draw (an image's alpha mask is not counted).
  const drawn = new Set(
    pdf.getPages().flatMap((page) => {
      const xObjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
      return xObjects ? xObjects.values().map(String) : []
    }),
  )
  return { pdf, imageCount: drawn.size }
}

describe('mmToPt', () => {
  it('converts mm to points', () => {
    expect(mmToPt(25.4)).toBe(72)
    expect(mmToPt(210)).toBeCloseTo(595.28, 2)
    expect(mmToPt(297)).toBeCloseTo(841.89, 2)
  })
})

describe('buildPdf', () => {
  it('puts 12 cards on each A4 portrait page', async () => {
    const { pdf } = await load([...Array(13).fill(PNG_A), PNG_B])
    expect(pdf.getPageCount()).toBe(2)
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(595.28, 2)
      expect(page.getHeight()).toBeCloseTo(841.89, 2)
    }
  })

  it('follows the layout: 8 cards of 57 mm on each A4 landscape page', async () => {
    const pdf = await PDFDocument.load(
      await buildPdf(Array(9).fill({ png: PNG_A, text: [] }), new Map(), printLayout(57)),
    )
    expect(pdf.getPageCount()).toBe(2)
    expect(pdf.getPages()[0].getWidth()).toBeCloseTo(841.89, 2)
    expect(pdf.getPages()[0].getHeight()).toBeCloseTo(595.28, 2)
  })

  it('embeds an image used for several Copies once', async () => {
    const { imageCount } = await load([PNG_A, PNG_A, PNG_A, PNG_B, PNG_B])
    expect(imageCount).toBe(2)
  })

  it('has no pages for no cards', async () => {
    const { pdf } = await load([])
    expect(pdf.getPageCount()).toBe(0)
  })
})

describe('buildPdf with Backs', () => {
  // The images each page draws, as XObject refs, in drawing order.
  const drawn = (pdf: PDFDocument) =>
    pdf.getPages().map((page) => {
      const xObjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
      return new Set(xObjects ? xObjects.values().map(String) : [])
    })

  it('follows every front page with a back page, even one whose cards have no Backs', async () => {
    const cards = [
      ...Array(12).fill({ png: PNG_A, text: [] }),
      { png: PNG_A, text: [], back: PNG_B },
    ]
    const pdf = await PDFDocument.load(await buildPdf(cards))
    expect(pdf.getPageCount()).toBe(4)
    const [front1, back1, front2, back2] = drawn(pdf)
    expect(front1.size).toBe(1)
    expect(back1.size).toBe(0)
    expect(front2.size).toBe(1)
    expect(back2.size).toBe(1)
    expect([...back2][0]).not.toBe([...front2][0])
  })

  it('stays single-sided without Backs', async () => {
    const pdf = await PDFDocument.load(await buildPdf([{ png: PNG_A, text: [], back: null }]))
    expect(pdf.getPageCount()).toBe(1)
  })

  it('embeds a Back shared by several cards once', async () => {
    const card = { png: PNG_A, text: [], back: PNG_B }
    const pdf = await PDFDocument.load(await buildPdf([card, card, { ...card }]))
    const [, back] = drawn(pdf)
    expect(back.size).toBe(1)
  })

  it('draws a Back clipped to its bleed rectangle at the mirrored slot, without cut lines', async () => {
    const pdf = await PDFDocument.load(await buildPdf([{ png: PNG_A, text: [], back: PNG_B }]))
    const contents = pdf.getPages()[1].node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents]
    const content = streams.map((s) => new TextDecoder().decode(decodePDFRawStream(s as PDFRawStream).decode())).join('\n')
    // Slot 0's Back goes to the top-right slot: x = 156 mm, 48 × 76 mm, y from the bottom.
    const pt = (mm: number) => mmToPt(mm).toFixed(2)
    const numbers = content.match(/-?\d+(\.\d+)?/g)!.map(Number)
    const near = (value: string) => numbers.some((n) => Math.abs(n - Number(value)) < 0.01)
    expect(content).toMatch(/\bre\s+W\s+n\b/)
    expect(near(pt(156))).toBe(true)
    expect(near(pt(48))).toBe(true)
    expect(near(pt(76))).toBe(true)
    expect(near(pt(297 - 32.5 - 76))).toBe(true)
    // A cut line would stroke (S); the Back page only fills images.
    expect(content).not.toMatch(/\bS\b/)
  })
})

describe('hexToRgb', () => {
  it('reads #rrggbb and #rgb, and falls back to black', () => {
    expect(hexToRgb('#ff8000')).toEqual({ type: 'RGB', red: 1, green: 128 / 255, blue: 0 })
    expect(hexToRgb('#fff')).toEqual({ type: 'RGB', red: 1, green: 1, blue: 1 })
    expect(hexToRgb('red')).toEqual({ type: 'RGB', red: 0, green: 0, blue: 0 })
  })
})

describe('buildPdf text', () => {
  const FONT = 'fonts/Cinzel-Bold.woff2'
  // The export embeds the font's .ttf variant (its embedUrl), never the WOFF2.
  const fontBytes = new Uint8Array(readFileSync(resolve(__dirname, '../../../../assets/fonts/Cinzel-Bold.ttf')))
  const text = (outlineWidth: number) => ({
    font: FONT,
    fontSize: 50,
    color: '#000000',
    outlineColor: '#ffffff',
    outlineWidth,
    runs: [{ text: 'Hello', x: 10, baseline: 100 }],
  })

  async function contentOf(card: { png: Uint8Array; text: ReturnType<typeof text>[] }, copies = 1) {
    const bytes = await buildPdf(Array(copies).fill(card), new Map([[FONT, fontBytes]]))
    const pdf = await PDFDocument.load(bytes)
    const fonts = pdf.getPages()[0].node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)
    const contents = pdf.getPages()[0].node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents]
    const ops = streams.map((s) => new TextDecoder().decode(decodePDFRawStream(s as PDFRawStream).decode())).join('\n')
    return { ops, fontNames: new Set(fonts?.values().map((ref) => String(pdf.context.lookup(ref, PDFDict).get(PDFName.of('BaseFont'))))) }
  }

  it('draws snippet text as real text in the embedded font, upright and in card units', async () => {
    const { ops, fontNames } = await contentOf({ png: PNG_A, text: [text(0)] })
    expect([...fontNames].some((n) => n.includes('Cinzel-Bold'))).toBe(true)
    expect(ops).toMatch(/1 0 0 -1 10 100 Tm/)
    expect(ops).toMatch(/0 Tr/)
    expect(ops).not.toMatch(/1 Tr/)
  })

  it('strokes the outline at twice its width before the fill', async () => {
    const { ops } = await contentOf({ png: PNG_A, text: [text(3)] })
    expect(ops).toMatch(/6 w/)
    expect(ops.indexOf('1 Tr')).toBeGreaterThan(-1)
    expect(ops.indexOf('1 Tr')).toBeLessThan(ops.indexOf('0 Tr'))
  })

  it('embeds a font used on several cards once', async () => {
    const bytes = await buildPdf(Array(3).fill({ png: PNG_A, text: [text(0)] }), new Map([[FONT, fontBytes]]))
    const pdf = await PDFDocument.load(bytes)
    const fontFiles = pdf.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFDict && o.get(PDFName.of('Type'))?.toString() === '/FontDescriptor')
    expect(fontFiles).toHaveLength(1)
  })

  it('embeds a TrueType font file that PDF viewers can read', async () => {
    const pdf = await PDFDocument.load(await buildPdf([{ png: PNG_A, text: [text(0)] }], new Map([[FONT, fontBytes]])))
    const [, descriptor] = pdf.context.enumerateIndirectObjects().find(([, o]) => o instanceof PDFDict && o.get(PDFName.of('Type'))?.toString() === '/FontDescriptor')!
    const file = pdf.context.lookup((descriptor as PDFDict).get(PDFName.of('FontFile2'))) as PDFRawStream
    // 0x00010000 is the TrueType magic; a raw WOFF2 starts with "wOF2" and makes viewers substitute a font.
    expect([...decodePDFRawStream(file).decode().subarray(0, 4)]).toEqual([0, 1, 0, 0])
  })
})
