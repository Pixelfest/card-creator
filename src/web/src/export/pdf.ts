import fontkit from '@pdf-lib/fontkit'
import {
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  TextRenderingMode,
  beginText,
  clip,
  concatTransformationMatrix,
  endPath,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setFillingColor,
  setFontAndSize,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  type PDFFont,
  type PDFName,
  type PDFImage,
  type PDFOperator,
  type PDFPage,
  type RGB,
} from 'pdf-lib'
import { PRINT_SIZE } from '../render/exportCard'
import type { SnippetText } from '../render/renderCard'
import { CARD_HEIGHT, CARD_WIDTH, CUT_BORDER_PX } from '../render/units'
import { A4_MM, PRINT_MM, paginate, slotOriginMm } from './layout'
import { renderPrintCards, type ExportInput, type PrintCard } from './render'

// Builds the .pdf (docs/spec.md, section 10): the same A4 grid as the Word export, with each
// 48×76 mm card image (Card plus its white cut border) drawn at its slot and a ¼ pt black cut
// line on its edge. Snippet text is drawn over the image as real text in the embedded font,
// so it prints sharp instead of at the image's 300 DPI.

/** Points (1/72 in), PDF's unit. */
export function mmToPt(mm: number): number {
  return (mm / 25.4) * 72
}

/** Cut lines: ¼ pt, black, as in the Word export. */
const CUT_LINE_PT = 0.25

/** `#rgb` or `#rrggbb` as a pdf-lib colour; anything else is black. */
export function hexToRgb(hex: string): RGB {
  let digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())?.[1]
  if (!digits) return rgb(0, 0, 0)
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join('')
  const n = parseInt(digits, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/**
 * The PDF bytes for a list of printed cards. Pass the same PrintCard for every Copy of a Card:
 * its image is embedded once and drawn for each Copy. `fonts` holds the font file for every
 * font path the cards' text uses.
 */
export async function buildPdf(
  cards: readonly PrintCard[],
  fonts: ReadonlyMap<string, Uint8Array> = new Map(),
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle('Cards')
  pdf.setCreator('Card Creator')
  const embedded = new Map<Uint8Array, PDFImage>()
  const embeddedFonts = new Map<string, Promise<PDFFont>>()
  const embedFont = (path: string) => {
    let font = embeddedFonts.get(path)
    if (!font) {
      const bytes = fonts.get(path)
      if (!bytes) throw new Error(`The font ${path} is missing from the export.`)
      // Whole fonts: pdf-lib's subsetting garbles some fonts' glyphs.
      font = pdf.embedFont(bytes, { subset: false })
      embeddedFonts.set(path, font)
    }
    return font
  }
  const page = { width: mmToPt(A4_MM.width), height: mmToPt(A4_MM.height) }
  const size = { width: mmToPt(PRINT_MM.width), height: mmToPt(PRINT_MM.height) }

  for (const pageCards of paginate(cards)) {
    const pdfPage = pdf.addPage([page.width, page.height])
    // Each font is added to the page's resources once, however many snippets use it.
    const fontKeys = new Map<PDFFont, PDFName>()
    const fontKey = async (path: string) => {
      const font = await embedFont(path)
      let key = fontKeys.get(font)
      if (!key) fontKeys.set(font, (key = pdfPage.node.newFontDictionary(font.name, font.ref)))
      return { font, key }
    }
    for (const [slot, card] of pageCards.entries()) {
      let image = embedded.get(card.png)
      if (!image) {
        image = await pdf.embedPng(card.png)
        embedded.set(card.png, image)
      }
      const origin = slotOriginMm(slot)
      // PDF measures y up from the bottom of the page.
      const rect = { x: mmToPt(origin.x), y: page.height - mmToPt(origin.y) - size.height, ...size }
      pdfPage.drawImage(image, rect)
      if (card.text.length) await drawText(pdfPage, rect, card.text, fontKey)
      pdfPage.drawRectangle({ ...rect, borderColor: rgb(0, 0, 0), borderWidth: CUT_LINE_PT })
    }
  }
  // Without this pdf-lib adds a blank page to an empty document.
  return pdf.save({ addDefaultPage: false })
}

/**
 * Draws a Card's snippet text over its image. The coordinate system is switched to card units
 * with y down (the image's pixels are card units), clipped to the Card like the canvas render.
 * As on the canvas, each snippet's outline is a stroke twice the outline width with round
 * joins, all drawn before the fill.
 */
async function drawText(
  page: PDFPage,
  rect: { x: number; y: number; width: number; height: number },
  snippets: readonly SnippetText[],
  fontKey: (path: string) => Promise<{ font: PDFFont; key: PDFName }>,
) {
  const scale = rect.width / PRINT_SIZE.width
  const ops: PDFOperator[] = [
    pushGraphicsState(),
    concatTransformationMatrix(
      scale,
      0,
      0,
      -scale,
      rect.x + CUT_BORDER_PX * scale,
      rect.y + rect.height - CUT_BORDER_PX * scale,
    ),
    rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT),
    clip(),
    endPath(),
  ]
  for (const snippet of snippets) {
    const { font, key } = await fontKey(snippet.font)
    // The y axis is flipped, so each run's text matrix flips it back to keep glyphs upright.
    const runs = (mode: TextRenderingMode) =>
      snippet.runs.flatMap((run) => [
        beginText(),
        setFontAndSize(key, snippet.fontSize),
        setTextRenderingMode(mode),
        setTextMatrix(1, 0, 0, -1, run.x, run.baseline),
        showText(font.encodeText(run.text)),
        endText(),
      ])
    if (snippet.outlineWidth > 0) {
      ops.push(
        setStrokingColor(hexToRgb(snippet.outlineColor)),
        setLineWidth(snippet.outlineWidth * 2),
        setLineJoin(LineJoinStyle.Round),
        setLineCap(LineCapStyle.Round),
        ...runs(TextRenderingMode.Outline),
      )
    }
    ops.push(setFillingColor(hexToRgb(snippet.color)), ...runs(TextRenderingMode.Fill))
  }
  ops.push(popGraphicsState())
  page.pushOperators(...ops)
}

/** Fetches the font file for every font the cards' text uses. */
async function loadFontFiles(cards: readonly PrintCard[], input: ExportInput): Promise<Map<string, Uint8Array>> {
  const paths = new Set(cards.flatMap((card) => card.text.map((t) => t.font)))
  const files = new Map<string, Uint8Array>()
  await Promise.all(
    [...paths].map(async (path) => {
      const url = input.manifest?.fonts.find((f) => f.path === path)?.url
      const response = url ? await fetch(url) : undefined
      if (!response?.ok) throw new Error(`Couldn't load the font ${path} for the PDF.`)
      files.set(path, new Uint8Array(await response.arrayBuffer()))
    }),
  )
  return files
}

/** Renders the selected Cards and builds `{Set name}.pdf` from them. */
export async function exportPdf(input: ExportInput): Promise<Blob> {
  return renderPrintCards(input, true, async (cards) => {
    const bytes = await buildPdf(cards, await loadFontFiles(cards, input))
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
  })
}
