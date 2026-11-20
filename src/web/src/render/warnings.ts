import type { AssetManifest } from '../assets/api'
import type { CardDesign } from '../editor/model'

// One place that decides what is wrong with a Card. The card list shows ⚠, the affected
// control shows the message, and the export lists them (#27). Later slices add missing
// fonts and backgrounds (#25, #26) and "text doesn't fit".

export type CardPart = 'card' | 'artwork' | 'frame' | 'header' | 'banner' | 'textbox'

export type CardWarning = { part: CardPart; message: string }

/** File name of an asset path, for messages: "frames/44x72/gold.png" → "gold.png". */
function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

/**
 * Assets the design refers to that the library no longer has. A Card keeps such paths and
 * renders without them (spec section 5). Returns nothing until the manifest has loaded.
 */
export function missingAssetWarnings(design: CardDesign, manifest: AssetManifest | undefined): CardWarning[] {
  if (!manifest) return []
  const warnings: CardWarning[] = []
  if (design.frame && !manifest.frames.some((f) => f.path === design.frame)) {
    warnings.push({ part: 'frame', message: `The Frame “${fileName(design.frame)}” is missing.` })
  }
  return warnings
}

/** All warnings for a Card. */
export function cardWarnings(design: CardDesign, manifest: AssetManifest | undefined): CardWarning[] {
  return missingAssetWarnings(design, manifest)
}
