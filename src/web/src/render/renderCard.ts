import type { CardDesign, SnippetSlot } from '../editor/model'
import { SNIPPET_DRAW_ORDER } from '../editor/snippets'
import { EMOJI_ADVANCE, EMOJI_SIZE, splitRuns } from '../text/emoji'
import type { SnippetLayout } from '../text/layout'
import { fontString } from '../text/measure'
import type { TextResources } from '../text/textResources'
import { artworkRect } from './artwork'
import { cornerIconRects, cornerIconsOf } from './cornerIcons'
import { CARD_HEIGHT, CARD_WIDTH, type RenderTarget } from './units'

/** Decoded images by URL. Only same-origin URLs go in, so the canvas is never tainted. */
export type ImageSource = CanvasImageSource & { width: number; height: number }

/** Everything a render needs that is not in the design itself. */
export type RenderResources = {
  /** Frame and Snippet background images by asset path; Artwork by `artworkKey(id)`. */
  images: ReadonlyMap<string, ImageSource>
  /** Fonts and layout for Text snippets; snippets are skipped without it. */
  text?: TextResources
}

/** The slice of CanvasRenderingContext2D the renderer uses; tests pass a recorder. */
export type RenderContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'setTransform'
  | 'scale'
  | 'beginPath'
  | 'rect'
  | 'clip'
  | 'clearRect'
  | 'fillRect'
  | 'drawImage'
  | 'fillStyle'
  | 'imageSmoothingEnabled'
  | 'imageSmoothingQuality'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'lineJoin'
  | 'lineCap'
  | 'lineWidth'
  | 'strokeStyle'
  | 'strokeText'
  | 'fillText'
>

/**
 * Draws one Card. Draw order, bottom to top (docs/spec.md, section 6): fill colour, Artwork,
 * Frame, the corner icons, then the textbox, banner and header snippets. Everything is in card units.
 */
export function renderCard(ctx: RenderContext, design: CardDesign, resources: RenderResources, target: RenderTarget): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.scale(target.scale, target.scale)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Nothing is drawn past the card edge (a snippet zoomed past it is clipped).
  ctx.beginPath()
  ctx.rect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.clip()

  drawFill(ctx, design)
  drawArtwork(ctx, design, resources)
  drawFrame(ctx, design, resources)
  drawCornerIcons(ctx, design, resources)
  for (const slot of SNIPPET_DRAW_ORDER) drawSnippet(ctx, design, slot, resources, target.scale)

  ctx.restore()
}

export { SNIPPET_DRAW_ORDER }

function drawFill(ctx: RenderContext, design: CardDesign) {
  ctx.fillStyle = design.fill
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
}

/** Artwork images are keyed apart from asset paths. */
export function artworkKey(id: string): string {
  return `artwork:${id}`
}

/** Twemoji images, by file name (code points). */
export function emojiKey(file: string): string {
  return `emoji:${file}`
}

function drawArtwork(ctx: RenderContext, design: CardDesign, resources: RenderResources) {
  const artwork = design.artwork
  const image = artwork ? resources.images.get(artworkKey(artwork.id)) : undefined
  if (!artwork || !image) return
  // Whatever the image does not cover keeps the fill colour (drawn first).
  const r = artworkRect(artwork)
  ctx.drawImage(image, r.x, r.y, r.width, r.height)
}

function drawFrame(ctx: RenderContext, design: CardDesign, resources: RenderResources) {
  const image = design.frame ? resources.images.get(design.frame) : undefined
  // A missing Frame is skipped; the Card shows a warning instead (see warnings.ts).
  if (image) ctx.drawImage(image, 0, 0, CARD_WIDTH, CARD_HEIGHT)
}

function drawCornerIcons(ctx: RenderContext, design: CardDesign, resources: RenderResources) {
  const settings = cornerIconsOf(design)
  const image = settings.icon ? resources.images.get(settings.icon) : undefined
  // A missing icon is skipped; the Card shows a warning instead (see warnings.ts).
  if (!image) return
  for (const r of cornerIconRects(settings, image.width / image.height)) ctx.drawImage(image, r.x, r.y, r.width, r.height)
}

/**
 * One Text snippet: its background (filling the box), then its text. Text runs get the outline
 * with strokeText first, at twice the outline width with round joins, then fillText on top so
 * the fill covers the stroke's inner half (research §3). Emoji are images, never stroked; with
 * an outline they get a silhouette in the outline colour behind them. All outlines are drawn
 * before any fill, so one line's outline never covers the line above. No maxWidth: the layout
 * already wrapped the lines.
 */
function drawSnippet(ctx: RenderContext, design: CardDesign, slot: SnippetSlot, resources: RenderResources, scale: number) {
  const snippet = design.snippets[slot]
  const text = resources.text
  if (!snippet || !text) return
  const layout = text.layout(snippet)
  const family = text.family(snippet.font)

  ctx.save()
  const background = snippet.background ? resources.images.get(snippet.background) : undefined
  if (background) ctx.drawImage(background, layout.box.x, layout.box.y, layout.box.width, layout.box.height)

  ctx.font = fontString(family, layout.fontSize)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = snippet.color
  ctx.strokeStyle = snippet.outlineColor
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = layout.outlineWidth * 2

  const runs = layout.lines.flatMap((line) => placeRuns(line, layout, family, text, resources.images))
  if (layout.outlineWidth > 0) {
    for (const run of runs) {
      if (run.kind === 'text') ctx.strokeText(run.text, run.x, run.baseline)
      else if (run.image) drawSilhouette(ctx, run.image, run, snippet.outlineColor, layout.outlineWidth, scale)
    }
  }
  for (const run of runs) {
    if (run.kind === 'text') ctx.fillText(run.text, run.x, run.baseline)
    else if (run.image) ctx.drawImage(run.image, run.x, run.y, run.size, run.size)
    // An emoji without a Twemoji file falls back to the font's glyph.
    else ctx.fillText(run.text, run.x, run.baseline)
  }
  ctx.restore()
}

type PlacedRun =
  | { kind: 'text'; text: string; x: number; baseline: number }
  | { kind: 'emoji'; text: string; image: ImageSource | undefined; x: number; y: number; size: number; baseline: number }

/** Positions a line's text and emoji runs from its left edge. */
function placeRuns(
  line: SnippetLayout['lines'][number],
  layout: SnippetLayout,
  family: string,
  text: TextResources,
  images: ReadonlyMap<string, ImageSource>,
): PlacedRun[] {
  const { ascent, descent } = text.metrics(family)
  const size = layout.fontSize * EMOJI_SIZE
  const advance = layout.fontSize * EMOJI_ADVANCE
  // Emoji sit centred on the font's ascent–descent band.
  const emojiTop = line.baseline - ((ascent - descent) / 2) * layout.fontSize - size / 2
  let x = line.x
  return splitRuns(line.text).map((run): PlacedRun => {
    if (run.kind === 'text') {
      const placed = { kind: 'text' as const, text: run.text, x, baseline: line.baseline }
      x += text.measureText(run.text, family, layout.fontSize)
      return placed
    }
    const placed = {
      kind: 'emoji' as const,
      text: run.text,
      image: images.get(emojiKey(run.file)),
      x: x + (advance - size) / 2,
      y: emojiTop,
      size,
      baseline: line.baseline,
    }
    x += advance
    return placed
  })
}

// An emoji's outline: its silhouette in the outline colour, drawn at eight offsets around it.
const silhouettes = new WeakMap<object, Map<string, HTMLCanvasElement | null>>()

function silhouetteOf(image: ImageSource, colour: string, pixels: number): HTMLCanvasElement | null {
  let byColour = silhouettes.get(image)
  if (!byColour) silhouettes.set(image, (byColour = new Map()))
  const key = `${colour}@${pixels}`
  if (!byColour.has(key)) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = pixels
    const g = canvas.getContext('2d')
    if (g) {
      g.drawImage(image, 0, 0, pixels, pixels)
      g.globalCompositeOperation = 'source-in'
      g.fillStyle = colour
      g.fillRect(0, 0, pixels, pixels)
    }
    byColour.set(key, g ? canvas : null)
  }
  return byColour.get(key) ?? null
}

function drawSilhouette(
  ctx: RenderContext,
  image: ImageSource,
  at: { x: number; y: number; size: number },
  colour: string,
  width: number,
  scale: number,
) {
  const silhouette = silhouetteOf(image, colour, Math.max(1, Math.ceil(at.size * scale)))
  if (!silhouette) return
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    ctx.drawImage(silhouette, at.x + Math.cos(angle) * width, at.y + Math.sin(angle) * width, at.size, at.size)
  }
}
