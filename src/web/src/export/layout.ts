// The pure part of Export (docs/spec.md, section 10): page geometry, which Cards go on which
// page, and the file name. Rendering lives in render.ts, building the PDF in pdf.ts.

import { CARD_MM, CUT_BORDER_MM } from '../render/units'

export { CARD_MM }

/** Spacer between cut lines, in mm. */
export const GAP_MM = 2
/**
 * How far a Back reaches past the Card on every side, in mm, so a front/back misalignment of up
 * to this much still covers the Card. It fills the front's cut border, so it costs no space.
 */
export const BACK_BLEED_MM = CUT_BORDER_MM
/** The least white space kept at each page edge, so printers that can't print to the edge don't clip. */
export const MIN_MARGIN_MM = 5
/** The printed Card widths the export accepts, in mm. The height follows from the Card Format. */
export const CARD_WIDTH_RANGE_MM = { min: 25, max: 120 }
/** A4 portrait in mm. */
export const A4_MM = { width: 210, height: 297 }

export type Orientation = 'portrait' | 'landscape'
type Size = { width: number; height: number }

/**
 * How the cards go on paper for one printed Card width: the Card and printed card size (the Card
 * plus its white cut border, which is part of its image), the grid and the page orientation.
 */
export type PrintLayout = {
  cardMm: Size
  printMm: Size
  columns: number
  rows: number
  perPage: number
  orientation: Orientation
  /** The page in mm, as oriented. */
  pageMm: Size
}

/** The Card height in mm for a Card width: the Card Format's 44:72 ratio. */
export function cardHeightMm(widthMm: number): number {
  return (widthMm * CARD_MM.height) / CARD_MM.width
}

/** A Card width from the dialog, or undefined when it is not a number in the accepted range. */
export function parseCardWidth(value: string): number | undefined {
  const width = Number(value.trim().replace(',', '.'))
  if (!value.trim() || !Number.isFinite(width)) return undefined
  if (width < CARD_WIDTH_RANGE_MM.min || width > CARD_WIDTH_RANGE_MM.max) return undefined
  return width
}

/** How many printed cards of `size` mm fit along `available` mm of paper. */
function fit(available: number, size: number): number {
  // The epsilon lets a grid that fits exactly in exact maths fit despite floating point.
  return Math.max(0, Math.floor((available - 2 * MIN_MARGIN_MM + GAP_MM) / (size + GAP_MM) + 1e-9))
}

/**
 * The layout that puts the most cards on an A4 page at this Card width: the grid that fits
 * inside the minimum margins, in portrait or landscape. Portrait wins a tie.
 */
export function printLayout(cardWidthMm: number = CARD_MM.width): PrintLayout {
  const cardMm = { width: cardWidthMm, height: cardHeightMm(cardWidthMm) }
  const printMm = { width: cardMm.width + 2 * CUT_BORDER_MM, height: cardMm.height + 2 * CUT_BORDER_MM }
  const options = (['portrait', 'landscape'] as const).map((orientation) => {
    const pageMm =
      orientation === 'portrait' ? { ...A4_MM } : { width: A4_MM.height, height: A4_MM.width }
    const columns = fit(pageMm.width, printMm.width)
    const rows = fit(pageMm.height, printMm.height)
    return { cardMm, printMm, columns, rows, perPage: columns * rows, orientation, pageMm }
  })
  return options[1].perPage > options[0].perPage ? options[1] : options[0]
}

/** The grid's size and the margins that centre it on the page, in mm. */
export function gridGeometry(layout: PrintLayout) {
  const { columns, rows, printMm, pageMm } = layout
  const width = columns * printMm.width + (columns - 1) * GAP_MM
  const height = rows * printMm.height + (rows - 1) * GAP_MM
  return {
    width,
    height,
    marginX: (pageMm.width - width) / 2,
    marginY: (pageMm.height - height) / 2,
  }
}

/**
 * Top-left corner in mm, from the page's top-left, of the printed card in a page slot
 * (row by row). Used by the PDF, which places each card itself instead of in a table.
 */
export function slotOriginMm(layout: PrintLayout, slot: number): { x: number; y: number } {
  const { marginX, marginY } = gridGeometry(layout)
  const column = slot % layout.columns
  const row = Math.floor(slot / layout.columns)
  return {
    x: marginX + column * (layout.printMm.width + GAP_MM),
    y: marginY + row * (layout.printMm.height + GAP_MM),
  }
}

/**
 * Where a printed card's Back goes on the back page, in mm from the page's top-left: the
 * Card's area grown by BACK_BLEED_MM on every side, in the mirrored column (the sheet turns
 * over its vertical axis: flip on long edge in portrait, short edge in landscape).
 */
export function backRectMm(layout: PrintLayout, slot: number): { x: number; y: number; width: number; height: number } {
  const column = slot % layout.columns
  const mirrored = Math.floor(slot / layout.columns) * layout.columns + (layout.columns - 1 - column)
  const origin = slotOriginMm(layout, mirrored)
  const inset = CUT_BORDER_MM - BACK_BLEED_MM
  return {
    x: origin.x + inset,
    y: origin.y + inset,
    width: layout.cardMm.width + 2 * BACK_BLEED_MM,
    height: layout.cardMm.height + 2 * BACK_BLEED_MM,
  }
}

/** The printer setting that puts each Back behind its front, for the layout's orientation. */
export function flipEdge(layout: PrintLayout): 'long' | 'short' {
  return layout.orientation === 'portrait' ? 'long' : 'short'
}

/**
 * Whether the PDF for these Cards is double-sided: at least one printed Card has a Back that the
 * asset library has. A missing Back prints blank, so on its own it doesn't make the PDF double-sided.
 */
export function isDoubleSided(
  cards: readonly { id: string; copies: number; design: { back?: string | null } }[],
  backs: readonly { path: string }[] | undefined,
  selected?: ReadonlySet<string>,
): boolean {
  return expandCopies(cards, selected).some((card) => !!card.design.back && !!backs?.some((b) => b.path === card.design.back))
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

/** Splits the entries into pages of `perPage`; the last page may be partly empty. */
export function paginate<T>(entries: readonly T[], perPage: number): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < entries.length; i += perPage) pages.push(entries.slice(i, i + perPage))
  return pages
}

export function pageCount(cardCount: number, perPage: number): number {
  return Math.ceil(cardCount / perPage)
}

/**
 * `{Set name}.pdf`, safe on Windows, macOS and Linux: characters that are invalid in file
 * names (and control characters) become "_", trailing dots and spaces go, and reserved
 * device names get a "_" prefix. An empty name becomes "cards".
 */
export function exportFileName(setName: string): string {
  // eslint-disable-next-line no-control-regex
  let name = setName.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim()
  name = name.replace(/[. ]+$/, '')
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) name = `_${name}`
  if (!name) name = 'cards'
  return `${name.slice(0, 200)}.pdf`
}
