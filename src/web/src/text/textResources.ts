import type { AssetManifest } from '../assets/api'
import type { Snippet } from '../editor/model'
import { withEmoji } from './emoji'
import { FALLBACK_FAMILY, type FontState } from './fonts'
import { layoutSnippet, type Measurer, type SnippetLayout } from './layout'

/** What drawing and checking snippets needs: font families, measurement and layout. */
export type TextResources = {
  fonts: FontState
  /** The family to draw a snippet's font with (the fallback when missing or failed). */
  family(font: string | null): string
  /** The snippet's layout, computed once per distinct snippet. */
  layout(snippet: Snippet): SnippetLayout
  /** Snippet background aspect (width/height) by asset path. */
  backgroundAspect(path: string | null): number | undefined
  /** Width of plain text (no emoji) in card units. */
  measureText(text: string, family: string, size: number): number
  /** Font ascent and descent as fractions of the size. */
  metrics(family: string): { ascent: number; descent: number }
}

export function createTextResources(
  fonts: FontState,
  measurer: Measurer,
  manifest: AssetManifest | undefined,
): TextResources {
  const backgrounds = new Map(manifest?.snippetBackgrounds.map((b) => [b.path, b.aspectRatio ?? undefined]) ?? [])
  const family = (font: string | null) => (font && fonts.families.get(font)) || FALLBACK_FAMILY
  const backgroundAspect = (path: string | null) => (path ? backgrounds.get(path) : undefined)
  const cache = new Map<string, SnippetLayout>()
  // Emoji are drawn as images with a fixed advance, so lines are measured that way too.
  const lineMeasurer = withEmoji(measurer)

  return {
    fonts,
    family,
    backgroundAspect,
    measureText: (text, fam, size) => measurer.width(text, fam, size),
    metrics: (fam) => measurer.metrics(fam),
    layout(snippet) {
      const key = JSON.stringify(snippet)
      let layout = cache.get(key)
      if (!layout) {
        layout = layoutSnippet(snippet, family(snippet.font), lineMeasurer, backgroundAspect(snippet.background))
        if (cache.size > 500) cache.clear()
        cache.set(key, layout)
      }
      return layout
    },
  }
}
