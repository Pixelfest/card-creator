import type { AssetManifest } from '../assets/api'
import type { Card } from '../editor/model'
import { printImage, renderCardToPng } from '../render/exportCard'
import { SNIPPET_DRAW_ORDER } from '../editor/snippets'
import type { SnippetSlot } from '../editor/model'
import { emojiKey, snippetText, type ImageSource, type SnippetText } from '../render/renderCard'
import { imageRequests } from '../render/useRenderResources'
import type { TextResources } from '../text/textResources'
import { expandCopies, type PrintLayout } from './layout'

// The rendering half of export: render each selected Card once, then hand the printed list
// (each Card's Copies consecutive) to the PDF builder.

/** One rendered Card: its print PNG, plus the text the PDF draws over it as vector text. */
export type PrintCard = { png: Uint8Array; text: SnippetText[] }

export type ExportProgress = { done: number; total: number }

export type ExportInput = {
  cards: readonly Card[]
  selected: ReadonlySet<string>
  manifest: AssetManifest | undefined
  text: TextResources
  artworkUrl: (id: string) => string
  /** The printed Card size and the page grid. */
  layout: PrintLayout
  onProgress?: (progress: ExportProgress) => void
}

/**
 * Renders each selected Card once to its print PNG (`printImage` at the layout's Card width), after
 * loading every image it needs, and passes `build` one entry per printed card: the same
 * PrintCard for every Copy, in card-list order. An image that fails to load fails the export
 * (it would be silently missing from the print), except an emoji, which falls back to text
 * exactly as in the editor. Building counts as the last progress step.
 *
 * Every snippet whose font loaded and has a TrueType/OpenType file to embed
 * (the manifest's `embedUrl`) is left out of the PNG and returned as text runs instead, for the
 * PDF to draw as real text. Any other snippet (on the fallback font, or a WOFF2-only font)
 * stays in the image, since there is no font file a PDF viewer can read.
 */
export async function renderPrintCards<T>(
  { cards, selected, manifest, text, artworkUrl, layout, onProgress }: ExportInput,
  build: (cards: PrintCard[]) => Promise<T>,
): Promise<T> {
  const unique = cards.filter((card) => selected.has(card.id) && card.copies > 0)
  const total = unique.length + 1
  const loaded = new Map<string, Promise<ImageSource | undefined>>()
  const printed = new Map<string, PrintCard>()
  const image = printImage(layout.cardMm.width)
  const embeddable = new Set(manifest?.fonts.filter((f) => f.embedUrl).map((f) => f.path))

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
    const vector = new Set<SnippetSlot>()
    const runs: SnippetText[] = []
    for (const slot of SNIPPET_DRAW_ORDER) {
      const font = card.design.snippets[slot]?.font
      if (!font || !text.fonts.families.has(font) || !embeddable.has(font)) continue
      const placed = snippetText(card.design, slot, text)
      if (!placed) continue
      vector.add(slot)
      runs.push(placed)
    }
    const blob = await renderCardToPng(card.design, { images, text, vectorText: vector }, image)
    printed.set(card.id, { png: new Uint8Array(await blob.arrayBuffer()), text: runs })
    onProgress?.({ done: i + 1, total })
  }

  const result = await build(expandCopies(unique).map((card) => printed.get(card.id)!))
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
