import { useEffect, useMemo, useState } from 'react'
import { useAssets, type AssetManifest } from '../assets/api'
import { SNIPPET_SLOTS, type CardDesign } from '../editor/model'
import { emojiFiles } from '../text/emoji'
import { loadEmoji } from './emojiImages'
import { loadImage } from './images'
import { artworkKey, emojiKey, type ImageSource } from './renderCard'

export type ImageRequest = { key: string; load: () => Promise<ImageSource> }

/**
 * Every image a design draws, as (key, loader) pairs: the Frame and Snippet backgrounds by
 * asset path, the Artwork, and the Twemoji for emoji in snippet text. Assets the library does
 * not have are left out: the renderer skips them and the Card shows a warning. The preview and
 * the export (#27) use the same list.
 */
export function imageRequests(
  design: CardDesign,
  manifest: AssetManifest | undefined,
  artworkUrl: (id: string) => string,
): ImageRequest[] {
  const requests: ImageRequest[] = []
  if (design.artwork) {
    const url = artworkUrl(design.artwork.id)
    requests.push({ key: artworkKey(design.artwork.id), load: () => loadImage(url) })
  }
  if (!manifest) return requests

  const assetUrls = new Map([...manifest.frames, ...manifest.snippetBackgrounds].map((a) => [a.path, a.url]))
  const paths = [design.frame, ...SNIPPET_SLOTS.map((slot) => design.snippets[slot]?.background)]
  for (const path of new Set(paths)) {
    const url = path ? assetUrls.get(path) : undefined
    if (path && url) requests.push({ key: path, load: () => loadImage(url) })
  }

  const emojiBase = manifest.emoji?.baseUrl
  if (emojiBase) {
    const files = new Set(SNIPPET_SLOTS.flatMap((slot) => emojiFiles(design.snippets[slot]?.text ?? '')))
    for (const file of files) requests.push({ key: emojiKey(file), load: () => loadEmoji(emojiBase, file) })
  }
  return requests
}

/** Loads (and keeps) the images a design needs, by key; missing ones simply stay absent. */
export function useRenderResources(design: CardDesign, artworkUrl: (id: string) => string) {
  const manifest = useAssets().data
  const [images, setImages] = useState<ReadonlyMap<string, ImageSource>>(new Map())
  const wanted = useMemo(() => imageRequests(design, manifest, artworkUrl), [design, manifest, artworkUrl])

  useEffect(() => {
    let cancelled = false
    for (const { key, load } of wanted) {
      if (images.has(key)) continue
      load()
        .then((image) => {
          if (!cancelled) setImages((current) => new Map(current).set(key, image))
        })
        .catch(() => {
          // Missing: the renderer skips it (an emoji falls back to text).
        })
    }
    return () => {
      cancelled = true
    }
  }, [wanted, images])

  return useMemo(() => ({ images }), [images])
}
