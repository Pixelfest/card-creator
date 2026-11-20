import type { ImageSource } from './renderCard'

// Decoded images, cached by URL for the life of the page. Asset URLs are content-hashed, so a
// cached image never goes stale.

const cache = new Map<string, Promise<ImageSource>>()

export function loadImage(url: string): Promise<ImageSource> {
  let pending = cache.get(url)
  if (!pending) {
    pending = (async () => {
      const image = new Image()
      image.decoding = 'async'
      image.src = url
      await image.decode()
      return image
    })()
    // A failed load is not cached, so it can be retried.
    pending.catch(() => cache.delete(url))
    cache.set(url, pending)
  }
  return pending
}
