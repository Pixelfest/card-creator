import type { AssetManifest } from '../assets/api'
import type { Card } from '../editor/model'
import { renderCardToPng } from '../render/exportCard'
import { emojiKey, type ImageSource } from '../render/renderCard'
import { imageRequests } from '../render/useRenderResources'
import type { TextResources } from '../text/textResources'
import { expandCopies } from './layout'

// The part of export shared by Word and PDF: render each selected Card once, then hand the
// printed list (each Card's Copies consecutive) to the format's builder.

export type ExportProgress = { done: number; total: number }

export type ExportInput = {
  cards: readonly Card[]
  selected: ReadonlySet<string>
  manifest: AssetManifest | undefined
  text: TextResources
  artworkUrl: (id: string) => string
  onProgress?: (progress: ExportProgress) => void
}

/**
 * Renders each selected Card once to a 568×898 PNG (520×850 plus the cut border), after
 * loading every image it needs, and passes `build` one entry per printed card: the same
 * Uint8Array for every Copy, in card-list order. An image that fails to load fails the export
 * (it would be silently missing from the print), except an emoji, which falls back to text
 * exactly as in the editor. Building counts as the last progress step.
 */
export async function renderPrintImages<T>(
  { cards, selected, manifest, text, artworkUrl, onProgress }: ExportInput,
  build: (images: Uint8Array[]) => Promise<T>,
): Promise<T> {
  const unique = cards.filter((card) => selected.has(card.id) && card.copies > 0)
  const total = unique.length + 1
  const loaded = new Map<string, Promise<ImageSource | undefined>>()
  const pngs = new Map<string, Uint8Array>()

  onProgress?.({ done: 0, total })
  for (const [i, card] of unique.entries()) {
    const images = new Map<string, ImageSource>()
    for (const { key, load } of imageRequests(card.design, manifest, artworkUrl)) {
      let pending = loaded.get(key)
      if (!pending) {
        const optional = key.startsWith(emojiKey(''))
        pending = load().catch((error: unknown) => {
          if (optional) return undefined
          throw error
        })
        loaded.set(key, pending)
      }
      let image: ImageSource | undefined
      try {
        image = await pending
      } catch {
        throw new Error(`Couldn't load an image for “${card.name}”.`)
      }
      if (image) images.set(key, image)
    }
    const blob = await renderCardToPng(card.design, { images, text })
    pngs.set(card.id, new Uint8Array(await blob.arrayBuffer()))
    onProgress?.({ done: i + 1, total })
  }

  const result = await build(expandCopies(unique).map((card) => pngs.get(card.id)!))
  onProgress?.({ done: total, total })
  return result
}

/** Saves a Blob as a download. */
export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
