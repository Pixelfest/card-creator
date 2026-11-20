import { describe, expect, it } from 'vitest'
import { parseBlocks } from './parseMarkdown'

describe('parseBlocks', () => {
  it('splits headings, lists and paragraphs', () => {
    const blocks = parseBlocks(
      ['# Credits', '', '## Fonts', '', '- **Cinzel** by', '  the authors', '- Lato', '', 'Some', 'text.'].join('\n'),
    )

    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Credits' },
      { kind: 'heading', level: 2, text: 'Fonts' },
      { kind: 'list', items: ['**Cinzel** by the authors', 'Lato'] },
      { kind: 'paragraph', text: 'Some text.' },
    ])
  })

  it('drops HTML comments, including multi-line ones', () => {
    expect(parseBlocks('A\n\n<!-- hidden\nstill hidden -->\n\nB')).toEqual([
      { kind: 'paragraph', text: 'A' },
      { kind: 'paragraph', text: 'B' },
    ])
  })

  it('handles Windows line endings and an empty file', () => {
    expect(parseBlocks('# A\r\n\r\nB')).toEqual([
      { kind: 'heading', level: 1, text: 'A' },
      { kind: 'paragraph', text: 'B' },
    ])
    expect(parseBlocks('')).toEqual([])
  })
})
