import { useAssets } from '../assets/api'
import { cardWarnings, type CardPart } from '../render/warnings'
import { CardProperties } from './CardProperties'
import { useEditor } from './editorHooks'
import { FrameProperties } from './FrameProperties'
import styles from './PartsPanel.module.css'

/** Parts available so far; Artwork (#23) and the three snippet slots (#25) join this list. */
const PARTS: { part: CardPart; label: string }[] = [
  { part: 'card', label: 'Card' },
  { part: 'frame', label: 'Frame' },
]

/** The right-hand side: a column of part buttons beside the selected part's properties. */
export function PartsPanel() {
  const part = useEditor((s) => s.part)
  const selectPart = useEditor((s) => s.selectPart)
  const card = useEditor((s) => s.cards.find((c) => c.id === s.selectedId))
  const manifest = useAssets().data
  const warnings = card ? cardWarnings(card.design, manifest) : []

  return (
    <div className={styles.panel}>
      <nav className={styles.parts} aria-label="Card parts">
        {PARTS.map(({ part: p, label }) => {
          const warned = warnings.some((w) => w.part === p)
          return (
            <button
              key={p}
              type="button"
              className={p === part ? styles.active : undefined}
              aria-pressed={p === part}
              onClick={() => selectPart(p)}
              disabled={!card}
            >
              {label}
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
      <section className={styles.properties} aria-label={`${PARTS.find((p) => p.part === part)?.label} properties`}>
        {part === 'frame' && card ? <FrameProperties /> : <CardProperties />}
      </section>
    </div>
  )
}
