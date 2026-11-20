import type { Measurer } from './layout'
import { graphemes } from './wrap'

// Colour emoji (docs/spec.md, section 6; research §4): never through fillText/strokeText,
// whose result depends on the OS emoji font. Text is split into text runs and emoji runs; each
// emoji is drawn as a bundled, same-origin Twemoji SVG with drawImage and measured as a fixed
// advance, so wrapping and output are the same in every browser.

/** Drawn size of an emoji, as a share of the font size. */
export const EMOJI_SIZE = 1
/** Horizontal room an emoji takes in a line, as a share of the font size. */
export const EMOJI_ADVANCE = 1.1

export type Run = { kind: 'text'; text: string } | { kind: 'emoji'; text: string; file: string }

const pictographic = /\p{Extended_Pictographic}/u
// Shown as emoji by default, or forced by VS16, a skin tone, or being part of a ZWJ sequence.
const emojiPresentation = /\p{Emoji_Presentation}|️|\p{Emoji_Modifier}|‍/u
const flag = /^\p{Regional_Indicator}{2}$/u
const keycap = /^[0-9#*]️?⃣$/u
// Subdivision flags (England, Scotland, Wales): black flag + tag characters.
const tagFlag = /^\u{1F3F4}[\u{E0061}-\u{E007A}]+\u{E007F}$/u

/** Whether one grapheme is an emoji to draw as an image (© typed as text stays text). */
export function isEmoji(grapheme: string): boolean {
  if (flag.test(grapheme) || keycap.test(grapheme) || tagFlag.test(grapheme)) return true
  return pictographic.test(grapheme) && emojiPresentation.test(grapheme)
}

/**
 * Twemoji's file name for an emoji: its code points in lowercase hex joined by "-", with
 * U+FE0F left out unless the sequence contains a ZWJ (Twemoji's own naming rule).
 */
export function emojiFile(grapheme: string): string {
  const points = Array.from(grapheme, (c) => c.codePointAt(0)!)
  const kept = grapheme.includes('‍') ? points : points.filter((p) => p !== 0xfe0f)
  return kept.map((p) => p.toString(16)).join('-')
}

/** Splits text into alternating text and emoji runs, grapheme by grapheme. */
export function splitRuns(text: string): Run[] {
  const runs: Run[] = []
  for (const g of graphemes(text)) {
    if (isEmoji(g)) {
      runs.push({ kind: 'emoji', text: g, file: emojiFile(g) })
      continue
    }
    const last = runs.at(-1)
    if (last?.kind === 'text') last.text += g
    else runs.push({ kind: 'text', text: g })
  }
  return runs
}

/** All emoji files a piece of text needs. */
export function emojiFiles(text: string): string[] {
  return splitRuns(text).flatMap((r) => (r.kind === 'emoji' ? [r.file] : []))
}

/** Wraps a text measurer so emoji count as a fixed advance instead of their font glyphs. */
export function withEmoji(measurer: Measurer): Measurer {
  return {
    metrics: measurer.metrics,
    width(text, family, size) {
      let width = 0
      for (const run of splitRuns(text)) {
        width += run.kind === 'emoji' ? EMOJI_ADVANCE * size : measurer.width(run.text, family, size)
      }
      return width
    },
  }
}
