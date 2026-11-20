import { useId, useState, type DragEvent, type KeyboardEvent } from 'react'
import { useAssets } from '../assets/api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import * as actions from './actions'
import styles from './CardList.module.css'
import { useEditor } from './editorHooks'
import type { Card } from './model'

/**
 * The left-hand card list: select, add, duplicate, reorder (drag, or Alt+↑/↓), delete. Its
 * order is the export order.
 */
export function CardList() {
  const cards = useEditor((s) => s.cards)
  const selectedId = useEditor((s) => s.selectedId)
  const commit = useEditor((s) => s.commit)
  const select = useEditor((s) => s.select)
  const assets = useAssets()
  const [deleting, setDeleting] = useState<Card | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const hintId = useId()

  const firstFrame = assets.data?.frames[0]?.path ?? null

  function onDragOver(event: DragEvent<HTMLLIElement>, index: number) {
    if (!dragging) return
    event.preventDefault()
    const box = event.currentTarget.getBoundingClientRect()
    setDropIndex(event.clientY < box.top + box.height / 2 ? index : index + 1)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    if (dragging && dropIndex !== null) {
      const from = cards.findIndex((c) => c.id === dragging)
      // Dropping below its own slot shifts everything after it up by one.
      commit(actions.reorder(dragging, dropIndex > from ? dropIndex - 1 : dropIndex))
    }
    setDragging(null)
    setDropIndex(null)
  }

  function onKeyDown(event: KeyboardEvent, card: Card, index: number) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    commit(actions.reorder(card.id, index + (event.key === 'ArrowUp' ? -1 : 1)))
  }

  return (
    <div className={styles.panel}>
      <ol
        className={styles.list}
        aria-label="Cards"
        aria-describedby={hintId}
        onDragLeave={() => setDropIndex(null)}
      >
        {cards.map((card, index) => (
          <li
            key={card.id}
            className={[
              styles.item,
              card.id === selectedId ? styles.selected : '',
              card.id === dragging ? styles.dragging : '',
              dropIndex === index ? styles.dropBefore : '',
              dropIndex === index + 1 && index === cards.length - 1 ? styles.dropAfter : '',
            ].join(' ')}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', card.id)
              setDragging(card.id)
            }}
            onDragEnd={() => {
              setDragging(null)
              setDropIndex(null)
            }}
            onDragOver={(event) => onDragOver(event, index)}
            onDrop={onDrop}
            onClick={() => select(card.id)}
          >
            <span className={styles.grip} aria-hidden="true">
              ⋮⋮
            </span>
            <button
              type="button"
              className={styles.name}
              aria-current={card.id === selectedId ? 'true' : undefined}
              onKeyDown={(event) => onKeyDown(event, card, index)}
            >
              {card.name}
            </button>
            <span className={styles.copies} title="Copies" aria-label={`${card.copies} copies`}>
              ×{card.copies}
            </span>
            <button
              type="button"
              className={styles.icon}
              aria-label={`Duplicate ${card.name}`}
              title="Duplicate"
              onClick={(event) => {
                event.stopPropagation()
                commit(actions.duplicate(card.id))
              }}
            >
              ⧉
            </button>
            <button
              type="button"
              className={styles.icon}
              aria-label={`Delete ${card.name}`}
              title="Delete"
              onClick={(event) => {
                event.stopPropagation()
                setDeleting(card)
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      {cards.length === 0 && <p className={styles.empty}>No cards yet.</p>}
      <button type="button" className={styles.add} onClick={() => commit(actions.addCard(cards, firstFrame))}>
        + Add card
      </button>
      <p id={hintId} className={styles.hint}>
        Drag to reorder, or Alt+↑ / Alt+↓.
      </p>

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          confirmLabel="Delete card"
          danger
          onConfirm={() => {
            commit(actions.remove(deleting.id))
            setDeleting(null)
          }}
          onCancel={() => setDeleting(null)}
        >
          <p>You can undo this.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
