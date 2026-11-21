import type { Snippet } from '../editor/model'
import type { Rect } from '../render/artwork'
import { CARD_HEIGHT, CARD_WIDTH, ptToUnits } from '../render/units'
import { DEFAULT_OUTLINE_THICKNESS } from '../editor/snippets'
import { wrapText } from './wrap'

// The Text snippet box model (docs/spec.md, section 6), as pure functions in card units. The
// layout is computed once, with one measurer, and drawn by both the preview and the export,
// so their line breaks are identical.

export const LINE_HEIGHT = 1.2
/** Horizontal padding, as a share of the box width. */
export const PADDING_X = 0.04
/** Vertical padding above and below the text, as a share of the font size. */
export const PADDING_Y = 0.15
/** With a Snippet background, the padding is a share of the box height instead. */
export const BACKGROUND_PADDING_Y = 0.06
/** Auto-shrink goes down to half the chosen size. */
export const MIN_SHRINK = 0.5
const SHRINK_STEP = 0.025
/** The outline is drawn with strokeText at the snippet's thickness, by default 12% of the font size. */
export const OUTLINE_SHARE = DEFAULT_OUTLINE_THICKNESS / 100

/** Measures text in card units. Ascent and descent are fractions of the font size. */
export type Measurer = {
  width(text: string, family: string, size: number): number
  metrics(family: string): { ascent: number; descent: number }
}

export type LaidOutLine = { text: string; x: number; baseline: number; width: number }

export type SnippetLayout = {
  box: Rect
  fontSize: number
  lines: LaidOutLine[]
  /** False when even at 50% the text overflows: the snippet gets a warning. */
  fits: boolean
  /** True when the text was made smaller than its chosen size to fit. */
  shrunk: boolean
  outlineWidth: number
}

/** Box geometry that does not depend on the text: horizontal extent and centre line. */
export function boxFrame(snippet: Pick<Snippet, 'zoom' | 'position'>) {
  const width = (CARD_WIDTH * snippet.zoom) / 100
  return { x: (CARD_WIDTH - width) / 2, width, centreY: (CARD_HEIGHT * snippet.position) / 100 }
}

/**
 * Lays a snippet out. Without a background the box is as tall as the text and must stay on
 * the Card; with one (`backgroundAspect`, width/height) the box has the background's
 * proportions and the text must fit inside it. Text that does not fit shrinks, down to 50%.
 */
export function layoutSnippet(
  snippet: Snippet,
  family: string,
  measurer: Measurer,
  backgroundAspect?: number,
): SnippetLayout {
  const base = ptToUnits(snippet.size)
  for (let scale = 1; scale >= MIN_SHRINK - 1e-9; scale -= SHRINK_STEP) {
    const attempt = layoutAt(snippet, family, measurer, base * scale, backgroundAspect)
    if (attempt.fits) return { ...attempt, shrunk: scale < 1 }
  }
  return { ...layoutAt(snippet, family, measurer, base * MIN_SHRINK, backgroundAspect), fits: false, shrunk: true }
}

function layoutAt(
  snippet: Snippet,
  family: string,
  measurer: Measurer,
  fontSize: number,
  backgroundAspect: number | undefined,
): SnippetLayout {
  const frame = boxFrame(snippet)
  const padX = frame.width * PADDING_X
  const inner = frame.width - padX * 2
  const { lines, brokeWord } = wrapText(snippet.text, inner, (t) => measurer.width(t, family, fontSize))

  const lineHeight = fontSize * LINE_HEIGHT
  const block = lines.length * lineHeight

  let height: number
  let fitsHeight: boolean
  if (backgroundAspect) {
    height = frame.width / backgroundAspect
    fitsHeight = block <= height * (1 - 2 * BACKGROUND_PADDING_Y) + 1e-6
  } else {
    height = block + fontSize * PADDING_Y * 2
    // The box must stay on the Card, around its own centre line.
    const room = 2 * Math.min(frame.centreY, CARD_HEIGHT - frame.centreY)
    fitsHeight = height <= room + 1e-6
  }

  const box = { x: frame.x, y: frame.centreY - height / 2, width: frame.width, height }
  const { ascent, descent } = measurer.metrics(family)
  const blockTop = box.y + (height - block) / 2

  const laidOut = lines.map((text, i) => {
    const width = measurer.width(text, family, fontSize)
    const x =
      snippet.align === 'left'
        ? box.x + padX
        : snippet.align === 'right'
          ? box.x + box.width - padX - width
          : box.x + (box.width - width) / 2
    // Centre the glyphs' ascent–descent band within the line box, on an alphabetic baseline.
    const baseline = blockTop + i * lineHeight + (lineHeight + (ascent - descent) * fontSize) / 2
    return { text, x, baseline, width }
  })

  return {
    box,
    fontSize,
    lines: laidOut,
    fits: fitsHeight && !brokeWord,
    shrunk: false,
    outlineWidth: snippet.outline ? (fontSize * (snippet.outlineThickness ?? DEFAULT_OUTLINE_THICKNESS)) / 100 : 0,
  }
}

/** Whether a point (card units) is inside a snippet's box, for clicks and drags. */
export function hitsBox(layout: Pick<SnippetLayout, 'box'>, x: number, y: number): boolean {
  const b = layout.box
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
}
