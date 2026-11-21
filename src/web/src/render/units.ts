// Card units (docs/spec.md, section 6). The renderer draws everything in one coordinate space,
// the 300 DPI export size of a 44×72 mm Card, and one scale factor maps it to pixels.

/** The Card Format's size in mm: the Card's ratio, and its default printed size. */
export const CARD_MM = { width: 44, height: 72 }

/** 44 mm at 300 DPI is 519.7 px; rounded to whole pixels. */
export const CARD_WIDTH = 520
/** 72 mm at 300 DPI is 850.4 px; rounded to whole pixels. */
export const CARD_HEIGHT = 850
export const CARD_ASPECT = CARD_WIDTH / CARD_HEIGHT

export const EXPORT_DPI = 300

/** Card units per point (1 pt = 1/72 in): 300 / 72 ≈ 4.17. */
export const UNITS_PER_PT = EXPORT_DPI / 72

export function ptToUnits(pt: number): number {
  return pt * UNITS_PER_PT
}

/** A canvas size in device pixels and the scale from card units to those pixels. */
export type RenderTarget = { width: number; height: number; scale: number }

/** White border added around a Card in the print PNG, so there is room to cut: 2 mm. */
export const CUT_BORDER_MM = 2
/** 2 mm at 300 DPI is 23.6 px; rounded to whole pixels. */
export const CUT_BORDER_PX = Math.round((CUT_BORDER_MM / 25.4) * EXPORT_DPI)

/** The export renders at exactly 520×850 and ignores devicePixelRatio. */
export const EXPORT_TARGET: RenderTarget = { width: CARD_WIDTH, height: CARD_HEIGHT, scale: 1 }

/**
 * The editor preview: a canvas shown `cssWidth` CSS pixels wide, with a backing store of
 * cssWidth × devicePixelRatio so it is sharp on high-DPI screens.
 */
export function previewTarget(cssWidth: number, devicePixelRatio: number): RenderTarget {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1
  const width = Math.max(1, Math.round(cssWidth * dpr))
  const scale = width / CARD_WIDTH
  return { width, height: Math.max(1, Math.round(CARD_HEIGHT * scale)), scale }
}

/** The largest Card (in CSS pixels) that fits a box, keeping 44:72. */
export function fitCard(boxWidth: number, boxHeight: number): { width: number; height: number } {
  const width = Math.max(0, Math.min(boxWidth, boxHeight * CARD_ASPECT))
  return { width, height: width / CARD_ASPECT }
}
