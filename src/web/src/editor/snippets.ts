import type { Snippet, SnippetSlot } from './model'

export const MIN_SIZE = 5
export const MAX_SIZE = 36
export const MIN_SNIPPET_ZOOM = 25
export const MAX_SNIPPET_ZOOM = 200
export const MIN_OUTLINE_THICKNESS = 2
export const MAX_OUTLINE_THICKNESS = 30
/** The outline width a snippet gets when it has not chosen one, as a % of the font size. */
export const DEFAULT_OUTLINE_THICKNESS = 12

export const SLOT_LABELS: Record<SnippetSlot, string> = { header: 'Header', banner: 'Banner', textbox: 'Textbox' }

/**
 * Where a newly added snippet goes (docs/spec.md, section 6): header 6% / 80%, banner
 * 16% / 90%, textbox 80% / 85% (vertical centre / zoom); textbox 9 pt, the others 12 pt.
 */
export const SLOT_DEFAULTS: Record<SnippetSlot, Pick<Snippet, 'position' | 'zoom' | 'size' | 'text'>> = {
  header: { position: 6, zoom: 80, size: 12, text: 'Header' },
  banner: { position: 16, zoom: 90, size: 12, text: 'Banner' },
  textbox: { position: 80, zoom: 85, size: 9, text: 'Text' },
}

export function newSnippet(slot: SnippetSlot, firstFont: string | null): Snippet {
  return {
    ...SLOT_DEFAULTS[slot],
    font: firstFont,
    color: '#000000',
    outline: false,
    outlineColor: '#ffffff',
    align: 'center',
    background: null,
  }
}

/** Bottom to top: the header is drawn last, so it sits on top. Hit-testing goes the other way. */
export const SNIPPET_DRAW_ORDER: readonly SnippetSlot[] = ['textbox', 'banner', 'header']
