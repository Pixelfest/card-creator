import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { NameInput } from '../components/NameInput'
import * as actions from './actions'
import styles from './CardProperties.module.css'
import { useEditor } from './editorHooks'
import { MAX_COPIES, type Card } from './model'

/** The Card part: name (saved on blur), Copies (an integer ≥ 0) and the fill colour. */
export function CardProperties() {
  const card = useEditor((s) => s.cards.find((c) => c.id === s.selectedId))
  const commit = useEditor((s) => s.commit)

  if (!card) return <p className={styles.hint}>Select a card, or add one.</p>

  return (
    <div className={styles.fields}>
      <label className={styles.field}>
        <span>Name</span>
        <NameInput
          value={card.name}
          label="Card name"
          className={styles.input}
          onCommit={async (name) => commit(actions.update(card.id, { name }))}
        />
      </label>
      <CopiesInput key={`${card.id}:${card.copies}`} card={card} onCommit={(copies) => commit(actions.update(card.id, { copies }))} />
      <FillColour key={`${card.id}:${card.design.fill}`} card={card} />
    </div>
  )
}

function CopiesInput({ card, onCommit }: { card: Card; onCommit: (copies: number) => void }) {
  const [draft, setDraft] = useState(String(card.copies))

  function commit() {
    const copies = Number(draft)
    if (draft.trim() === '' || !Number.isInteger(copies) || copies < 0 || copies > MAX_COPIES) {
      setDraft(String(card.copies))
      return
    }
    onCommit(copies)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  return (
    <label className={styles.field}>
      <span>Copies</span>
      <input
        type="number"
        min={0}
        max={MAX_COPIES}
        step={1}
        inputMode="numeric"
        className={styles.input}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {card.copies === 0 && <small className={styles.hint}>Copies 0: this card is left out of the export.</small>}
    </label>
  )
}

/**
 * The fill colour behind everything. Shown live while the picker is open, saved (and one undo
 * step) when it closes: the native `change` event, which React's onChange does not expose.
 */
export function FillColour({ card }: { card: Card }) {
  const input = useRef<HTMLInputElement>(null)
  const commit = useEditor((s) => s.commit)
  const setPreview = useEditor((s) => s.setPreview)

  useEffect(() => {
    const element = input.current
    if (!element) return
    const onClose = () => {
      commit(actions.updateDesign(card.id, { fill: element.value }))
      setPreview(null)
    }
    element.addEventListener('change', onClose)
    return () => element.removeEventListener('change', onClose)
  }, [card.id, commit, setPreview])

  return (
    <label className={styles.field}>
      <span>Fill colour</span>
      <span className={styles.colour}>
        <input
          ref={input}
          type="color"
          defaultValue={card.design.fill}
          onInput={(event) => setPreview({ cardId: card.id, design: { fill: event.currentTarget.value } })}
        />
        <code>{card.design.fill}</code>
      </span>
      <small className={styles.hint}>Shows wherever the Artwork doesn't cover the card.</small>
    </label>
  )
}
