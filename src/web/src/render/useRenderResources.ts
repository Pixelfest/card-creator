import { useEffect, useMemo, useState } from 'react'
import { useAssets } from '../assets/api'
import type { CardDesign } from '../editor/model'
import { loadImage } from './images'
import { artworkKey, type ImageSource, type RenderResources } from './renderCard'

/** Library asset paths a design draws as images. #26 adds Snippet backgrounds. */
export function imagePaths(design: CardDesign): string[] {
  return design.frame ? [design.frame] : []
}

/**
 * Loads the images a design needs and returns them by asset path. Paths the library does not
 * have are left out: the renderer skips them and the Card shows a warning.
 */
export function useRenderResources(design: CardDesign, artworkUrl: (id: string) => string): RenderResources {
  const manifest = useAssets().data
  const [images, setImages] = useState<ReadonlyMap<string, ImageSource>>(new Map())

  const wanted = useMemo(() => {
    const result: (readonly [string, string])[] = []
    if (design.artwork) result.push([artworkKey(design.artwork.id), artworkUrl(design.artwork.id)])
    if (!manifest) return result
    const urls = new Map(manifest.frames.map((f) => [f.path, f.url]))
    for (const path of imagePaths(design)) {
      const url = urls.get(path)
      if (url) result.push([path, url])
    }
    return result
  }, [design, manifest, artworkUrl])

  useEffect(() => {
    let cancelled = false
    for (const [path, url] of wanted) {
      if (images.has(path)) continue
      loadImage(url)
        .then((image) => {
          if (!cancelled) setImages((current) => new Map(current).set(path, image))
        })
        .catch(() => {
          // Shown as missing: the renderer skips it.
        })
    }
    return () => {
      cancelled = true
    }
  }, [wanted, images])

  return useMemo(() => ({ images }), [images])
}
