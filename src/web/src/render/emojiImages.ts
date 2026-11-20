import type { ImageSource } from './renderCard'

// Twemoji SVGs, loaded once each. They only have a viewBox, and some browsers (Firefox) cannot
// drawImage an SVG without an intrinsic size, so each one is fetched, given a width and height,
// and loaded from a same-origin blob URL. Same-origin images keep the canvas untainted, so
// toBlob() keeps working for the export.

const cache = new Map<string, Promise<ImageSource>>()

/** Gives an SVG an intrinsic size (the drawn size comes from drawImage anyway). */
export function withIntrinsicSize(svg: string, size = 72): string {
  return svg.replace(/<svg\b(?![^>]*\bwidth=)/, `<svg width="${size}" height="${size}"`)
}

export function loadEmoji(baseUrl: string, file: string): Promise<ImageSource> {
  const url = `${baseUrl}${file}.svg`
  let pending = cache.get(url)
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`No Twemoji for ${file}`)
      const svg = withIntrinsicSize(await response.text())
      const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      const image = new Image()
      image.src = blobUrl
      await image.decode()
      return image
    })()
    // A missing emoji stays missing for this page (it is drawn as text instead).
    cache.set(url, pending)
  }
  return pending
}
