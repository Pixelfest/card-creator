import { describe, expect, it } from 'vitest'
import type { AssetManifest } from '../assets/api'
import type { CardDesign } from '../editor/model'
import { newSnippet } from '../editor/snippets'
import type { Measurer } from '../text/layout'
import { createTextResources } from '../text/textResources'
import { withIntrinsicSize } from './emojiImages'
import { emojiKey, renderCard, type ImageSource, type RenderContext } from './renderCard'
import { imageRequests } from './useRenderResources'
import { cardWarnings } from './warnings'
import { EXPORT_TARGET } from './units'

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

const image = (name: string) => ({ width: 72, height: 72, toString: () => name }) as unknown as ImageSource
const measurer: Measurer = { width: (t, _f, size) => Array.from(t).length * size * 0.5, metrics: () => ({ ascent: 0.8, descent: 0.2 }) }
const manifest: AssetManifest = {
  frames: [],
  fonts: [],
  snippetBackgrounds: [{ path: 'snippet-backgrounds/scroll.png', displayName: 'Scroll', url: '/assets/s/scroll.png', aspectRatio: 4 }],
  icons: [],
  backs: [],
  emoji: { baseUrl: '/assets/emoji/abc/' },
}
const text = createTextResources({ families: new Map(), failed: new Set() }, measurer, manifest)

const designWith = (snippet: Partial<ReturnType<typeof newSnippet>>): CardDesign => ({
  fill: '#fff',
  frame: null,
  artwork: null,
  snippets: { banner: { ...newSnippet('banner', null), ...snippet } },
})

describe('drawing backgrounds and emoji', () => {
  it('fills the box with the background, then draws text runs and the emoji image', () => {
    const { ctx, calls } = recorder()
    const design = designWith({ text: 'Hot 🔥', background: 'snippet-backgrounds/scroll.png', zoom: 100 })
    const images = new Map([
      ['snippet-backgrounds/scroll.png', image('scroll')],
      [emojiKey('1f525'), image('fire')],
    ])

    renderCard(ctx, design, { images, text }, EXPORT_TARGET)

    const drawing = calls.filter((c) => /^(drawImage|fillText|strokeText)/.test(c))
    const layout = text.layout(design.snippets.banner!)
    expect(layout.box.height).toBeCloseTo(520 / 4)
    expect(drawing[0]).toBe(`drawImage(scroll,${layout.box.x},${layout.box.y},${layout.box.width},${layout.box.height})`)
    expect(drawing[1]).toMatch(/^fillText\(Hot ,/)
    expect(drawing[2]).toMatch(/^drawImage\(fire,/)
    expect(drawing).toHaveLength(3) // the emoji is never passed to fillText or strokeText
  })

  it('never strokes an emoji, even with an outline', () => {
    const { ctx, calls } = recorder()
    const design = designWith({ text: '🔥🔥', outline: true })

    renderCard(ctx, design, { images: new Map([[emojiKey('1f525'), image('fire')]]), text }, EXPORT_TARGET)

    expect(calls.some((c) => c.startsWith('strokeText(🔥'))).toBe(false)
    expect(calls.filter((c) => c.startsWith('drawImage(fire'))).toHaveLength(2)
  })

  it('falls back to the font glyph for an emoji without a Twemoji file', () => {
    const { ctx, calls } = recorder()

    renderCard(ctx, designWith({ text: 'A🔥' }), { images: new Map(), text }, EXPORT_TARGET)

    expect(calls.some((c) => c.startsWith('fillText(🔥'))).toBe(true)
  })
})

describe('imageRequests', () => {
  it('asks for the Frame, backgrounds, Artwork and every distinct emoji', () => {
    const design: CardDesign = {
      fill: '#fff',
      frame: null,
      artwork: { id: 'art1', width: 10, height: 10, zoom: 1, x: 0, y: 0 },
      snippets: {
        header: { ...newSnippet('header', null), text: 'A 🔥 B 🔥', background: 'snippet-backgrounds/scroll.png' },
        textbox: { ...newSnippet('textbox', null), text: '🐉', background: 'snippet-backgrounds/gone.png' },
      },
    }

    const keys = imageRequests(design, manifest, (id) => `/art/${id}`).map((r) => r.key)

    expect(keys).toEqual(['artwork:art1', 'snippet-backgrounds/scroll.png', 'emoji:1f525', 'emoji:1f409'])
  })
})

describe('withIntrinsicSize', () => {
  it('gives a viewBox-only SVG a width and height, and leaves sized ones alone', () => {
    expect(withIntrinsicSize('<svg xmlns="x" viewBox="0 0 36 36"><path/></svg>')).toBe(
      '<svg width="72" height="72" xmlns="x" viewBox="0 0 36 36"><path/></svg>',
    )
    expect(withIntrinsicSize('<svg width="10" viewBox="0 0 1 1"/>')).toBe('<svg width="10" viewBox="0 0 1 1"/>')
  })
})

describe('missing background', () => {
  it('is flagged on its snippet', () => {
    const design = designWith({ background: 'snippet-backgrounds/gone.png' })
    expect(cardWarnings(design, manifest)).toEqual([{ part: 'banner', message: 'The background “gone.png” is missing.' }])
  })
})
