import {
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  WidthType,
  type IBorderOptions,
} from 'docx'
import type { AssetManifest } from '../assets/api'
import type { Card } from '../editor/model'
import { renderCardToPng } from '../render/exportCard'
import { emojiKey, type ImageSource } from '../render/renderCard'
import { imageRequests } from '../render/useRenderResources'
import type { TextResources } from '../text/textResources'
import {
  A4_TWIPS,
  CARD_MM,
  COLUMNS,
  GAP_MM,
  ROWS,
  columnWidthsTwips,
  expandCopies,
  mmToPx96,
  mmToTwips,
  pageMarginsTwips,
  paginate,
} from './layout'

// Builds the .docx (docs/spec.md, section 10; research/docx-export.md §4, §9): one fixed-layout
// table per A4 page, inline images at 44×72 mm, card-cell borders as cut lines.

/** Cut lines: single, ¼ pt, black. */
const CUT: IBorderOptions = { style: BorderStyle.SINGLE, size: 2, color: '000000' }
const FLUSH = { before: 0, after: 0 }

function cardCell(png: Uint8Array | undefined): TableCell {
  return new TableCell({
    width: { size: mmToTwips(CARD_MM.width), type: WidthType.DXA },
    borders: png ? { top: CUT, bottom: CUT, left: CUT, right: CUT } : undefined,
    children: [
      new Paragraph({
        spacing: FLUSH,
        children: png
          ? [
              new ImageRun({
                type: 'png',
                data: png,
                transformation: { width: mmToPx96(CARD_MM.width), height: mmToPx96(CARD_MM.height) },
              }),
            ]
          : [],
      }),
    ],
  })
}

function gapCell(): TableCell {
  return new TableCell({
    width: { size: mmToTwips(GAP_MM), type: WidthType.DXA },
    children: [new Paragraph({ spacing: FLUSH })],
  })
}

function pageTable(cards: readonly Uint8Array[]): Table {
  const rows: TableRow[] = []
  for (let r = 0; r < ROWS; r++) {
    const cells: TableCell[] = []
    for (let c = 0; c < COLUMNS; c++) {
      if (c) cells.push(gapCell())
      cells.push(cardCell(cards[r * COLUMNS + c]))
    }
    rows.push(
      new TableRow({
        height: { value: mmToTwips(CARD_MM.height), rule: HeightRule.EXACT },
        cantSplit: true,
        children: cells,
      }),
    )
    if (r < ROWS - 1) {
      rows.push(
        new TableRow({
          height: { value: mmToTwips(GAP_MM), rule: HeightRule.EXACT },
          cantSplit: true,
          children: Array.from({ length: COLUMNS * 2 - 1 }, gapCell),
        }),
      )
    }
  }
  const widths = columnWidthsTwips()
  return new Table({
    layout: TableLayoutType.FIXED,
    borders: TableBorders.NONE,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows,
  })
}

/**
 * The document for a list of card images, one entry per printed card. Pass the same
 * Uint8Array for every Copy of a Card: `docx` stores identical images once.
 */
export function buildDocument(images: readonly Uint8Array[]): Document {
  const margins = pageMarginsTwips()
  const children = paginate(images).flatMap((page, i) => {
    const table = pageTable(page)
    return i === 0 ? [table] : [new Paragraph({ pageBreakBefore: true, spacing: FLUSH }), table]
  })
  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_TWIPS.width, height: A4_TWIPS.height },
            margin: {
              top: margins.top,
              bottom: margins.top,
              left: margins.left,
              right: margins.left,
              header: 0,
              footer: 0,
            },
          },
        },
        children,
      },
    ],
  })
}

export function documentToBlob(document: Document): Promise<Blob> {
  return Packer.toBlob(document)
}

export type ExportProgress = { done: number; total: number }

export type ExportInput = {
  cards: readonly Card[]
  selected: ReadonlySet<string>
  manifest: AssetManifest | undefined
  text: TextResources
  artworkUrl: (id: string) => string
  onProgress?: (progress: ExportProgress) => void
}

/**
 * Renders each selected Card once to a 520×850 PNG, after loading every image it needs, and
 * builds the .docx with its Copies consecutive. An image that fails to load fails the export
 * (it would be silently missing from the print), except an emoji, which falls back to text
 * exactly as in the editor.
 */
export async function exportCards({
  cards,
  selected,
  manifest,
  text,
  artworkUrl,
  onProgress,
}: ExportInput): Promise<Blob> {
  const unique = cards.filter((card) => selected.has(card.id) && card.copies > 0)
  const total = unique.length + 1
  const loaded = new Map<string, Promise<ImageSource | undefined>>()
  const pngs = new Map<string, Uint8Array>()

  onProgress?.({ done: 0, total })
  for (const [i, card] of unique.entries()) {
    const images = new Map<string, ImageSource>()
    for (const { key, load } of imageRequests(card.design, manifest, artworkUrl)) {
      let pending = loaded.get(key)
      if (!pending) {
        const optional = key.startsWith(emojiKey(''))
        pending = load().catch((error: unknown) => {
          if (optional) return undefined
          throw error
        })
        loaded.set(key, pending)
      }
      let image: ImageSource | undefined
      try {
        image = await pending
      } catch {
        throw new Error(`Couldn't load an image for “${card.name}”.`)
      }
      if (image) images.set(key, image)
    }
    const blob = await renderCardToPng(card.design, { images, text })
    pngs.set(card.id, new Uint8Array(await blob.arrayBuffer()))
    onProgress?.({ done: i + 1, total })
  }

  const printed = expandCopies(unique).map((card) => pngs.get(card.id)!)
  const blob = await documentToBlob(buildDocument(printed))
  onProgress?.({ done: total, total })
  return blob
}

/** Saves a Blob as a download. */
export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
