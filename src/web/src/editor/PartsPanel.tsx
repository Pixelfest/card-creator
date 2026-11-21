import { useAssets } from '../assets/api'
import { cardWarnings, type CardPart } from '../render/warnings'
import { useTextResources } from '../text/useTextResources'
import * as actions from './actions'
import { ArtworkProperties } from './ArtworkProperties'
import { CardProperties } from './CardProperties'
import { CornerIconProperties } from './CornerIconProperties'
import { useEditor } from './editorHooks'
import { FrameProperties } from './FrameProperties'
import { SNIPPET_SLOTS, type SnippetSlot } from './model'
import styles from './PartsPanel.module.css'
import { newSnippet, SLOT_LABELS } from './snippets'
import { SnippetProperties } from './SnippetProperties'

const PART_LABELS: Record<CardPart, string> = {
  card: 'Card',
  artwork: 'Artwork',
  frame: 'Frame',
  cornerIcons: 'Corner icons',
  ...SLOT_LABELS,
}
const PARTS: CardPart[] = ['card', 'artwork', 'frame', 'cornerIcons', ...SNIPPET_SLOTS]

const isSlot = (part: CardPart): part is SnippetSlot => (SNIPPET_SLOTS as readonly string[]).includes(part)

/**
 * The right-hand side: a column of part buttons beside the selected part's properties. An
 * empty snippet slot shows "+" and adds a snippet with that slot's defaults.
 */
export function PartsPanel() {
  const part = useEditor((s) => s.part)
  const selectPart = useEditor((s) => s.selectPart)
  const commit = useEditor((s) => s.commit)
  const card = useEditor((s) => s.cards.find((c) => c.id === s.selectedId))
  const manifest = useAssets().data
  const text = useTextResources()
  const warnings = card ? cardWarnings(card.design, manifest, text) : []

  function choose(p: CardPart) {
    if (card && isSlot(p) && !card.design.snippets[p]) {
      commit(actions.setSnippet(card.id, p, newSnippet(p, manifest?.fonts[0]?.path ?? null)))
    }
    selectPart(p)
  }

  // An emptied slot (removed, or undone) falls back to the Card part.
  const shown: CardPart = card && isSlot(part) && !card.design.snippets[part] ? 'card' : part

  return (
    <div className={styles.panel}>
      <nav className={styles.parts} aria-label="Card parts">
        {PARTS.map((p) => {
          const empty = card && isSlot(p) && !card.design.snippets[p]
          const warned = warnings.some((w) => w.part === p)
          return (
            <button
              key={p}
              type="button"
              className={p === shown ? styles.active : empty ? styles.empty : undefined}
              aria-pressed={p === shown}
              onClick={() => choose(p)}
              disabled={!card}
            >
              {empty ? `+ ${PART_LABELS[p]}` : PART_LABELS[p]}
              {warned && (
                <span className={styles.warn} aria-label="has a warning">
                  {' '}
                  ⚠
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <section className={styles.properties} aria-label={`${PART_LABELS[shown]} properties`}>
        {!card || shown === 'card' ? (
          <CardProperties />
        ) : shown === 'artwork' ? (
          <ArtworkProperties />
        ) : shown === 'frame' ? (
          <FrameProperties />
        ) : shown === 'cornerIcons' ? (
          <CornerIconProperties />
        ) : (
          <SnippetProperties slot={shown} />
        )}
      </section>
    </div>
  )
}
