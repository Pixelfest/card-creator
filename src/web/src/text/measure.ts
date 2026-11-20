import { FALLBACK_FAMILY } from './fonts'
import type { Measurer } from './layout'

/** The `ctx.font` value for a family at a size in card units. Generic families are unquoted. */
export function fontString(family: string, size: number): string {
  return family === FALLBACK_FAMILY ? `${size}px ${family}` : `${size}px "${family}"`
}

let context: CanvasRenderingContext2D | null | undefined

function measuringContext(): CanvasRenderingContext2D | null {
  // One untransformed canvas: every layout is measured in card units, whatever is drawn later.
  context ??= document.createElement('canvas').getContext('2d')
  return context
}

/** Used only where there is no canvas (tests): about half an em per character. */
const approximate: Measurer = {
  width: (text, _family, size) => Array.from(text).length * size * 0.5,
  metrics: () => ({ ascent: 0.8, descent: 0.2 }),
}

/** Measures with the browser's own text shaping, in card units. */
export const canvasMeasurer: Measurer = {
  width(text, family, size) {
    const ctx = measuringContext()
    if (!ctx) return approximate.width(text, family, size)
    ctx.font = fontString(family, size)
    return ctx.measureText(text).width
  },
  metrics(family) {
    const ctx = measuringContext()
    if (!ctx) return approximate.metrics(family)
    ctx.font = fontString(family, 100)
    const m = ctx.measureText('Hg')
    const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent
    const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent
    return ascent > 0 ? { ascent: ascent / 100, descent: descent / 100 } : approximate.metrics(family)
  },
}
