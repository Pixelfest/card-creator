import type { AssetManifest } from '../assets/api'
import { SNIPPET_SLOTS, type CardDesign } from '../editor/model'
import { SLOT_LABELS } from '../editor/snippets'
import type { TextResources } from '../text/textResources'

// One place that decides what is wrong with a Card. The card list shows ⚠, the affected
// control shows the message, and the export lists them (#27).

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
  for (const slot of SNIPPET_SLOTS) {
    const snippet = design.snippets[slot]
    if (snippet?.font && !manifest.fonts.some((f) => f.path === snippet.font)) {
      warnings.push({ part: slot, message: `The font “${fileName(snippet.font)}” is missing; a fallback font is shown.` })
    }
  }
  return warnings
}

/**
 * Snippet problems that need fonts and measuring: a font that failed to load (drawn in the
 * fallback, never silently) and text that doesn't fit even at 50%.
 */
export function textWarnings(design: CardDesign, text: TextResources | undefined): CardWarning[] {
  if (!text) return []
  const warnings: CardWarning[] = []
  for (const slot of SNIPPET_SLOTS) {
    const snippet = design.snippets[slot]
    if (!snippet) continue
    if (snippet.font && text.fonts.failed.has(snippet.font)) {
      warnings.push({ part: slot, message: `The font “${fileName(snippet.font)}” couldn't be loaded; a fallback font is shown.` })
    }
    if (!text.layout(snippet).fits) {
      warnings.push({ part: slot, message: `The ${SLOT_LABELS[slot].toLowerCase()} text doesn't fit.` })
    }
  }
  return warnings
}

/** All warnings for a Card. */
export function cardWarnings(
  design: CardDesign,
  manifest: AssetManifest | undefined,
  text?: TextResources,
): CardWarning[] {
  return [...missingAssetWarnings(design, manifest), ...textWarnings(design, text)]
}
