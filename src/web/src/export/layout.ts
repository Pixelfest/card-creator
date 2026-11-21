// The pure part of Export (docs/spec.md, section 10): page geometry, units, which Cards go on
// which page, and the file name. Rendering lives in render.ts, building in docx.ts and pdf.ts.

import { CUT_BORDER_MM } from '../render/units'

/** Card size in mm. */
export const CARD_MM = { width: 44, height: 72 }
/**
 * A printed card in mm: the Card plus the white cut border that is part of its PNG
 * (render/exportCard.ts). The image fills its cell and the cell's borders are the cut lines.
 */
export const PRINT_MM = { width: CARD_MM.width + 2 * CUT_BORDER_MM, height: CARD_MM.height + 2 * CUT_BORDER_MM }
/** Spacer between cut lines, in mm. */
export const GAP_MM = 2
/** Cards per page: 4 columns × 3 rows. */
export const COLUMNS = 4
export const ROWS = 3
export const CARDS_PER_PAGE = COLUMNS * ROWS
/** A4 portrait in mm, and in twips as `docx` and Word use them. */
export const A4_MM = { width: 210, height: 297 }
export const A4_TWIPS = { width: 11906, height: 16838 }

/** Pixels at 96 dpi, unrounded: `docx` turns them into EMU as px × 9525, which is exact. */
export function mmToPx96(mm: number): number {
  return (mm / 25.4) * 96
}

/** Twips (1/1440 in), rounded up so a 76 mm image is never clipped by an exact-height row. */
export function mmToTwips(mm: number): number {
  // The epsilon keeps values that are whole in exact maths (e.g. 25.4 mm) from rounding up.
  return Math.max(0, Math.ceil((mm / 25.4) * 1440 - 1e-9))
}

/** EMU (English Metric Units), 36 000 per mm: what Word stores as an image's extent. */
export function mmToEmu(mm: number): number {
  return Math.round(mm * 36000)
}

/** The grid's size and the margins that centre it on A4, in mm. */
export function gridGeometry() {
  const width = COLUMNS * PRINT_MM.width + (COLUMNS - 1) * GAP_MM
  const height = ROWS * PRINT_MM.height + (ROWS - 1) * GAP_MM
  return {
    width,
    height,
    marginX: (A4_MM.width - width) / 2,
    marginY: (A4_MM.height - height) / 2,
  }
}

/**
 * Top-left corner in mm, from the page's top-left, of the printed card in a page slot
 * (0–11, row by row). Used by the PDF, which places each card itself instead of in a table.
 */
export function slotOriginMm(slot: number): { x: number; y: number } {
  const { marginX, marginY } = gridGeometry()
  const column = slot % COLUMNS
  const row = Math.floor(slot / COLUMNS)
  return {
    x: marginX + column * (PRINT_MM.width + GAP_MM),
    y: marginY + row * (PRINT_MM.height + GAP_MM),
  }
}

/** Table column widths in twips: card, gap, card, gap, … card. */
export function columnWidthsTwips(): number[] {
  return Array.from({ length: COLUMNS * 2 - 1 }, (_, i) => mmToTwips(i % 2 ? GAP_MM : PRINT_MM.width))
}

/** Row heights in twips: card, gap, card, gap, card. */
export function rowHeightsTwips(): number[] {
  return Array.from({ length: ROWS * 2 - 1 }, (_, i) => mmToTwips(i % 2 ? GAP_MM : PRINT_MM.height))
}

/**
 * Page margins in twips that centre the grid on A4, rounded down so it always fits.
 * Bottom and right are the same as top and left; the table is fixed, so they only matter for fit.
 */
export function pageMarginsTwips(): { top: number; left: number } {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
  return {
    top: Math.floor((A4_TWIPS.height - sum(rowHeightsTwips())) / 2),
    left: Math.floor((A4_TWIPS.width - sum(columnWidthsTwips())) / 2),
  }
}

/**
 * Each Card's Copies as consecutive entries, in card-list order. Cards with Copies 0 (or not
 * selected) are left out.
 */
export function expandCopies<T extends { id: string; copies: number }>(
  cards: readonly T[],
  selected?: ReadonlySet<string>,
): T[] {
  return cards.flatMap((card) =>
    (selected && !selected.has(card.id)) || card.copies <= 0 ? [] : Array.from({ length: card.copies }, () => card),
  )
}

/** Splits the entries into pages of 12; the last page may be partly empty. */
export function paginate<T>(entries: readonly T[]): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < entries.length; i += CARDS_PER_PAGE) pages.push(entries.slice(i, i + CARDS_PER_PAGE))
  return pages
}

export function pageCount(cardCount: number): number {
  return Math.ceil(cardCount / CARDS_PER_PAGE)
}

/**
 * `{Set name}.{extension}`, safe on Windows, macOS and Linux: characters that are invalid in file
 * names (and control characters) become "_", trailing dots and spaces go, and reserved
 * device names get a "_" prefix. An empty name becomes "cards".
 */
export function exportFileName(setName: string, extension: 'docx' | 'pdf'): string {
  // eslint-disable-next-line no-control-regex
  let name = setName.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim()
  name = name.replace(/[. ]+$/, '')
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) name = `_${name}`
  if (!name) name = 'cards'
  return `${name.slice(0, 200)}.${extension}`
}
