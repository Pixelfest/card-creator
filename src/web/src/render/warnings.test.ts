import { describe, expect, it } from 'vitest'
import type { AssetManifest } from '../assets/api'
import type { CardDesign } from '../editor/model'
import { cardWarnings, missingAssetWarnings } from './warnings'

const manifest: AssetManifest = {
  frames: [{ path: 'frames/44x72/gold.png', displayName: 'Gold', url: '/assets/1/frames/44x72/gold.png', aspectRatio: 0.61 }],
  fonts: [],
  snippetBackgrounds: [],
  emoji: null,
}
const design = (frame: string | null): CardDesign => ({ fill: '#fff', frame, artwork: null, snippets: {} })

describe('missing-asset detection', () => {
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
