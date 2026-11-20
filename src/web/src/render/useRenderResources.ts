import { useEffect, useMemo, useState } from 'react'
import { useAssets } from '../assets/api'
import type { CardDesign } from '../editor/model'
import { loadImage } from './images'
import type { ImageSource, RenderResources } from './renderCard'

/** Asset paths a design draws as images. Later slices add Artwork and Snippet backgrounds. */
export function imagePaths(design: CardDesign): string[] {
  return design.frame ? [design.frame] : []
}

/**
 * Loads the images a design needs and returns them by asset path. Paths the library does not
 * have are left out: the renderer skips them and the Card shows a warning.
 */
export function useRenderResources(design: CardDesign): RenderResources {
  const manifest = useAssets().data
  const [images, setImages] = useState<ReadonlyMap<string, ImageSource>>(new Map())

  const wanted = useMemo(() => {
    if (!manifest) return []
    const urls = new Map(manifest.frames.map((f) => [f.path, f.url]))
    return imagePaths(design).flatMap((path) => (urls.has(path) ? [[path, urls.get(path)!] as const] : []))
  }, [design, manifest])

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
