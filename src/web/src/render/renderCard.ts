import type { CardDesign } from '../editor/model'
import { artworkRect } from './artwork'
import { CARD_HEIGHT, CARD_WIDTH, type RenderTarget } from './units'

/** Decoded images by URL. Only same-origin URLs go in, so the canvas is never tainted. */
export type ImageSource = CanvasImageSource & { width: number; height: number }

/** Everything a render needs that is not in the design itself. */
export type RenderResources = {
  /** Frame and Snippet background images by asset path; Artwork by `artworkKey(id)`. */
  images: ReadonlyMap<string, ImageSource>
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

/** Bottom to top: the header is drawn last, so it sits on top. */
export const SNIPPET_DRAW_ORDER = ['textbox', 'banner', 'header'] as const

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

function drawSnippet(
  _ctx: RenderContext,
  _design: CardDesign,
  _slot: (typeof SNIPPET_DRAW_ORDER)[number],
  _resources: RenderResources,
) {
  // Text snippets arrive with #25: background first, then text.
}
