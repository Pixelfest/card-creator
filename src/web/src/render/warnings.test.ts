import { describe, expect, it } from 'vitest'
import type { AssetManifest } from '../assets/api'
import type { CardDesign } from '../editor/model'
import { newSnippet } from '../editor/snippets'
import type { Measurer } from '../text/layout'
import { createTextResources } from '../text/textResources'
import { cardWarnings, missingAssetWarnings } from './warnings'

const manifest: AssetManifest = {
  frames: [{ path: 'frames/44x72/gold.png', displayName: 'Gold', url: '/assets/1/frames/44x72/gold.png', aspectRatio: 0.61 }],
  fonts: [{ path: 'fonts/Ok.woff2', displayName: 'Ok', url: '/assets/2/fonts/Ok.woff2', aspectRatio: null },
    { path: 'fonts/Broken.woff2', displayName: 'Broken', url: '/assets/3/fonts/Broken.woff2', aspectRatio: null }],
  snippetBackgrounds: [],
  icons: [{ path: 'icons/star.png', displayName: 'Star', url: '/assets/4/icons/star.png', aspectRatio: 1 }],
  backs: [{ path: 'backs/navy.png', displayName: 'Navy', url: '/assets/5/backs/navy.png', aspectRatio: 0.63 }],
  emoji: null,
}
const design = (frame: string | null): CardDesign => ({ fill: '#fff', frame, artwork: null, snippets: {} })

describe('missing-asset detection', () => {
  const withIcons = (icon: string, corners: CardDesign['cornerIcons'] extends infer T ? (T extends { corners: infer C } ? C : never) : never): CardDesign => ({
    ...design(null),
    cornerIcons: { icon, corners, size: 8, insetY: 4, insetX: 4 },
  })

  it('flags a corner icon the library no longer has, only while a corner shows it', () => {
    expect(missingAssetWarnings(withIcons('icons/gone.png', ['topLeft']), manifest)).toEqual([
      { part: 'cornerIcons', message: 'The icon “gone.png” is missing.' },
    ])
    expect(missingAssetWarnings(withIcons('icons/gone.png', []), manifest)).toEqual([])
    expect(missingAssetWarnings(withIcons('icons/star.png', ['topLeft']), manifest)).toEqual([])
  })

  it('flags a Frame the library no longer has', () => {
    expect(missingAssetWarnings(design('frames/44x72/gone.png'), manifest)).toEqual([
      { part: 'frame', message: 'The Frame “gone.png” is missing.' },
    ])
  })

  it('is quiet for a Frame that exists, for no Frame, and before the library has loaded', () => {
    expect(missingAssetWarnings(design('frames/44x72/gold.png'), manifest)).toEqual([])
    expect(missingAssetWarnings(design(null), manifest)).toEqual([])
    expect(missingAssetWarnings(design('frames/44x72/gone.png'), undefined)).toEqual([])
  })

  it('feeds the shared Card warnings', () => {
    expect(cardWarnings(design('frames/44x72/gone.png'), manifest).map((w) => w.part)).toEqual(['frame'])
  })
})

describe('snippet warnings', () => {
  const measurer: Measurer = { width: (t, _f, size) => t.length * size * 0.5, metrics: () => ({ ascent: 0.8, descent: 0.2 }) }
  const text = createTextResources(
    { families: new Map([['fonts/Ok.woff2', 'ok']]), failed: new Set(['fonts/Broken.woff2']) },
    measurer,
    manifest,
  )

  it('flags a missing font, a font that failed to load, and text that does not fit', () => {
    const d: CardDesign = {
      ...design(null),
      snippets: {
        header: { ...newSnippet('header', 'fonts/Gone.woff2'), text: 'Hi' },
        banner: { ...newSnippet('banner', 'fonts/Broken.woff2'), text: 'Hi' },
        textbox: { ...newSnippet('textbox', 'fonts/Ok.woff2'), text: Array(200).fill('word').join(' '), size: 20 },
      },
    }

    expect(cardWarnings(d, manifest, text)).toEqual([
      { part: 'header', message: 'The font “Gone.woff2” is missing; a fallback font is shown.' },
      { part: 'banner', message: "The font “Broken.woff2” couldn't be loaded; a fallback font is shown." },
      { part: 'textbox', message: "The textbox text doesn't fit." },
    ])
  })

  it('is quiet for a snippet that fits in a loaded font', () => {
    const d: CardDesign = { ...design(null), snippets: { textbox: { ...newSnippet('textbox', 'fonts/Ok.woff2'), text: 'Fine' } } }
    expect(cardWarnings(d, manifest, text)).toEqual([])
  })
})
