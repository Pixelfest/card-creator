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
import {
  A4_TWIPS,
  COLUMNS,
  GAP_MM,
  PRINT_MM,
  ROWS,
  columnWidthsTwips,
  mmToPx96,
  mmToTwips,
  pageMarginsTwips,
  paginate,
} from './layout'
import { renderPrintImages, type ExportInput } from './render'

// Builds the .docx (docs/spec.md, section 10; research/docx-export.md §4, §9): one fixed-layout
// table per A4 page, inline images at 48×76 mm (the 44×72 mm Card plus its 2 mm white cut
// border, rendered into the PNG), card-cell borders as cut lines.

/** Cut lines: single, ¼ pt, black. */
const CUT: IBorderOptions = { style: BorderStyle.SINGLE, size: 2, color: '000000' }
const FLUSH = { before: 0, after: 0 }

function cardCell(png: Uint8Array | undefined): TableCell {
  return new TableCell({
    width: { size: mmToTwips(PRINT_MM.width), type: WidthType.DXA },
    borders: png ? { top: CUT, bottom: CUT, left: CUT, right: CUT } : undefined,
    // The PNG carries its own white cut border, so it fills the cell edge to edge.
    children: [
      new Paragraph({
        spacing: FLUSH,
        children: png
          ? [
              new ImageRun({
                type: 'png',
                data: png,
                transformation: { width: mmToPx96(PRINT_MM.width), height: mmToPx96(PRINT_MM.height) },
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
        height: { value: mmToTwips(PRINT_MM.height), rule: HeightRule.EXACT },
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

/** Renders the selected Cards and builds `{Set name}.docx` from them. */
export async function exportDocx(input: ExportInput): Promise<Blob> {
  return renderPrintImages(input, async (images) => documentToBlob(buildDocument(images)))
}
