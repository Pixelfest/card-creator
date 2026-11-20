import { describe, expect, it } from 'vitest'
import type { CardDesign } from '../editor/model'
import { coverPlacement } from './artwork'
import { artworkKey, renderCard, SNIPPET_DRAW_ORDER, type ImageSource, type RenderContext } from './renderCard'
import { previewTarget } from './units'

/** Records what the renderer asks the canvas to do. */
function recorder() {
  const calls: string[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_, name: string) => (...args: unknown[]) => calls.push(`${name}(${args.map(String).join(',')})`),
    set: (_, name: string, value) => {
      calls.push(`${name}=${String(value)}`)
      return true
    },
  }) as unknown as RenderContext
  return { ctx, calls }
}

const frame = { width: 520, height: 850, toString: () => 'frameImage' } as unknown as ImageSource
const design: CardDesign = { fill: '#123456', frame: 'frames/44x72/gold.png', artwork: null, snippets: {} }

describe('renderCard', () => {
  it('scales card units once, clips to the card, then fills and draws the Frame on top', () => {
    const { ctx, calls } = recorder()

    renderCard(ctx, design, { images: new Map([['frames/44x72/gold.png', frame]]) }, previewTarget(260, 2))

    expect(calls).toEqual([
      'save()',
      'setTransform(1,0,0,1,0,0)',
      'clearRect(0,0,520,850)',
      'scale(1,1)',
      'imageSmoothingEnabled=true',
      'imageSmoothingQuality=high',
      'beginPath()',
      'rect(0,0,520,850)',
      'clip()',
      'fillStyle=#123456',
      'fillRect(0,0,520,850)',
      'drawImage(frameImage,0,0,520,850)',
      'restore()',
    ])
  })

  it('draws in card units at any scale', () => {
    const { ctx, calls } = recorder()

    renderCard(ctx, design, { images: new Map([['frames/44x72/gold.png', frame]]) }, previewTarget(260, 1))

    expect(calls).toContain('scale(0.5,0.5)')
    expect(calls).toContain('fillRect(0,0,520,850)')
  })

  it('skips a Frame whose image is missing', () => {
    const { ctx, calls } = recorder()

    renderCard(ctx, design, { images: new Map() }, previewTarget(260, 1))

    expect(calls.some((c) => c.startsWith('drawImage'))).toBe(false)
  })

  it('draws the Artwork between the fill and the Frame, placed to cover', () => {
    const { ctx, calls } = recorder()
    const art = { width: 2000, height: 1000, toString: () => 'artImage' } as unknown as ImageSource
    const withArtwork = { ...design, artwork: coverPlacement({ id: 'art1', width: 2000, height: 1000 }) }

    renderCard(
      ctx,
      withArtwork,
      { images: new Map([[artworkKey('art1'), art], ['frames/44x72/gold.png', frame]]) },
      previewTarget(260, 2),
    )

    const drawing = calls.filter((c) => c.startsWith('fillRect') || c.startsWith('drawImage'))
    expect(drawing).toEqual(['fillRect(0,0,520,850)', 'drawImage(artImage,-590,0,1700,850)', 'drawImage(frameImage,0,0,520,850)'])
  })

  it('draws the snippet slots bottom to top: textbox, banner, header', () => {
    expect(SNIPPET_DRAW_ORDER).toEqual(['textbox', 'banner', 'header'])
  })
})
