import { PDFDocument, rgb, type PDFImage } from 'pdf-lib'
import { A4_MM, PRINT_MM, paginate, slotOriginMm } from './layout'
import { renderPrintImages, type ExportInput } from './render'

// Builds the .pdf (docs/spec.md, section 10): the same A4 grid as the Word export, with each
// 48×76 mm card image (Card plus its white cut border) drawn at its slot and a ¼ pt black cut
// line on its edge.

/** Points (1/72 in), PDF's unit. */
export function mmToPt(mm: number): number {
  return (mm / 25.4) * 72
}

/** Cut lines: ¼ pt, black, as in the Word export. */
const CUT_LINE_PT = 0.25

/**
 * The PDF bytes for a list of card images, one entry per printed card. Pass the same
 * Uint8Array for every Copy of a Card: it is embedded once and drawn for each Copy.
 */
export async function buildPdf(images: readonly Uint8Array[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Cards')
  pdf.setCreator('Card Creator')
  const embedded = new Map<Uint8Array, PDFImage>()
  const page = { width: mmToPt(A4_MM.width), height: mmToPt(A4_MM.height) }
  const size = { width: mmToPt(PRINT_MM.width), height: mmToPt(PRINT_MM.height) }

  for (const cards of paginate(images)) {
    const pdfPage = pdf.addPage([page.width, page.height])
    for (const [slot, png] of cards.entries()) {
      let image = embedded.get(png)
      if (!image) {
        image = await pdf.embedPng(png)
        embedded.set(png, image)
      }
      const origin = slotOriginMm(slot)
      // PDF measures y up from the bottom of the page.
      const rect = { x: mmToPt(origin.x), y: page.height - mmToPt(origin.y) - size.height, ...size }
      pdfPage.drawImage(image, rect)
      pdfPage.drawRectangle({ ...rect, borderColor: rgb(0, 0, 0), borderWidth: CUT_LINE_PT })
    }
  }
  // Without this pdf-lib adds a blank page to an empty document.
  return pdf.save({ addDefaultPage: false })
}

/** Renders the selected Cards and builds `{Set name}.pdf` from them. */
export async function exportPdf(input: ExportInput): Promise<Blob> {
  return renderPrintImages(input, async (images) => {
    const bytes = await buildPdf(images)
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
  })
}
