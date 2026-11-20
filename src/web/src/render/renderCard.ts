import type { CardDesign, SnippetSlot } from '../editor/model'
import { SNIPPET_DRAW_ORDER } from '../editor/snippets'
import { fontString } from '../text/measure'
import type { TextResources } from '../text/textResources'
import { artworkRect } from './artwork'
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
 * Frame, then the textbox, banner and header snippets. Everything is in card units.
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
  for (const slot of SNIPPET_DRAW_ORDER) drawSnippet(ctx, design, slot, resources)

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

/**
 * One Text snippet: its background (#26), then its text. The outline is strokeText first, at
 * twice the outline width with round joins, then fillText on top, so the fill covers the
 * stroke's inner half (research §3). No maxWidth: the layout already wrapped the lines.
 */
function drawSnippet(ctx: RenderContext, design: CardDesign, slot: SnippetSlot, resources: RenderResources) {
  const snippet = design.snippets[slot]
  const text = resources.text
  if (!snippet || !text) return
  const layout = text.layout(snippet)

  ctx.save()
  ctx.font = fontString(text.family(snippet.font), layout.fontSize)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (layout.outlineWidth > 0) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = layout.outlineWidth * 2
    ctx.strokeStyle = snippet.outlineColor
    for (const line of layout.lines) ctx.strokeText(line.text, line.x, line.baseline)
  }
  ctx.fillStyle = snippet.color
  for (const line of layout.lines) ctx.fillText(line.text, line.x, line.baseline)
  ctx.restore()
}
