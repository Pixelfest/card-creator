import { describe, expect, it } from 'vitest'
import { graphemes, wrapText } from './wrap'

/** Every character (grapheme) is 1 unit wide. */
const width = (text: string) => graphemes(text).length

describe('wrapText', () => {
  it('keeps text that fits on one line', () => {
    expect(wrapText('Fire dragon', 20, width)).toEqual({ lines: ['Fire dragon'], brokeWord: false })
  })

  it('breaks greedily between words, never inside one that fits', () => {
    expect(wrapText('The quick brown fox jumps', 10, width).lines).toEqual(['The quick', 'brown fox', 'jumps'])
  })

  it('honours explicit newlines, including empty lines', () => {
    expect(wrapText('Attack 3\n\nDefence 2', 20, width).lines).toEqual(['Attack 3', '', 'Defence 2'])
  })

  it('keeps punctuation with its word', () => {
    expect(wrapText('Hello, world!', 7, width).lines).toEqual(['Hello,', 'world!'])
  })

  it('drops spaces at the edges of wrapped lines', () => {
    expect(wrapText('aaaa    bbbb', 5, width).lines).toEqual(['aaaa', 'bbbb'])
  })

  it('splits a word wider than the line by grapheme, and says so', () => {
    expect(wrapText('Supercalifragilistic', 8, width)).toEqual({
      lines: ['Supercal', 'ifragili', 'stic'],
      brokeWord: true,
    })
  })

  it('never splits an emoji ZWJ sequence or a flag', () => {
    const family = '👨‍👩‍👧' // one grapheme, several code points
    const flag = '🇳🇱'
    const lines = wrapText(`${family}${family}${flag}${flag}`, 2, width).lines
    expect(lines).toEqual([`${family}${family}`, `${flag}${flag}`])
  })

  it('gives one empty line for empty text', () => {
    expect(wrapText('', 10, width).lines).toEqual([''])
  })
})
