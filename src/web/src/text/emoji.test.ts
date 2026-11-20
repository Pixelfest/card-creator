import { describe, expect, it } from 'vitest'
import { emojiFile, isEmoji, splitRuns, withEmoji, EMOJI_ADVANCE } from './emoji'
import { layoutSnippet, type Measurer } from './layout'
import { newSnippet } from '../editor/snippets'

describe('splitRuns', () => {
  it('splits text and emoji runs', () => {
    expect(splitRuns('Fire 🔥 dragon')).toEqual([
      { kind: 'text', text: 'Fire ' },
      { kind: 'emoji', text: '🔥', file: '1f525' },
      { kind: 'text', text: ' dragon' },
    ])
  })

  it('keeps ZWJ sequences, skin tones, flags and keycaps whole', () => {
    const runs = splitRuns('👨‍👩‍👧👍🏽🇳🇱#️⃣🏴󠁧󠁢󠁳󠁣󠁴󠁿')
    expect(runs.map((r) => r.kind)).toEqual(['emoji', 'emoji', 'emoji', 'emoji', 'emoji'])
    expect(runs.map((r) => (r.kind === 'emoji' ? r.file : ''))).toEqual([
      '1f468-200d-1f469-200d-1f467',
      '1f44d-1f3fd',
      '1f1f3-1f1f1',
      '23-20e3',
      '1f3f4-e0067-e0062-e0073-e0063-e0074-e007f',
    ])
  })

  it('treats text-style symbols as text, but emoji-style ones as emoji', () => {
    expect(splitRuns('© 2026').map((r) => r.kind)).toEqual(['text'])
    expect(isEmoji('©️')).toBe(true)
    expect(isEmoji('❤')).toBe(false) // U+2764 alone is text style
    expect(isEmoji('❤️')).toBe(true)
    expect(isEmoji('7')).toBe(false)
    expect(isEmoji('#')).toBe(false)
  })

  it('handles empty text and text without emoji', () => {
    expect(splitRuns('')).toEqual([])
    expect(splitRuns('plain')).toEqual([{ kind: 'text', text: 'plain' }])
  })
})

describe('emojiFile (Twemoji naming)', () => {
  it('drops U+FE0F unless the sequence has a ZWJ', () => {
    expect(emojiFile('❤️')).toBe('2764')
    expect(emojiFile('❤️‍🔥')).toBe('2764-fe0f-200d-1f525')
    expect(emojiFile('☺️')).toBe('263a')
  })
})

describe('measuring lines with emoji', () => {
  /** Every character is half an em; the font's own emoji glyphs would be 3 em (ignored). */
  const plain: Measurer = {
    width: (text, _f, size) => Array.from(text).reduce((w, c) => w + (/\p{Extended_Pictographic}/u.test(c) ? 3 : 0.5) * size, 0),
    metrics: () => ({ ascent: 0.8, descent: 0.2 }),
  }
  const measurer = withEmoji(plain)

  it('gives each emoji a fixed advance and measures the text around it', () => {
    expect(measurer.width('ab🔥cd', 'f', 10)).toBeCloseTo(4 * 5 + EMOJI_ADVANCE * 10)
    expect(measurer.width('👨‍👩‍👧', 'f', 10)).toBeCloseTo(EMOJI_ADVANCE * 10)
  })

  it('wraps with emoji measured as part of the line, never splitting one', () => {
    // At 5 pt (≈20.8 units) a 100% box fits about 41 half-em characters; emoji take 1.1 em.
    const text = 'Breathes fire 🔥🔥🔥 and flies 🐉 over the hills 🌄 every day'
    const layout = layoutSnippet({ ...newSnippet('textbox', null), text, size: 5, zoom: 50, position: 50 }, 'f', measurer)
    expect(layout.lines.length).toBeGreaterThan(1)
    expect(layout.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ')).toBe(text)
    for (const line of layout.lines) expect(line.width).toBeCloseTo(measurer.width(line.text, 'f', layout.fontSize))
  })
})
