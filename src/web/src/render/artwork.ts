import { CARD_HEIGHT, CARD_WIDTH } from './units'

// Artwork placement (docs/spec.md, section 6), in card units. New Artwork covers the Card;
// the user can then pan and zoom freely, and any uncovered area shows the fill colour.

/** The Artwork as a Card's design stores it. */
export type ArtworkRef = {
  /** The uploaded file (shared by duplicated Cards). */
  id: string
  /** Pixel size of the stored image, so placement needs no download. */
  width: number
  height: number
  /** 1 = exactly covering the Card. */
  zoom: number
  /** Offset of the image centre from the Card centre, in card units. */
  x: number
  y: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export type Rect = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }

/** The scale at which the image just covers the Card. */
export function coverScale(width: number, height: number): number {
  return Math.max(CARD_WIDTH / width, CARD_HEIGHT / height)
}

/** Where the image is drawn, in card units. */
export function artworkRect(artwork: ArtworkRef): Rect {
  const scale = coverScale(artwork.width, artwork.height) * artwork.zoom
  const width = artwork.width * scale
  const height = artwork.height * scale
  return {
    x: CARD_WIDTH / 2 + artwork.x - width / 2,
    y: CARD_HEIGHT / 2 + artwork.y - height / 2,
    width,
    height,
  }
}

/** New Artwork, or "Reset to cover": centred and exactly covering. */
export function coverPlacement(artwork: Pick<ArtworkRef, 'id' | 'width' | 'height'>): ArtworkRef {
  return { id: artwork.id, width: artwork.width, height: artwork.height, zoom: 1, x: 0, y: 0 }
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function pan(artwork: ArtworkRef, dx: number, dy: number): ArtworkRef {
  return { ...artwork, x: artwork.x + dx, y: artwork.y + dy }
}

/**
 * Zooms by `factor`, keeping the part of the image under `at` (card units) where it is: the
 * scroll wheel "zooms the part under the pointer".
 */
export function zoomAt(artwork: ArtworkRef, factor: number, at: Point): ArtworkRef {
  const zoom = clampZoom(artwork.zoom * factor)
  const applied = zoom / artwork.zoom
  const centre = { x: CARD_WIDTH / 2 + artwork.x, y: CARD_HEIGHT / 2 + artwork.y }
  const next = { x: at.x + (centre.x - at.x) * applied, y: at.y + (centre.y - at.y) * applied }
  return { ...artwork, zoom, x: next.x - CARD_WIDTH / 2, y: next.y - CARD_HEIGHT / 2 }
}

/** Zoom about the Card centre (the zoom slider). */
export function withZoom(artwork: ArtworkRef, zoom: number): ArtworkRef {
  return zoomAt(artwork, clampZoom(zoom) / artwork.zoom, { x: CARD_WIDTH / 2, y: CARD_HEIGHT / 2 })
}

/** Whether the image leaves part of the Card uncovered (so the fill colour shows). */
export function coversCard(artwork: ArtworkRef): boolean {
  const r = artworkRect(artwork)
  const eps = 1e-6
  return r.x <= eps && r.y <= eps && r.x + r.width >= CARD_WIDTH - eps && r.y + r.height >= CARD_HEIGHT - eps
}

/** A point on the preview canvas (CSS px from its top-left) in card units. */
export function toCardUnits(point: Point, cssWidth: number): Point {
  const scale = CARD_WIDTH / cssWidth
  return { x: point.x * scale, y: point.y * scale }
}

/** Wheel delta → zoom factor: smooth, and the same distance in or out cancels out. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015)
}
