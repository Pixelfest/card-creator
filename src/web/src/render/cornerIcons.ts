import { CARD_HEIGHT, CARD_WIDTH } from './units'

// Corner icons: one library icon, drawn in any of the four corners (docs/spec.md, section 6).

export type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
export const CORNERS: readonly Corner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']

export const CORNER_LABELS: Record<Corner, string> = {
  topLeft: 'Top left',
  topRight: 'Top right',
  bottomLeft: 'Bottom left',
  bottomRight: 'Bottom right',
}

/** The icon, its corners and its size and place, shared by every ticked corner. */
export type CornerIcons = {
  /** Asset path of the icon (e.g. "icons/star.png"), or null. */
  icon: string | null
  /** The corners that show the icon, in any combination. */
  corners: Corner[]
  /** Icon width as a percentage of the Card (frame) width, 2–40; not related to the image size. */
  size: number
  /** Distance from the top or bottom edge, as a percentage of the Card height, 0–20. */
  insetY: number
  /** Distance from the left or right edge, as a percentage of the Card width, 0–20. */
  insetX: number
}

export const MIN_ICON_SIZE = 2
export const MAX_ICON_SIZE = 40
export const MAX_ICON_INSET = 20

export const DEFAULT_CORNER_ICONS: CornerIcons = { icon: null, corners: [], size: 10, insetY: 0, insetX: 0 }

/** Old Cards have no corner icons; a missing value means the defaults (nothing drawn). */
export function cornerIconsOf(design: { cornerIcons?: CornerIcons }): CornerIcons {
  return design.cornerIcons ?? DEFAULT_CORNER_ICONS
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export type IconRect = { corner: Corner; x: number; y: number; width: number; height: number }

/**
 * Where each ticked corner's icon goes, in card units. The icon is anchored at its outer
 * corner, so a bigger size grows towards the middle of the Card. `aspect` is the image's
 * width / height; the size is the width, the height follows. Offsets are mirrored per corner.
 */
export function cornerIconRects(settings: CornerIcons, aspect: number): IconRect[] {
  if (!(aspect > 0)) return []
  const width = (clamp(settings.size, MIN_ICON_SIZE, MAX_ICON_SIZE) / 100) * CARD_WIDTH
  const height = width / aspect
  const insetX = (clamp(settings.insetX, 0, MAX_ICON_INSET) / 100) * CARD_WIDTH
  const insetY = (clamp(settings.insetY, 0, MAX_ICON_INSET) / 100) * CARD_HEIGHT
  return CORNERS.filter((corner) => settings.corners.includes(corner)).map((corner) => ({
    corner,
    x: corner.endsWith('Left') ? insetX : CARD_WIDTH - insetX - width,
    y: corner.startsWith('top') ? insetY : CARD_HEIGHT - insetY - height,
    width,
    height,
  }))
}
