import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildPdf, mmToPt } from './pdf'

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
  const pdf = await PDFDocument.load(await buildPdf(images))
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

  it('embeds an image used for several Copies once', async () => {
    const { imageCount } = await load([PNG_A, PNG_A, PNG_A, PNG_B, PNG_B])
    expect(imageCount).toBe(2)
  })

  it('has no pages for no cards', async () => {
    const { pdf } = await load([])
    expect(pdf.getPageCount()).toBe(0)
  })
})
