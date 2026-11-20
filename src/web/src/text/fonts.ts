import { useQuery } from '@tanstack/react-query'
import { useAssets, type Asset } from '../assets/api'

// Fonts (docs/spec.md, section 6; research §1): canvas does not wait for fonts and silently
// draws a fallback if one is not loaded yet. So every library font is loaded explicitly with
// FontFace → document.fonts.add → await load() before anything is drawn, and a font that fails
// is reported on the snippet instead of quietly printing the fallback.

/** Drawn when a snippet's font is missing or failed (with a warning). */
export const FALLBACK_FAMILY = 'serif'

export type FontState = {
  /** Asset path → the CSS family name it was registered under. */
  families: ReadonlyMap<string, string>
  /** Asset paths whose font file failed to load. */
  failed: ReadonlySet<string>
}

export const NO_FONTS: FontState = { families: new Map(), failed: new Set() }

/** A family name unique to the file's content, so a changed font never reuses a cached face. */
export function familyName(asset: Pick<Asset, 'url'>): string {
  const hash = asset.url.split('/')[2] ?? asset.url
  return `cc-font-${hash}`
}

export async function loadFonts(fonts: readonly Asset[]): Promise<FontState> {
  const families = new Map<string, string>()
  const failed = new Set<string>()
  await Promise.all(
    fonts.map(async (font) => {
      const family = familyName(font)
      if (typeof FontFace === 'undefined' || !document.fonts) {
        // No FontFace API (tests): measure with the name and move on.
        families.set(font.path, family)
        return
      }
      try {
        const face = new FontFace(family, `url("${font.url}")`)
        document.fonts.add(face)
        await face.load()
        families.set(font.path, family)
      } catch {
        failed.add(font.path)
      }
    }),
  )
  return { families, failed }
}

/** All library fonts, loaded once per page. `data` is set only once every load settled. */
export function useFonts() {
  const manifest = useAssets().data
  return useQuery({
    queryKey: ['fonts', manifest?.fonts.map((f) => f.url)],
    queryFn: () => loadFonts(manifest!.fonts),
    enabled: !!manifest,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
