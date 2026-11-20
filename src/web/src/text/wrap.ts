// A greedy line wrapper (docs/spec.md, section 6; research/canvas-text-rendering.md §2).
// Canvas does not wrap, and `maxWidth` squeezes glyphs differently per browser, so lines are
// measured and broken here: split on "\n", break between words, and only split a word that is
// wider than the line by grapheme, so emoji sequences and flags never break apart.

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (s) => s.segment)
}

/** Words and the whitespace between them, in order ("a b" → ["a", " ", "b"]). */
export function wordPieces(text: string): string[] {
  return Array.from(wordSegmenter.segment(text), (s) => s.segment)
}

export type Wrapped = {
  lines: string[]
  /** A single word was wider than the line and had to be split. */
  brokeWord: boolean
}

/** Wraps `text` into lines no wider than `maxWidth`, as measured by `width`. */
export function wrapText(text: string, maxWidth: number, width: (text: string) => number): Wrapped {
  const lines: string[] = []
  let brokeWord = false

  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const piece of mergeNonSpace(wordPieces(paragraph))) {
      const isSpace = /^\s+$/.test(piece)
      if (isSpace) {
        // Spaces only matter between words on the same line.
        if (line) line += piece
        continue
      }
      const candidate = line + piece
      if (width(candidate.trimEnd()) <= maxWidth) {
        line = candidate
        continue
      }
      if (line.trim()) lines.push(line.trimEnd())
      line = ''
      if (width(piece) <= maxWidth) {
        line = piece
        continue
      }
      // A word wider than the whole line: break it by grapheme.
      brokeWord = true
      for (const g of graphemes(piece)) {
        if (line && width(line + g) > maxWidth) {
          lines.push(line)
          line = ''
        }
        line += g
      }
    }
    lines.push(line.trimEnd())
  }
  return { lines, brokeWord }
}

/**
 * Word segmentation splits punctuation ("Hello," → "Hello", ","), which must stay attached to
 * its word; join every run of non-space pieces.
 */
function mergeNonSpace(pieces: string[]): string[] {
  const merged: string[] = []
  for (const piece of pieces) {
    const isSpace = /^\s+$/.test(piece)
    const last = merged.at(-1)
    if (!isSpace && last !== undefined && !/^\s+$/.test(last)) merged[merged.length - 1] = last + piece
    else merged.push(piece)
  }
  return merged
}
